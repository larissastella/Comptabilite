// Saves every contact-form submission to the database (always works,
// no setup needed) AND sends a real email notification to the support
// team via Resend, if RESEND_API_KEY is configured.
//
// To activate real email sending:
//   1. Create a free account at https://resend.com (3,000 emails/month free)
//   2. Verify your domain (liafrik.com) there — takes a few DNS records
//   3. Add these Edge Function secrets in Supabase:
//        RESEND_API_KEY = re_xxxxxxxxxxxx
//   Until RESEND_API_KEY is set, messages are still saved to the
//   database (visible in Super Admin) — nothing is lost, email is just
//   not sent yet.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Where contact-form submissions are delivered by email.
const NOTIFY_TO = ["cs@liafrik.com", "support@liafrik.com"];
const NOTIFY_FROM = "LiBooks <noreply@liafrik.com>";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { name, email, subject, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const record = {
      name,
      email,
      subject: subject || "(No subject)",
      message,
      created_at: new Date().toISOString(),
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Always save to the database first — this must never fail
    //    silently, it's the source of truth even if email sending below
    //    isn't configured yet or Resend has a hiccup.
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/contact_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(record),
    });

    if (!dbRes.ok) {
      const text = await dbRes.text();
      console.error("DB insert failed:", text);
      return new Response(
        JSON.stringify({ error: "Failed to save message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Best-effort email notification. Doesn't fail the request if it
    //    doesn't work — the message is already safely saved above.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: NOTIFY_FROM,
            to: NOTIFY_TO,
            reply_to: email,
            subject: `[Contact LiBooks] ${record.subject}`,
            html: `
              <p><strong>De :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
              <p><strong>Sujet :</strong> ${escapeHtml(record.subject)}</p>
              <p><strong>Message :</strong></p>
              <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
            `,
          }),
        });
        if (!emailRes.ok) {
          console.error("Resend email failed:", await emailRes.text());
        }
      } catch (emailErr) {
        console.error("Resend email error:", emailErr);
      }
    } else {
      console.warn("RESEND_API_KEY not configured — message saved to DB only, no email sent.");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
