// Verifies a Flutterwave transaction right after the INLINE (embedded)
// checkout completes on the frontend, and activates the tenant's plan
// immediately -- no redirect, no waiting for the async webhook.
//
// The webhook (flutterwave-webhook) still exists and stays active as a
// safety net (e.g. if the browser tab closes before this call fires),
// but this function gives the user instant confirmation inside the app.
//
// Requires the Edge Function secret: FLUTTERWAVE_SECRET_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Source of truth for what each plan actually costs. The inline widget's
// `amount` comes from the browser (see Billing.tsx), which is editable via
// devtools before the payment is submitted -- so unlike the Stripe flow
// (which references a server-defined Price ID and can't be tampered with
// this way), we MUST re-check the amount Flutterwave actually confirms was
// charged against this table before ever activating a plan. Keep in sync
// with PLANS in src/pages/app/Billing.tsx.
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

    const { transaction_id, tenant_id } = await req.json();
    if (!transaction_id || !tenant_id) throw new Error("transaction_id and tenant_id are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Never trust the frontend's word that "payment succeeded" -- always
    // re-verify directly against Flutterwave's API using the transaction id
    // it gave us in the inline checkout's success callback.
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verified = await verifyRes.json();

    if (!verifyRes.ok || verified.status !== "success" || verified.data?.status !== "successful") {
      return new Response(JSON.stringify({ error: "Payment could not be verified" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = verified.data.meta || {};
    if (meta.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: "Transaction does not match this account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenantRow } = await serviceClient.from("tenants").select("flutterwave_last_tx_ref").eq("id", tenant_id).maybeSingle();
    if (!tenantRow || tenantRow.flutterwave_last_tx_ref !== verified.data.tx_ref) {
      return new Response(JSON.stringify({ error: "This transaction was not initiated for this account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expectedPrice = PLAN_PRICE_USD[meta.plan as string];
    const chargedAmount = Number(verified.data.charged_amount ?? verified.data.amount);
    const chargedCurrency = String(verified.data.currency ?? "");
    if (!expectedPrice || chargedCurrency !== "USD" || chargedAmount < expectedPrice) {
      await logFunctionError("flutterwave-verify", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id, transaction_id, meta_plan: meta.plan, expectedPrice, chargedAmount, chargedCurrency,
      });
      return new Response(JSON.stringify({ error: "Le montant du paiement ne correspond pas au forfait sélectionné. Contacte le support." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // A card payment (not Mobile Money) returns a reusable token here —
    // save it so flutterwave-auto-renew can charge future cycles without
    // the customer re-entering card details. Mobile Money charges never
    // have a card object/token: those stay manual-renewal + reminder
    // email, since MoMo requires the customer's live phone authorization
    // for every charge by design — there's no silent-recharge option.
    const cardToken = verified.data.card?.token as string | undefined;

    await serviceClient.from("tenants").update({
      subscription_status: "active",
      flutterwave_customer_id: String(verified.data.customer?.id ?? ""),
      ...(meta.plan ? { plan: meta.plan } : {}),
      ...(cardToken ? {
        flutterwave_card_token: cardToken,
        auto_renew: true,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      } : {
        auto_renew: false,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }),
    }).eq("id", tenant_id);

    return new Response(JSON.stringify({ success: true, plan: meta.plan, auto_renew: !!cardToken }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("flutterwave-verify", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
