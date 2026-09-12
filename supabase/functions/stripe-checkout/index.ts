// Creates a Stripe Checkout session so a tenant can subscribe to (or
// upgrade) a plan. Called from Billing.tsx with { plan, tenant_id, cycle }.
//
// One of 5 supported PSPs (PayUnit, Flutterwave, Paystack, Stripe, Paddle).
// See PSP_AVAILABLE in src/pages/app/Billing.tsx — a provider only appears
// to real customers once its flag is flipped to true there (this function
// existing/working is not sufficient by itself).
//
// Price is computed inline (Stripe Checkout's price_data, no pre-created
// Price object needed) from PLAN_PRICE_USD below — same source of truth
// and same pattern already used by payunit-checkout/paystack-checkout, so
// there's nothing to keep in sync in the Stripe Dashboard when a price
// changes here. The Stripe Dashboard's Products/Prices catalog is simply
// not used by this integration.
//
// Requires these Supabase Edge Function secrets to be set (Project
// Settings > Edge Functions > Secrets):
//   STRIPE_SECRET_KEY               - sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SIGNING_SECRET   - whsec_... (set on stripe-webhook, see that function)
//   APP_URL                         - e.g. https://libooks.liafrik.com (for redirect URLs)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import Stripe from "npm:stripe@17";

async function logFunctionError(functionName: string, error: unknown, context: Record<string, unknown> = {}) {
  try {
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.from("function_errors").insert({
      function_name: functionName,
      tenant_id: (context.tenant_id as string) ?? null,
      message: message.slice(0, 2000),
      context,
    });
  } catch {
    // Never let error logging itself throw.
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Kept in sync with PLAN_PRICE_USD in every other PSP function and
// Billing.tsx's PLANS/ANNUAL_DISCOUNT.
const PLAN_PRICE_USD: Record<string, number> = {
  starter: 14,
  pro: 29,
  premium: 79,
  enterprise: 199,
};
const PLAN_NAMES: Record<string, string> = {
  starter: "LiBooks Starter",
  pro: "LiBooks Pro",
  premium: "LiBooks Premium",
  enterprise: "LiBooks Enterprise",
};
const ANNUAL_DISCOUNT = 0.20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { plan, tenant_id, cycle: rawCycle } = await req.json();
    const monthlyPrice = PLAN_PRICE_USD[plan];
    if (!monthlyPrice) throw new Error(`Unknown plan: ${plan}`);
    const cycle = rawCycle === "annual" ? "annual" : "monthly";
    const amount = cycle === "annual" ? Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT)) : monthlyPrice;

    // Service role to bypass RLS for the admin-membership check + tenant read/write.
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("*").eq("id", tenant_id).single();
    if (!tenant) throw new Error("Tenant not found");

    let customerId = tenant.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: tenant.name,
        metadata: { tenant_id },
      });
      customerId = customer.id;
      await serviceClient.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenant_id);
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://libooks.liafrik.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amount * 100),
          recurring: { interval: cycle === "annual" ? "year" : "month" },
          product_data: { name: PLAN_NAMES[plan] ?? plan },
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/app/billing?checkout=success`,
      cancel_url: `${appUrl}/app/billing?checkout=cancelled`,
      subscription_data: { metadata: { tenant_id, plan, cycle } },
      metadata: { tenant_id, plan, cycle },
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("stripe-checkout", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
