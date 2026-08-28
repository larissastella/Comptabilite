// Paystack's webhook, called server-to-server. Unlike PayUnit (no
// documented signature scheme, defense relies purely on independent
// re-verification), Paystack DOES sign every webhook with the
// x-paystack-signature header: HMAC-SHA512 of the raw request body using
// the secret key. We verify that FIRST, before parsing anything — a
// request that fails signature verification is not from Paystack.
//
// Still async-safety-net: even a genuinely-signed webhook re-checks the
// amount and cross-references paystack_transactions before activating
// anything, same discipline as every other payment path here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

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

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY is not configured");

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";
    const expectedSignature = await hmacSha512Hex(secretKey, rawBody);

    if (signature !== expectedSignature) {
      // Not from Paystack — reject before doing anything else.
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody);
    if (body.event !== "charge.success") {
      // Not an event we act on — acknowledge and move on.
      return new Response(JSON.stringify({ received: true, action: "ignored_event" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const reference = body.data?.reference;
    if (!reference) {
      return new Response(JSON.stringify({ received: true, action: "no_reference" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only act on a reference that paystack-checkout actually issued and
    // stashed — a webhook event for an unknown reference can't be tied
    // to any tenant we're willing to modify.
    const { data: txRow } = await serviceClient
      .from("paystack_transactions").select("*").eq("reference", reference).maybeSingle();
    if (!txRow) {
      return new Response(JSON.stringify({ received: true, action: "unknown_transaction" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (txRow.status === "success") {
      // Already activated (e.g. by paystack-verify) — idempotent no-op.
      return new Response(JSON.stringify({ received: true, action: "already_processed" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Never trust the webhook payload's amount/status on their own —
    // always independently re-fetch from Paystack's API using our own
    // credentials, even though the signature already confirms origin.
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyJson.message || "Could not verify with Paystack");

    const data = verifyJson.data;
    if (data.status !== "success") {
      await serviceClient.from("paystack_transactions").update({ status: data.status ?? "failed" }).eq("reference", reference);
      return new Response(JSON.stringify({ received: true, action: "not_successful" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const chargedAmount = Number(data.amount) / 100;
    if (chargedAmount < txRow.expected_amount || data.currency !== txRow.currency) {
      await logFunctionError("paystack-webhook", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id: txRow.tenant_id, reference, expected: txRow.expected_amount, charged: chargedAmount, currency: data.currency,
      });
      return new Response(JSON.stringify({ received: true, action: "amount_mismatch" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    await serviceClient.from("paystack_transactions").update({ status: "success", confirmed_at: new Date().toISOString() }).eq("reference", reference);
    await serviceClient.from("tenants").update({
      plan: txRow.plan,
      subscription_status: "active",
      locked_price_usd: txRow.expected_amount,
    }).eq("id", txRow.tenant_id);

    return new Response(JSON.stringify({ received: true, action: "activated" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await logFunctionError("paystack-webhook", err);
    // Always 200 to a webhook so Paystack doesn't endlessly retry a
    // permanently-broken request; the error is logged for us to see.
    return new Response(JSON.stringify({ received: true, action: "error" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
