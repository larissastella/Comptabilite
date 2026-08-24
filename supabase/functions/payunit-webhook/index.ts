// PayUnit's notify_url, called server-to-server (no authenticated user
// context — this must independently re-verify everything, same as
// flutterwave-webhook). Async safety net in case the browser tab closes
// before payunit-verify's synchronous call fires on return.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const PAYUNIT_BASE_URL = "https://gateway.payunit.net";

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
  try {
    const apiUser = Deno.env.get("PAYUNIT_API_USER");
    const apiPassword = Deno.env.get("PAYUNIT_API_PASSWORD");
    const apiKey = Deno.env.get("PAYUNIT_API_KEY");
    const mode = Deno.env.get("PAYUNIT_MODE") ?? "test";
    if (!apiUser || !apiPassword || !apiKey) throw new Error("PayUnit credentials are not configured");

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transaction_id ?? body.data?.transaction_id;
    if (!transactionId) {
      return new Response(JSON.stringify({ received: true, action: "no_transaction_id" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only act on a transaction_id that payunit-checkout actually issued
    // and stashed — a webhook call for an unknown transaction_id can't be
    // tied to any tenant we're willing to modify.
    const { data: txRow } = await serviceClient
      .from("payunit_transactions").select("*").eq("transaction_id", transactionId).maybeSingle();
    if (!txRow) {
      return new Response(JSON.stringify({ received: true, action: "unknown_transaction" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (txRow.status === "success") {
      // Already activated (e.g. by payunit-verify) — idempotent no-op.
      return new Response(JSON.stringify({ received: true, action: "already_processed" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Never trust the webhook payload's own amount/status fields — always
    // independently re-fetch from PayUnit's API using our own credentials.
    const statusRes = await fetch(`${PAYUNIT_BASE_URL}/api/gateway/paymentstatus/${transactionId}`, {
      headers: {
        "x-api-key": apiKey,
        mode,
        Authorization: `Basic ${btoa(`${apiUser}:${apiPassword}`)}`,
      },
    });
    const statusJson = await statusRes.json();
    if (!statusRes.ok) throw new Error(statusJson.message || "Could not verify with PayUnit");

    const data = statusJson.data;
    if (data.transaction_status !== "SUCCESS") {
      await serviceClient.from("payunit_transactions").update({ status: data.transaction_status?.toLowerCase() ?? "failed" }).eq("transaction_id", transactionId);
      return new Response(JSON.stringify({ received: true, action: "not_successful" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const chargedAmount = Number(data.transaction_amount);
    if (chargedAmount < txRow.expected_amount) {
      await logFunctionError("payunit-webhook", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id: txRow.tenant_id, transaction_id: transactionId, expected: txRow.expected_amount, charged: chargedAmount,
      });
      return new Response(JSON.stringify({ received: true, action: "amount_mismatch" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    await serviceClient.from("payunit_transactions").update({ status: "success", confirmed_at: new Date().toISOString() }).eq("transaction_id", transactionId);
    await serviceClient.from("tenants").update({
      plan: txRow.plan,
      subscription_status: "active",
    }).eq("id", txRow.tenant_id);

    return new Response(JSON.stringify({ received: true, action: "activated" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await logFunctionError("payunit-webhook", err);
    // Always 200 to a webhook so the provider doesn't endlessly retry a
    // permanently-broken request; the error is logged for us to see.
    return new Response(JSON.stringify({ received: true, action: "error" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
