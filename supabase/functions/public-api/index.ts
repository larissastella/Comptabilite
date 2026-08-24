// Public API for Enterprise-plan tenants. Authenticate with:
//   Authorization: Bearer lbk_xxxxxxxxxxxxx
//
// Endpoints (all relative to /functions/v1/public-api, /v1/ prefix
// optional for forward-compatibility — e.g. both /invoices and
// /v1/invoices work identically today):
//   GET  /invoices              list sales invoices (paginated, ?limit=&offset=)
//   GET  /invoices/:id          a single sales invoice with its line items
//   POST /transactions          create a journal transaction (requires 'write' scope)
//                                supports an `Idempotency-Key` header — retry
//                                the same request with the same key and you'll
//                                get back the original response instead of a
//                                duplicate transaction.
//   GET  /balance                account balances summary
//
// Rate limit: 100 requests/minute per API key. Exceeding it returns 429.
//
// This is intentionally a small, well-documented surface rather than
// exposing the whole schema — easier to keep stable for integrators.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
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

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let tenantIdForLogging: string | undefined;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "");
    if (!apiKey.startsWith("lbk_")) {
      return json({ error: "Missing or invalid API key. Use: Authorization: Bearer lbk_..." }, 401);
    }

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: keyInfo, error: keyError } = await serviceClient.rpc("verify_api_key", { p_plaintext_key: apiKey });
    if (keyError || !keyInfo || keyInfo.length === 0) {
      return json({ error: "Invalid or revoked API key" }, 401);
    }
    const { tenant_id: tenantId, scopes } = keyInfo[0];
    tenantIdForLogging = tenantId;

    // Rate limit BEFORE doing any real work, keyed by the key's own hash
    // (not tenant_id — a tenant could have multiple keys, each gets its
    // own budget). We only have the plaintext key here, so hash it the
    // same way verify_api_key does (sha256) to look up the same counter.
    const keyHashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const keyHash = Array.from(new Uint8Array(keyHashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: allowed } = await serviceClient.rpc("check_api_rate_limit", { p_key_hash: keyHash, p_limit: 100 });
    if (allowed === false) {
      return json({ error: "Rate limit exceeded. Max 100 requests/minute per API key." }, 429);
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.replace(/^\/public-api\/?/, "").replace(/^v1\//, "").split("/").filter(Boolean);
    const resource = pathParts[0];
    const resourceId = pathParts[1];

    if (req.method === "GET" && resource === "invoices" && !resourceId) {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const offset = Number(url.searchParams.get("offset")) || 0;
      const { data, error, count } = await serviceClient
        .from("sales_invoices")
        .select("id, invoice_number, invoice_date, due_date, status, currency, subtotal, vat_amount, total, customer_id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("invoice_date", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return json({ data, pagination: { limit, offset, total: count } });
    }

    if (req.method === "GET" && resource === "invoices" && resourceId) {
      const { data: invoice, error } = await serviceClient
        .from("sales_invoices").select("*").eq("tenant_id", tenantId).eq("id", resourceId).maybeSingle();
      if (error) throw error;
      if (!invoice) return json({ error: "Invoice not found" }, 404);
      const { data: items } = await serviceClient
        .from("sales_invoice_items").select("*").eq("invoice_id", resourceId).order("sort_order");
      return json({ data: { ...invoice, items } });
    }

    if (req.method === "GET" && resource === "balance") {
      const { data, error } = await serviceClient
        .from("transaction_lines")
        .select("account_id, debit, credit, accounts(code, name, account_class)")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const byAccount: Record<string, { code: string; name: string; balance: number }> = {};
      for (const line of data || []) {
        const acc = line.accounts as unknown as { code: string; name: string } | null;
        const key = line.account_id as string;
        if (!byAccount[key]) byAccount[key] = { code: acc?.code || "", name: acc?.name || "", balance: 0 };
        byAccount[key].balance += Number(line.debit) - Number(line.credit);
      }
      return json({ data: Object.values(byAccount) });
    }

    if (req.method === "POST" && resource === "transactions") {
      if (!scopes.includes("write")) {
        return json({ error: "This API key does not have write access" }, 403);
      }

      // Idempotency: if the caller sent the same Idempotency-Key before,
      // return the exact same response instead of creating a second
      // transaction — this is what makes it safe for them to retry on
      // timeout/network error without double-posting to the ledger.
      const idempotencyKey = req.headers.get("Idempotency-Key");
      if (idempotencyKey) {
        const { data: existing } = await serviceClient
          .from("api_idempotency_keys").select("response_status, response_body")
          .eq("key_hash", keyHash).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing) {
          return json(existing.response_body, existing.response_status);
        }
      }

      const body = await req.json();
      const { description, transaction_date, lines } = body;
      if (!description || !Array.isArray(lines) || lines.length < 2) {
        return json({ error: "description and at least 2 lines are required" }, 400);
      }
      const totalDebit = lines.reduce((s: number, l: { debit?: number }) => s + (l.debit || 0), 0);
      const totalCredit = lines.reduce((s: number, l: { credit?: number }) => s + (l.credit || 0), 0);
      if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
        return json({ error: `Unbalanced entry: debit ${totalDebit} != credit ${totalCredit}` }, 400);
      }

      const { data: tx, error: txError } = await serviceClient
        .from("transactions")
        .insert({ tenant_id: tenantId, description, transaction_date: transaction_date || new Date().toISOString().slice(0, 10), is_posted: false })
        .select().single();
      if (txError) throw txError;

      const linesToInsert = lines.map((l: { account_id: string; debit?: number; credit?: number; description?: string }) => ({
        tenant_id: tenantId,
        transaction_id: tx.id,
        account_id: l.account_id,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || description,
      }));
      const { error: linesError } = await serviceClient.from("transaction_lines").insert(linesToInsert);
      if (linesError) throw linesError;

      const responseBody = { data: { id: tx.id, status: "created" } };
      if (idempotencyKey) {
        await serviceClient.from("api_idempotency_keys").insert({
          key_hash: keyHash, idempotency_key: idempotencyKey, tenant_id: tenantId,
          response_status: 201, response_body: responseBody,
        });
      }
      return json(responseBody, 201);
    }

    return json({ error: "Not found. See /public-api docs for available endpoints." }, 404);
  } catch (err) {
    // Never leak raw DB/internal error text to an external caller — log
    // the real detail for us, return a generic message to them.
    await logFunctionError("public-api", err, { tenant_id: tenantIdForLogging });
    return json({ error: "Internal error. If this persists, contact support with the approximate time of this request." }, 500);
  }
});
