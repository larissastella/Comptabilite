// Sends the actual invitation email — the missing half of the fix begun
// in migration 009 (create_tenant_invitation/accept_tenant_invitation
// already existed and worked, but UsersRoles.tsx never called them, and
// even once it does, creating the token alone doesn't get it to the
// invited person). Called from UsersRoles.tsx right after
// create_tenant_invitation() returns a token.
//
// Re-verifies tenant admin membership server-side rather than trusting
// that the client only calls this after a successful RPC — the RPC and
// this function are two separate network calls, so nothing here assumes
// the first one actually happened or that its result wasn't tampered with.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NOTIFY_FROM = "LiBooks <noreply@liafrik.com>";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  accountant: "Comptable",
  viewer: "Lecteur",
};

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

    const { tenant_id, token } = await req.json();
    if (!tenant_id || !token) throw new Error("tenant_id and token are required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: membership } = await serviceClient
      .from("tenant_users").select("role, is_owner").eq("tenant_id", tenant_id).eq("user_id", user.id).maybeSingle();
    if (!membership || (membership.role !== "admin" && !membership.is_owner)) {
      return new Response(JSON.stringify({ error: "Only a tenant admin can invite members" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Re-fetch the invitation itself server-side rather than trusting a
    // client-supplied email/role — the token is the only thing that
    // needs to round-trip; everything else about the invite is read back
    // from the row create_tenant_invitation() actually created.
    const { data: invite, error: inviteError } = await serviceClient
      .from("tenant_invitations")
      .select("email, role, status")
      .eq("token", token)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite || invite.status !== "pending") {
      return new Response(JSON.stringify({ error: "Invitation introuvable ou déjà traitée" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await serviceClient.from("tenants").select("name").eq("id", tenant_id).maybeSingle();

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "L'envoi d'email n'est pas encore configuré (RESEND_API_KEY manquant côté serveur)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://libooks.liafrik.com";
    const inviteUrl = `${appUrl}/invite/${token}`;
    const roleLabel = ROLE_LABELS[invite.role] ?? invite.role;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [invite.email],
        subject: `Invitation à rejoindre ${tenant?.name ?? "une entreprise"} sur LiBooks`,
        html: `
          <p>Bonjour,</p>
          <p>Vous avez été invité(e) à rejoindre <strong>${escapeHtml(tenant?.name ?? "")}</strong> sur LiBooks,
          avec le rôle <strong>${escapeHtml(roleLabel)}</strong>.</p>
          <p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#0057D9;color:#fff;border-radius:8px;text-decoration:none;">Accepter l'invitation</a></p>
          <p style="color:#888;font-size:13px;">Ce lien expire dans 7 jours. Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet email.</p>
        `,
      }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Resend a refusé l'envoi: ${errText.slice(0, 300)}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
