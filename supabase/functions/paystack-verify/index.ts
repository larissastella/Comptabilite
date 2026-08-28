// Called from Billing.tsx when the customer returns from Paystack's
// hosted checkout to callback_url (?paystack_return=1&reference=...).
// Re-checks the transaction status directly against Paystack's API
// (never trusts the callback URL query params on their own — those are
// just a browser redirect, anyone could craft that URL). paystack-webhook
// is the async safety net for the case where the browser tab closes
// before this fires.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYSTACK_BASE_URL = "https://api.paystack.co";

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

    const { reference, tenant_id } = await req.json();
    if (!reference || !tenant_id) throw new Error("reference and tenant_id are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // This row only exists if paystack-checkout actually issued this
    // exact reference for this exact tenant — closes the same "arbitrary
    // tenant_id" gap fixed for Flutterwave's webhook.
    const { data: txRow } = await serviceClient
      .from("paystack_transactions").select("*").eq("reference", reference).eq("tenant_id", tenant_id).maybeSingle();
    if (!txRow) {
      return new Response(JSON.stringify({ error: "This transaction was not initiated for this account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const verifyRes = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyJson.message || "Could not verify the transaction with Paystack");

    const data = verifyJson.data;
    if (data.status !== "success") {
      await serviceClient.from("paystack_transactions").update({ status: data.status ?? "failed" }).eq("reference", reference);
      return new Response(JSON.stringify({ error: `Paiement non confirmé (statut: ${data.status})` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paystack returns amount in subunits (cents) — compare like-for-like
    // against our stored expected amount (converted the same way).
    const chargedAmount = Number(data.amount) / 100;
    if (chargedAmount < txRow.expected_amount || data.currency !== txRow.currency) {
      await logFunctionError("paystack-verify", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id, reference, expected: txRow.expected_amount, charged: chargedAmount, currency: data.currency,
      });
      return new Response(JSON.stringify({ error: "Le montant du paiement ne correspond pas au forfait sélectionné. Contacte le support." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await serviceClient.from("paystack_transactions").update({ status: "success", confirmed_at: new Date().toISOString() }).eq("reference", reference);
    await serviceClient.from("tenants").update({
      plan: txRow.plan,
      subscription_status: "active",
      locked_price_usd: txRow.expected_amount,
    }).eq("id", tenant_id);

    return new Response(JSON.stringify({ success: true, plan: txRow.plan }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("paystack-verify", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
