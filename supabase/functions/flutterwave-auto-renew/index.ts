// Scheduled daily (see .github/workflows/billing-cron.yml). Charges the
// saved Flutterwave card token for every tenant whose next_billing_date
// has arrived and who hasn't cancelled auto-renewal (auto_renew=true).
//
// Note on friction: by default Flutterwave may require 3DS/OTP
// authentication even on a tokenized charge, which isn't fully "silent."
// True zero-friction recurring (NOAUTH) requires asking Flutterwave
// support to enable it on the merchant account. Until then this still
// works, but some customers' banks may occasionally prompt them — that's
// a Flutterwave account setting, not something fixable in this code.
//
// Requires: FLUTTERWAVE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// and CRON_SECRET (shared secret the GitHub Actions workflow sends, since
// this endpoint has no logged-in user to authenticate as).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

// Note on locked_price_usd: this charges what the tenant actually locked
// in when they last paid/upgraded (tenants.locked_price_usd), NOT
// PLAN_PRICE_USD's current price for their plan. PLAN_PRICE_USD here is
// only a fallback for older rows that predate the locked_price_usd
// column (should be rare/none in practice, but better than charging $0
// or crashing). If prices change later, existing auto-renew customers
// keep paying what they signed up for — they're never silently switched
// to a higher price without explicitly re-subscribing/upgrading.
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
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  if (!secretKey) {
    return new Response(JSON.stringify({ error: "FLUTTERWAVE_SECRET_KEY is not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);

  const { data: dueTenants, error } = await serviceClient
    .from("tenants")
    .select("id, name, plan, flutterwave_card_token, locked_price_usd, billing_cycle")
    .eq("auto_renew", true)
    .eq("subscription_status", "active")
    .lte("next_billing_date", today)
    .not("flutterwave_card_token", "is", null);

  if (error) {
    await logFunctionError("flutterwave-auto-renew", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const results: Record<string, unknown>[] = [];

  for (const tenant of dueTenants ?? []) {
    const amount = tenant.locked_price_usd ?? PLAN_PRICE_USD[tenant.plan as string];
    if (!amount) {
      results.push({ tenant_id: tenant.id, outcome: "skipped_unknown_plan" });
      continue;
    }

    const txRef = `libooks-renew-${tenant.id}-${Date.now()}`;
    try {
      const chargeRes = await fetch("https://api.flutterwave.com/v3/tokenized-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretKey}` },
        body: JSON.stringify({
          token: tenant.flutterwave_card_token,
          currency: "USD",
          amount,
          email: `billing+${tenant.id}@libooks.com`,
          tx_ref: txRef,
          narration: `LiBooks — renouvellement ${tenant.plan}`,
        }),
      });
      const chargeJson = await chargeRes.json();

      if (!chargeRes.ok || chargeJson.status !== "success" || chargeJson.data?.status !== "successful") {
        // Charge failed (expired card, insufficient funds, bank declined,
        // etc.) — don't retry silently forever; mark past_due so the
        // reminder job can email the tenant to update their payment method,
        // same as a normal failed-renewal flow anywhere else.
        await serviceClient.from("tenants").update({ subscription_status: "past_due" }).eq("id", tenant.id);
        results.push({ tenant_id: tenant.id, outcome: "charge_failed", detail: chargeJson.message });
        continue;
      }

      // Re-verify independently before extending access, same discipline
      // as every other payment path here — never trust the charge
      // response alone.
      const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${chargeJson.data.id}/verify`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const verified = await verifyRes.json();
      const chargedAmount = Number(verified.data?.charged_amount ?? verified.data?.amount ?? 0);
      if (!verifyRes.ok || verified.data?.status !== "successful" || chargedAmount < amount) {
        await serviceClient.from("tenants").update({ subscription_status: "past_due" }).eq("id", tenant.id);
        results.push({ tenant_id: tenant.id, outcome: "verify_failed" });
        continue;
      }

      // Renewing an annual subscription for another 30 days would charge
      // the FULL annual amount again a month later — this must track the
      // tenant's actual cycle (see migration 039), not assume monthly.
      const cycleDays = tenant.billing_cycle === "annual" ? 365 : 30;
      const nextDate = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await serviceClient.from("tenants").update({
        subscription_status: "active",
        next_billing_date: nextDate,
      }).eq("id", tenant.id);
      results.push({ tenant_id: tenant.id, outcome: "renewed", next_billing_date: nextDate });
    } catch (err) {
      await logFunctionError("flutterwave-auto-renew", err, { tenant_id: tenant.id });
      results.push({ tenant_id: tenant.id, outcome: "error" });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { status: 200, headers: { "Content-Type": "application/json" } });
});
