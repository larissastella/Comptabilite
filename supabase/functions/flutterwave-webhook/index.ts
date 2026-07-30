// Flutterwave webhook receiver. Flutterwave's webhook auth is a static
// shared secret header (not a cryptographic signature like Stripe), so
// as defense in depth this handler ALWAYS independently re-verifies the
// transaction against Flutterwave's API before trusting it or touching
// any tenant's subscription status — never trusts the webhook body alone.
//
// Configure in the Flutterwave Dashboard: Settings > Webhooks
//   URL: https://<project-ref>.supabase.co/functions/v1/flutterwave-webhook
//   Secret hash: set any random string here AND as the
//                FLUTTERWAVE_WEBHOOK_HASH secret below (they must match)
//
// Requires these Edge Function secrets:
//   FLUTTERWAVE_SECRET_KEY, FLUTTERWAVE_WEBHOOK_HASH
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

Deno.serve(async (req: Request) => {
  const expectedHash = Deno.env.get("FLUTTERWAVE_WEBHOOK_HASH");
  const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  if (!expectedHash || !secretKey) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const receivedHash = req.headers.get("verif-hash");
  if (receivedHash !== expectedHash) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = await req.json();
  const transactionId = body?.data?.id;
  if (!transactionId) {
    return new Response("Missing transaction id", { status: 400 });
  }

  // Defense in depth: re-fetch the transaction status directly from
  // Flutterwave rather than trusting the webhook payload's own "status"
  // field, since the hash check above is a shared secret, not a
  // cryptographic signature over the body.
  const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const verified = await verifyRes.json();

  if (!verifyRes.ok || verified.status !== "success" || verified.data?.status !== "successful") {
    // Not a confirmed successful payment -- ignore silently (could be a
    // failed/pending attempt notification, nothing to do).
    return new Response(JSON.stringify({ received: true, action: "ignored" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const meta = verified.data.meta || {};
  const tenantId = meta.tenant_id;
  const plan = meta.plan;
  if (!tenantId) {
    return new Response(JSON.stringify({ received: true, action: "no_tenant_in_meta" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Only apply if this transaction's tx_ref matches the one we stashed
  // when initiating checkout, so a replayed/forged tx_ref for a
  // different tenant can't grant access here.
  const { data: tenant } = await serviceClient.from("tenants").select("flutterwave_last_tx_ref").eq("id", tenantId).maybeSingle();
  if (!tenant || tenant.flutterwave_last_tx_ref !== verified.data.tx_ref) {
    return new Response(JSON.stringify({ received: true, action: "tx_ref_mismatch" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  await serviceClient.from("tenants").update({
    subscription_status: "active",
    flutterwave_customer_id: String(verified.data.customer?.id ?? ""),
    ...(plan ? { plan } : {}),
  }).eq("id", tenantId);

  return new Response(JSON.stringify({ received: true, action: "activated" }), { status: 200, headers: { "Content-Type": "application/json" } });
});
