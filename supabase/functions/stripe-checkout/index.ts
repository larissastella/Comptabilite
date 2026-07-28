// Creates a Stripe Checkout session so a tenant can subscribe to (or
// upgrade) a plan. Called from Billing.tsx with { plan, tenant_id }.
//
// Requires these Supabase Edge Function secrets to be set (Project
// Settings > Edge Functions > Secrets):
//   STRIPE_SECRET_KEY        - sk_live_... / sk_test_...
//   STRIPE_PRICE_STARTER     - price_... (monthly recurring price for Starter)
//   STRIPE_PRICE_PRO         - price_...
//   STRIPE_PRICE_PREMIUM     - price_...
//   STRIPE_PRICE_ENTERPRISE  - price_...
//   APP_URL                  - e.g. https://app.libooks.com (for redirect URLs)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRICE_ENV_BY_PLAN: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  premium: "STRIPE_PRICE_PREMIUM",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

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

    const { plan, tenant_id } = await req.json();
    const priceEnvKey = PRICE_ENV_BY_PLAN[plan];
    if (!priceEnvKey) throw new Error(`Unknown plan: ${plan}`);
    const priceId = Deno.env.get(priceEnvKey);
    if (!priceId) throw new Error(`${priceEnvKey} is not configured`);

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

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.libooks.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app/billing?checkout=success`,
      cancel_url: `${appUrl}/app/billing?checkout=cancelled`,
      subscription_data: { metadata: { tenant_id, plan } },
      metadata: { tenant_id, plan },
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
