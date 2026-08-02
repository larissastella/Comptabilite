// Stripe webhook receiver — keeps tenants.subscription_status / plan in
// sync with what actually happened on Stripe's side. This is the piece
// that was completely missing before: the DB had stripe_customer_id /
// subscription_status columns but nothing ever updated them.
//
// Configure in the Stripe Dashboard: Developers > Webhooks > Add endpoint
//   URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
//           customer.subscription.updated, customer.subscription.deleted
//
// Requires these Edge Function secrets:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SIGNING_SECRET
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import Stripe from "npm:stripe@17";

async function logFunctionError(functionName, error, context = {}) {
  try {
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.from("function_errors").insert({
      function_name: functionName,
      tenant_id: context.tenant_id ?? null,
      message: message.slice(0, 2000),
      context,
    });
  } catch {
    // Never let error logging itself throw.
  }
}

const PLAN_BY_PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_STARTER: "starter",
  STRIPE_PRICE_PRO: "pro",
  STRIPE_PRICE_PREMIUM: "premium",
  STRIPE_PRICE_ENTERPRISE: "enterprise",
};

function resolvePlanFromPriceId(priceId: string): string | null {
  for (const [envKey, plan] of Object.entries(PLAN_BY_PRICE_ENV)) {
    if (Deno.env.get(envKey) === priceId) return plan;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const signingSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET");
  if (!stripeKey || !signingSecret) {
    return new Response("Webhook not configured", { status: 500 });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, signingSecret);
  } catch (err) {
    console.error("Signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function setTenantByCustomer(customerId: string, patch: Record<string, unknown>) {
    await serviceClient.from("tenants").update(patch).eq("stripe_customer_id", customerId);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const plan = session.metadata?.plan;
        if (tenantId) {
          await serviceClient.from("tenants").update({
            stripe_subscription_id: session.subscription as string,
            subscription_status: "active",
            ...(plan ? { plan } : {}),
          }).eq("id", tenantId);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await setTenantByCustomer(invoice.customer as string, { subscription_status: "active" });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await setTenantByCustomer(invoice.customer as string, { subscription_status: "past_due" });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id;
        const plan = priceId ? resolvePlanFromPriceId(priceId) : null;
        const status = sub.status === "active" ? "active" : sub.status === "past_due" ? "past_due" : sub.status === "canceled" ? "canceled" : "active";
        await setTenantByCustomer(sub.customer as string, {
          subscription_status: status,
          ...(plan ? { plan } : {}),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // Downgrade to read-only rather than deleting data — the tenant
        // keeps their records but can't create new ones until they resubscribe.
        await setTenantByCustomer(sub.customer as string, { subscription_status: "read_only" });
        break;
      }
      default:
        break; // ignore events we don't act on
    }
  } catch (err) {
    console.error("Error handling webhook event", event.type, err);
    await logFunctionError("stripe-webhook", err, { event_type: event.type });
    return new Response("Internal error handling event", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
