// Verifies a Flutterwave transaction right after the INLINE (embedded)
// checkout completes on the frontend, and activates the tenant's plan
// immediately -- no redirect, no waiting for the async webhook.
//
// The webhook (flutterwave-webhook) still exists and stays active as a
// safety net (e.g. if the browser tab closes before this call fires),
// but this function gives the user instant confirmation inside the app.
//
// Requires the Edge Function secret: FLUTTERWAVE_SECRET_KEY
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
    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!secretKey) throw new Error("FLUTTERWAVE_SECRET_KEY is not configured");

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

    const { transaction_id, tenant_id } = await req.json();
    if (!transaction_id || !tenant_id) throw new Error("transaction_id and tenant_id are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Never trust the frontend's word that "payment succeeded" -- always
    // re-verify directly against Flutterwave's API using the transaction id
    // it gave us in the inline checkout's success callback.
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verified = await verifyRes.json();

    if (!verifyRes.ok || verified.status !== "success" || verified.data?.status !== "successful") {
      return new Response(JSON.stringify({ error: "Payment could not be verified" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = verified.data.meta || {};
    if (meta.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: "Transaction does not match this account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await serviceClient.from("tenants").update({
      subscription_status: "active",
      flutterwave_customer_id: String(verified.data.customer?.id ?? ""),
      ...(meta.plan ? { plan: meta.plan } : {}),
    }).eq("id", tenant_id);

    return new Response(JSON.stringify({ success: true, plan: meta.plan }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("flutterwave-verify", err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
