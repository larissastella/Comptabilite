// Initiates a Paystack hosted-checkout transaction for a tenant
// subscribing to (or upgrading) a plan. Called from Billing.tsx with
// { plan, tenant_id }.
//
// Like PayUnit, Paystack's checkout is a hosted redirect
// (authorization_url): `amount` is set HERE, server-side, at initialize
// time — never sent as an editable client-side JS parameter, unlike the
// Flutterwave inline widget. We still independently re-verify status +
// amount before ever activating a plan (paystack-verify/webhook) — a
// "successful" redirect back is never trusted on its own.
//
// Paystack amounts are in the SUBUNIT of the currency (e.g. cents for
// USD, kobo for NGN) — see PLAN_PRICE_USD below.
//
// Requires these Supabase Edge Function secrets:
//   PAYSTACK_SECRET_KEY   - sk_live_... / sk_test_..., from the Paystack dashboard
//   APP_URL                 - e.g. https://app.libooks.com (for callback_url)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Source of truth for plan prices, in sync with Billing.tsx PLANS and the
// equivalent tables in the other PSP functions. Paystack wants the
// amount in the SUBUNIT of the currency (cents for USD), hence *100.
const PLAN_PRICE_USD: Record<string, number> = {
  starter: 14,
  pro: 29,
  premium: 79,
  enterprise: 199,
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");

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
    const amount = PLAN_PRICE_USD[plan];
    if (!amount) throw new Error(`Unknown plan: ${plan}`);

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("id, name").eq("id", tenant_id).single();
    if (!tenant) throw new Error("Tenant not found");

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.libooks.com";
    const reference = `libooks-${tenant_id}-${Date.now()}`;

    const initRes = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(amount * 100), // subunit (cents)
        currency: "USD",
        reference,
        callback_url: `${appUrl}/app/billing?paystack_return=1`,
        metadata: { tenant_id, plan },
      }),
    });
    const initJson = await initRes.json();
    if (!initRes.ok || !initJson.status) {
      throw new Error(initJson.message || "Paystack could not initialize the transaction");
    }

    // Record BEFORE handing the redirect URL back — this is what lets
    // paystack-verify / paystack-webhook confirm the transaction really
    // was requested by this tenant's own admin for this exact
    // plan/amount, rather than trusting the callback/webhook payload alone.
    await serviceClient.from("paystack_transactions").insert({
      reference,
      tenant_id,
      plan,
      expected_amount: amount,
      currency: "USD",
      status: "pending",
    });

    return new Response(JSON.stringify({ url: initJson.data.authorization_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("paystack-checkout", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
