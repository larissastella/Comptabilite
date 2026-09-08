// Calls generate_due_recurring_invoices() (migration 012) on a schedule.
//
// This DB function has existed since migration 012 with no scheduler
// ever calling it, and no frontend UI to create a recurring_invoice_
// templates row in the first place — meaning the entire "recurring
// invoices" feature has been 100% non-functional for every tenant on
// every plan since it was built. This function is one half of the real
// fix (the other half is the template management UI in Settings/Sales).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await serviceClient.rpc("generate_due_recurring_invoices");
    if (error) throw error;

    return new Response(JSON.stringify({ generated: (data ?? []).length, details: data }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    try {
      const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await serviceClient.from("function_errors").insert({ function_name: "generate-recurring-invoices", message: message.slice(0, 2000) });
    } catch { /* never let error logging itself throw */ }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
