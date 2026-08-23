// Issues a server-generated tx_ref for a Flutterwave INLINE checkout and
// stashes it on the tenant row (flutterwave_last_tx_ref) BEFORE the
// payment widget opens client-side.
//
// Why this exists: the inline widget's tx_ref is otherwise built by the
// browser (see Billing.tsx / flutterwaveInline.ts) with no server
// involvement at all. flutterwave-webhook (the async safety-net path,
// used if the tab closes before the synchronous flutterwave-verify call
// fires) has no authenticated user context — it can only trust whatever
// `meta.tenant_id` is embedded in the Flutterwave transaction it's
// verifying. Since that `meta` is also just client-side JS parameters
// (window.FlutterwaveCheckout({ meta: {...} })), anyone could point it at
// an arbitrary tenant_id and, after paying Flutterwave themselves for
// real, have the webhook silently activate or change a plan on a tenant
// they have no membership in. Requiring the webhook to only act when
// `flutterwave_last_tx_ref` (set here, only reachable by an authenticated
// admin/owner of that specific tenant) matches the transaction's tx_ref
// closes that gap: a transaction can't grant access to a tenant unless
// that tenant's own admin session requested it right before paying.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

    const { tenant_id, plan } = await req.json();
    if (!tenant_id || !plan) throw new Error("tenant_id and plan are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const txRef = `libooks-${tenant_id}-${Date.now()}`;
    await serviceClient.from("tenants").update({ flutterwave_last_tx_ref: txRef }).eq("id", tenant_id);

    return new Response(JSON.stringify({ tx_ref: txRef }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("flutterwave-init", err, {});
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
