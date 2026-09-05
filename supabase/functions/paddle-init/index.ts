// Registers a pending row in paddle_transactions BEFORE the Paddle.js
// checkout overlay opens client-side, and returns a checkout_ref to embed
// in that checkout's customData.
//
// Why this exists: Paddle Billing v2's checkout runs entirely client-side
// (Paddle.Checkout.open({ customData })) — there is no server-created
// checkout session the way Stripe/PayUnit/Paystack have one. Without this
// step, paddle-webhook would have nothing to check the event's customData
// against, and anyone could hand-craft a fake customData.tenant_id in
// their own browser JS. Requiring the webhook to only activate a plan
// when customData.checkout_ref matches a still-pending row created by an
// authenticated admin of that exact tenant closes that gap — same
// approach as flutterwave-init for Flutterwave's inline widget.
//
// Called from Billing.tsx with { tenant_id, plan } before opening the
// Paddle checkout overlay.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Kept in sync with PLANS in src/pages/app/Billing.tsx and every other
// PSP function's PLAN_PRICE_USD — the amount paddle-webhook will require
// the confirmed transaction to actually match before activating a plan.
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
    const expectedAmount = PLAN_PRICE_USD[plan];
    if (!expectedAmount) throw new Error("Unknown plan");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can manage billing" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const checkoutRef = crypto.randomUUID();
    const { error: insertError } = await serviceClient.from("paddle_transactions").insert({
      checkout_ref: checkoutRef,
      tenant_id,
      plan,
      expected_amount: expectedAmount,
      currency: "USD",
      status: "pending",
    });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ checkout_ref: checkoutRef }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logFunctionError("paddle-init", err, {});
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
