// Called from Billing.tsx when the customer lands back on
// /app/billing?payunit_return=1&transaction_id=... after the PayUnit
// hosted checkout page. Re-checks the transaction status directly against
// PayUnit's API (never trusts the return URL query params on their own —
// those are just a browser redirect, anyone could craft that URL) and
// activates the plan if genuinely paid. payunit-webhook is the async
// safety net for the case where the browser tab closes before this fires.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYUNIT_BASE_URL = "https://gateway.payunit.net";

// For locked_price_usd bookkeeping only (what was actually charged, in
// XAF, is txRow.expected_amount — this is just to record the USD
// equivalent consistently with every other PSP's locked_price_usd).
// Kept in sync with PLAN_PRICE_USD/ANNUAL_DISCOUNT in payunit-checkout
// and src/pages/app/Billing.tsx.
const PLAN_PRICE_USD: Record<string, number> = {
  starter: 14,
  pro: 29,
  premium: 79,
  enterprise: 199,
};
const ANNUAL_DISCOUNT = 0.20;
function usdPriceForCycle(plan: string, cycle: string): number {
  const monthly = PLAN_PRICE_USD[plan] ?? 0;
  return cycle === "annual" ? Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT)) : monthly;
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

    const { transaction_id, tenant_id } = await req.json();
    if (!transaction_id || !tenant_id) throw new Error("transaction_id and tenant_id are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // This row only exists if payunit-checkout issued this exact
    // transaction_id for this exact tenant — closes the same "arbitrary
    // tenant_id" gap that flutterwave-init/tx_ref closes for Flutterwave.
    const { data: txRow } = await serviceClient
      .from("payunit_transactions").select("*").eq("transaction_id", transaction_id).eq("tenant_id", tenant_id).maybeSingle();
    if (!txRow) {
      return new Response(JSON.stringify({ error: "This transaction was not initiated for this account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const statusRes = await fetch(`${PAYUNIT_BASE_URL}/api/gateway/paymentstatus/${transaction_id}`, {
      headers: {
        "x-api-key": apiKey,
        mode,
        Authorization: `Basic ${btoa(`${apiUser}:${apiPassword}`)}`,
      },
    });
    const statusJson = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusJson.message || "Could not verify the transaction with PayUnit");

    const data = statusJson.data;
    if (data.transaction_status !== "SUCCESS") {
      await serviceClient.from("payunit_transactions").update({ status: data.transaction_status?.toLowerCase() ?? "failed" }).eq("transaction_id", transaction_id);
      return new Response(JSON.stringify({ error: `Paiement non confirmé (statut: ${data.transaction_status})` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Re-check the amount PayUnit actually confirms against what we set
    // server-side at initialize time — defense in depth even though the
    // amount was never client-editable for this provider.
    const chargedAmount = Number(data.transaction_amount);
    if (chargedAmount < txRow.expected_amount) {
      await logFunctionError("payunit-verify", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id, transaction_id, expected: txRow.expected_amount, charged: chargedAmount,
      });
      return new Response(JSON.stringify({ error: "Le montant du paiement ne correspond pas au forfait sélectionné. Contacte le support." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await serviceClient.from("payunit_transactions").update({ status: "success", confirmed_at: new Date().toISOString() }).eq("transaction_id", transaction_id);
    // PayUnit is a one-off hosted redirect — there's no stored card token
    // to silently recharge later (unlike Flutterwave's card path), so
    // this is always manual renewal: billing-reminders emails the tenant
    // before next_billing_date, same as Flutterwave's Mobile Money path.
    // Bug fixed here: this used to never set next_billing_date at all,
    // meaning a single PayUnit payment granted access with no expiry,
    // ever — a real revenue leak, not just a cosmetic gap.
    const cycleDays = txRow.cycle === "annual" ? 365 : 30;
    await serviceClient.from("tenants").update({
      plan: txRow.plan,
      subscription_status: "active",
      billing_cycle: txRow.cycle,
      locked_price_usd: usdPriceForCycle(txRow.plan, txRow.cycle),
      auto_renew: false,
      next_billing_date: new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }).eq("id", tenant_id);

    return new Response(JSON.stringify({ success: true, plan: txRow.plan }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("payunit-verify", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
