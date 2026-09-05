// Paddle's webhook, called server-to-server whenever a checkout completes
// or a subscription's status changes.
//
// Paddle signs every webhook via the Paddle-Signature header, format
// "ts=<unix_seconds>;h1=<hex hmac>" — the hash covers "ts:rawBody" using
// PADDLE_WEBHOOK_SECRET (the signing secret from Paddle Dashboard >
// Developer Tools > Notifications > this endpoint, NOT the client-side
// token used to open the checkout widget). We verify that FIRST, before
// parsing anything, and reject a timestamp older than 5 minutes to close
// off replay of a captured, validly-signed request.
//
// Even a genuinely-signed "transaction.completed" event still gets its
// customData.checkout_ref cross-referenced against paddle_transactions
// (created by paddle-init, only reachable by an authenticated admin of
// that tenant) and its amount re-checked against what that plan actually
// costs, before any plan is activated — same discipline as every other
// PSP here. A signature proves the request came from Paddle; it does not
// prove the customData inside it wasn't edited client-side before the
// checkout was opened.
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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET");
    if (!secret) throw new Error("PADDLE_WEBHOOK_SECRET is not configured");

    const rawBody = await req.text();
    const sigHeader = req.headers.get("paddle-signature") ?? "";
    const parts = Object.fromEntries(sigHeader.split(";").map((p) => p.split("=") as [string, string]));
    const ts = parts["ts"];
    const h1 = parts["h1"];
    if (!ts || !h1) return new Response("Missing signature", { status: 401 });

    // Reject anything older than 5 minutes — closes off replaying a
    // captured, validly-signed request long after the fact.
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
      return new Response("Signature too old", { status: 401 });
    }

    const expected = await hmacSha256Hex(secret, `${ts}:${rawBody}`);
    if (expected !== h1) {
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Subscription lifecycle events: sync status on an already-
    // activated tenant (matched by paddle_subscription_id). Mirrors
    // stripe-webhook's customer.subscription.updated/deleted handling.
    if (body.event_type === "subscription.canceled") {
      const subId = body.data?.id;
      if (subId) {
        await serviceClient.from("tenants").update({ subscription_status: "read_only" }).eq("paddle_subscription_id", subId);
      }
      return new Response(JSON.stringify({ received: true, action: "subscription_canceled" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (body.event_type === "subscription.past_due") {
      const subId = body.data?.id;
      if (subId) {
        await serviceClient.from("tenants").update({ subscription_status: "past_due" }).eq("paddle_subscription_id", subId);
      }
      return new Response(JSON.stringify({ received: true, action: "subscription_past_due" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (body.event_type === "subscription.resumed" || body.event_type === "subscription.activated") {
      const subId = body.data?.id;
      if (subId) {
        await serviceClient.from("tenants").update({ subscription_status: "active" }).eq("paddle_subscription_id", subId);
      }
      return new Response(JSON.stringify({ received: true, action: "subscription_active" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (body.event_type !== "transaction.completed") {
      return new Response(JSON.stringify({ received: true, action: "ignored_event" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const data = body.data ?? {};
    const customData = data.custom_data ?? {};
    const checkoutRef = customData.checkout_ref;
    const tenantId = customData.tenant_id;
    if (!checkoutRef || !tenantId) {
      return new Response(JSON.stringify({ received: true, action: "missing_custom_data" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const { data: txRow } = await serviceClient
      .from("paddle_transactions").select("*").eq("checkout_ref", checkoutRef).maybeSingle();
    if (!txRow || txRow.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ received: true, action: "unknown_transaction" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (txRow.status === "success") {
      // Already activated — idempotent no-op (Paddle can redeliver events).
      return new Response(JSON.stringify({ received: true, action: "already_processed" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Paddle reports totals as a string in the currency's smallest unit
    // (e.g. cents for USD) — convert to major units before comparing.
    const chargedAmount = Number(data.details?.totals?.total ?? 0) / 100;
    const chargedCurrency = String(data.currency_code ?? "");
    if (chargedAmount < txRow.expected_amount || chargedCurrency !== txRow.currency) {
      await serviceClient.from("paddle_transactions").update({ status: "failed" }).eq("checkout_ref", checkoutRef);
      await logFunctionError("paddle-webhook", new Error("Amount mismatch — refusing to activate plan"), {
        tenant_id: tenantId, checkoutRef, expected: txRow.expected_amount, charged: chargedAmount, currency: chargedCurrency,
      });
      return new Response(JSON.stringify({ received: true, action: "amount_mismatch" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    await serviceClient.from("paddle_transactions").update({
      status: "success",
      confirmed_at: new Date().toISOString(),
      paddle_transaction_id: data.id ?? null,
    }).eq("checkout_ref", checkoutRef);

    await serviceClient.from("tenants").update({
      plan: txRow.plan,
      subscription_status: "active",
      locked_price_usd: txRow.expected_amount,
      paddle_customer_id: data.customer_id ?? null,
      paddle_subscription_id: data.subscription_id ?? null,
    }).eq("id", txRow.tenant_id);

    return new Response(JSON.stringify({ received: true, action: "activated" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await logFunctionError("paddle-webhook", err);
    // Always 200 so Paddle doesn't endlessly retry a permanently-broken
    // request; the error is logged for us to see instead.
    return new Response(JSON.stringify({ received: true, action: "error" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
