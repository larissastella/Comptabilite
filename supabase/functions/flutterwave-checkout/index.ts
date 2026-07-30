// Creates a Flutterwave payment link so a tenant can subscribe to (or
// upgrade) a plan using Mobile Money, local cards, or bank transfer —
// the payment methods most used across Africa, which Stripe doesn't
// cover well. Called from Billing.tsx with { plan, tenant_id }.
//
// Requires these Supabase Edge Function secrets:
//   FLUTTERWAVE_SECRET_KEY     - FLWSECK-... (from Flutterwave Dashboard > Settings > API)
//   FLUTTERWAVE_PLAN_STARTER   - recurring payment plan ID (see setup note below)
//   FLUTTERWAVE_PLAN_PRO       - ...
//   FLUTTERWAVE_PLAN_PREMIUM   - ...
//   FLUTTERWAVE_PLAN_ENTERPRISE- ...
//   APP_URL                    - e.g. https://app.libooks.com (for redirect)
//
// Setup note: a Flutterwave "Payment Plan" (recurring billing) is
// created once per plan/price via their API or Dashboard, e.g.:
//   POST https://api.flutterwave.com/v3/payment-plans
//   { "amount": 9, "name": "LiBooks Starter", "interval": "monthly", "currency": "USD" }
// The returned plan `id` is what goes in FLUTTERWAVE_PLAN_STARTER etc.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PLAN_ENV_BY_PLAN: Record<string, string> = {
  starter: "FLUTTERWAVE_PLAN_STARTER",
  pro: "FLUTTERWAVE_PLAN_PRO",
  premium: "FLUTTERWAVE_PLAN_PREMIUM",
  enterprise: "FLUTTERWAVE_PLAN_ENTERPRISE",
};

const PLAN_PRICE_USD: Record<string, number> = {
  starter: 9,
  pro: 19,
  premium: 69,
  enterprise: 189,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secretKey) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured");

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
    const planEnvKey = PLAN_ENV_BY_PLAN[plan];
    if (!planEnvKey) throw new Error(`Unknown plan: ${plan}`);
    const paymentPlanId = Deno.env.get(planEnvKey);

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("*").eq("id", tenant_id).single();
    if (!tenant) throw new Error("Tenant not found");

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.libooks.com";
    const txRef = `libooks-${tenant_id}-${Date.now()}`;

    const payload: Record<string, unknown> = {
      tx_ref: txRef,
      amount: PLAN_PRICE_USD[plan],
      currency: "USD",
      redirect_url: `${appUrl}/app/billing?checkout=success&provider=flutterwave`,
      customer: {
        email: user.email,
        name: tenant.name,
      },
      customizations: {
        title: "LiBooks",
        description: `Abonnement ${plan}`,
      },
      meta: { tenant_id, plan },
    };
    // If a recurring payment plan was configured for this tier, attach it
    // so Flutterwave bills automatically each period; otherwise this is a
    // one-off charge the tenant repeats manually (still fully functional,
    // just not auto-recurring until the plan ID is set up).
    if (paymentPlanId) payload.payment_plan = paymentPlanId;

    const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify(payload),
    });

    const fwData = await fwRes.json();
    if (!fwRes.ok || fwData.status !== "success") {
      throw new Error(fwData.message || "Flutterwave payment initialization failed");
    }

    // Store the tx_ref so the webhook can match this attempt back to a
    // tenant without trusting anything from the client at verification time.
    await serviceClient.from("tenants").update({ flutterwave_last_tx_ref: txRef }).eq("id", tenant_id);

    return new Response(JSON.stringify({ url: fwData.data.link }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
