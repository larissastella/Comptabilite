// Initiates a PayUnit hosted-checkout transaction for a tenant subscribing
// to (or upgrading) a plan. Called from Billing.tsx with { plan, tenant_id }.
// Replaces stripe-checkout (Stripe was dropped in favour of PayUnit for
// card payments; Flutterwave inline remains for Mobile Money).
//
// Unlike Flutterwave's inline widget, PayUnit's checkout is a hosted
// redirect page: `total_amount` is set HERE, server-side, at initialize
// time — never sent as an editable client-side JS parameter. That closes
// off the amount-tampering class of bug fixed for Flutterwave by design,
// no extra verification-time price check needed for that specific risk
// (we still re-verify status server-side before activating anything, same
// as every other provider here — a "successful" client-side redirect back
// is never trusted on its own).
//
// Requires these Supabase Edge Function secrets to be set:
//   PAYUNIT_API_USER      - from the merchant dashboard > API Credentials
//   PAYUNIT_API_PASSWORD  - from the merchant dashboard > API Credentials
//   PAYUNIT_API_KEY        - x-api-key, from the application settings
//   PAYUNIT_MODE            - "live" or "test"
//   APP_URL                  - e.g. https://libooks.liafrik.com (for redirect/notify URLs)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYUNIT_BASE_URL = "https://gateway.payunit.net";

// Source of truth for plan prices, in USD (matches Billing.tsx PLANS,
// LandingPage.tsx, and the Flutterwave functions). PayUnit's REST API
// (/api/gateway/initialize) only documents "currency: XAF" — the sample
// response in their own docs shows transaction_currency: "XAF" too, no
// USD example anywhere. Sending USD here risks every PayUnit payment
// failing at launch, so we charge in XAF, converted from USD using the
// SAME daily-synced rate Billing.tsx shows customers for reference (see
// fx-rates-sync + fx_rates, tenant_id IS NULL = platform-wide default) —
// no separate, manually-maintained XAF price list to let drift out of
// sync with reality. FALLBACK_XAF_PER_USD only kicks in on the very rare
// case fx-rates-sync hasn't populated a rate yet (e.g. right after first
// deploy, before the daily cron has run once) — review/update it
// occasionally so a *fallback* never drifts too far either.
const PLAN_PRICE_USD: Record<string, number> = {
  starter: 14,
  pro: 29,
  premium: 79,
  enterprise: 199,
};
const FALLBACK_XAF_PER_USD = 610;

async function getUsdToXafRate(serviceClient: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await serviceClient
    .from("fx_rates")
    .select("rate")
    .is("tenant_id", null)
    .eq("currency_from", "USD")
    .eq("currency_to", "XAF")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.rate ?? FALLBACK_XAF_PER_USD;
}

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
    const apiUser = Deno.env.get("PAYUNIT_API_USER");
    const apiPassword = Deno.env.get("PAYUNIT_API_PASSWORD");
    const apiKey = Deno.env.get("PAYUNIT_API_KEY");
    const mode = Deno.env.get("PAYUNIT_MODE") ?? "test";
    if (!apiUser || !apiPassword || !apiKey) throw new Error("PayUnit credentials are not configured");

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
    if (!PLAN_PRICE_USD[plan]) throw new Error(`Unknown plan: ${plan}`);

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const xafPerUsd = await getUsdToXafRate(serviceClient);
    const amount = Math.round(PLAN_PRICE_USD[plan] * xafPerUsd);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("id, name").eq("id", tenant_id).single();
    if (!tenant) throw new Error("Tenant not found");

    const appUrl = Deno.env.get("APP_URL") ?? "https://libooks.liafrik.com";
    const transactionId = `libooks-${tenant_id}-${Date.now()}`;

    const initRes = await fetch(`${PAYUNIT_BASE_URL}/api/gateway/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        mode,
        Authorization: `Basic ${btoa(`${apiUser}:${apiPassword}`)}`,
      },
      body: JSON.stringify({
        total_amount: amount,
        currency: "XAF",
        transaction_id: transactionId,
        return_url: `${appUrl}/app/billing?payunit_return=1&transaction_id=${transactionId}`,
        notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payunit-webhook`,
      }),
    });
    const initJson = await initRes.json();
    if (!initRes.ok || initJson.status !== "SUCCESS") {
      throw new Error(initJson.message || "PayUnit could not initialize the transaction");
    }

    // Record BEFORE handing the redirect URL back — this is what lets
    // payunit-verify / payunit-webhook confirm the transaction really was
    // requested by this tenant's own admin for this exact plan/amount,
    // rather than trusting anything in the redirect/webhook payload alone.
    await serviceClient.from("payunit_transactions").insert({
      transaction_id: transactionId,
      tenant_id,
      plan,
      expected_amount: amount,
      currency: "XAF",
      status: "pending",
    });

    return new Response(JSON.stringify({ url: initJson.data.transaction_url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("payunit-checkout", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
