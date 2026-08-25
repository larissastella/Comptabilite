// Scheduled daily (see .github/workflows/billing-cron.yml). Fetches
// USD-based exchange rates from a free, no-key, no-attribution-required
// public endpoint (open.er-api.com — a well-established open access
// mirror of exchangerate-api.com, ~166 currencies, updated daily) and
// stores them as platform-default rates (tenant_id = NULL) in fx_rates.
//
// This is what lets Billing.tsx show a tenant "this plan costs ~X in
// your currency" even though the platform's canonical price list
// (PLAN_PRICE_USD, used for actual billing/charging) is always in USD —
// display-only conversion, never used to decide what anyone is actually
// charged.
//
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

async function logFunctionError(functionName: string, error: unknown, context: Record<string, unknown> = {}) {
  try {
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const message = error instanceof Error ? error.message : String(error);
    await serviceClient.from("function_errors").insert({
      function_name: functionName,
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

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();
    if (json.result !== "success" || !json.rates) {
      throw new Error("Unexpected response from exchange rate provider");
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date().toISOString().slice(0, 10);

    const rows = Object.entries(json.rates as Record<string, number>)
      .filter(([code]) => code !== "USD")
      .map(([code, rate]) => ({
        tenant_id: null,
        currency_from: "USD",
        currency_to: code,
        rate,
        rate_date: today,
        source: "api" as const,
      }));

    // Chunk the upsert — a few hundred rows in one request is fine, but
    // keep it well under any request-size edge case.
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await serviceClient
        .from("fx_rates")
        .upsert(chunk, { onConflict: "currency_from,currency_to,rate_date" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ synced: rows.length, date: today }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await logFunctionError("fx-rates-sync", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
