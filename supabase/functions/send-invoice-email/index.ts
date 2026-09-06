// Actually sends the invoice by email, with the PDF attached — replacing
// what used to be a fake "Envoyer" button that only flipped a status
// column in the database without sending anything to anyone.
//
// The PDF bytes are generated client-side (same @react-pdf/renderer
// pattern already used for financial reports) and handed to this
// function as base64, because @react-pdf/renderer's layout engine is
// designed to run in a browser/Node DOM-ish environment, not the Deno
// edge runtime. What this function does NOT trust from the client:
// which invoice/customer/amount this is for, or the recipient email —
// all of that is re-fetched server-side from invoice_id alone, and the
// caller's tenant membership is verified, so this endpoint can't be used
// to email an arbitrary PDF to an arbitrary address under LiBooks' name.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NOTIFY_FROM = "LiBooks <noreply@liafrik.com>";

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

    const { invoice_id, pdf_base64 } = await req.json();
    if (!invoice_id || !pdf_base64) throw new Error("invoice_id and pdf_base64 are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Re-fetch everything server-side — the client only ever supplies the
    // invoice_id and the rendered PDF bytes, never the recipient or amount.
    const { data: invoice, error: fetchError } = await serviceClient
      .from("sales_invoices")
      .select("id, tenant_id, invoice_number, total, currency, status, customers(name, email)")
      .eq("id", invoice_id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!invoice) throw new Error("Invoice not found");

    const { data: membership } = await serviceClient
      .from("tenant_users").select("id").eq("tenant_id", invoice.tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const customer = invoice.customers as unknown as { name: string; email?: string } | null;
    if (!customer?.email) {
      return new Response(JSON.stringify({ error: "Ce client n'a pas d'adresse email enregistrée — impossible d'envoyer la facture par email. Ajoutez-en une sur sa fiche, ou utilisez WhatsApp." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("name").eq("id", invoice.tenant_id).maybeSingle();

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "L'envoi d'email n'est pas encore configuré (RESEND_API_KEY manquant côté serveur)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [customer.email],
        subject: `Facture ${invoice.invoice_number} — ${tenant?.name ?? "LiBooks"}`,
        html: `
          <p>Bonjour ${escapeHtml(customer.name)},</p>
          <p>Veuillez trouver ci-joint la facture <strong>${escapeHtml(invoice.invoice_number)}</strong>
          d'un montant de <strong>${invoice.total.toLocaleString("fr-FR")} ${escapeHtml(invoice.currency)}</strong>.</p>
          <p>Cordialement,<br>${escapeHtml(tenant?.name ?? "")}</p>
        `,
        attachments: [{
          filename: `Facture-${invoice.invoice_number}.pdf`,
          content: pdf_base64,
        }],
      }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Resend a refusé l'envoi: ${errText.slice(0, 300)}`);
    }

    await serviceClient.from("sales_invoices").update({
      status: invoice.status === "draft" ? "sent" : invoice.status,
      sent_at: new Date().toISOString(),
    }).eq("id", invoice_id);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
