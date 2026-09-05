// Scheduled daily (see .github/workflows/billing-cron.yml). Sends:
//   - "trial_ending": trial ends in 3 days, no plan chosen yet
//   - "renewal_upcoming": auto-renew tenant will be charged in 3 days
//     (transparency notice, even though the charge is automatic —
//     nobody should be surprised by a charge, and this is where they're
//     reminded they can cancel any time)
//   - "payment_failed": a renewal charge just failed (subscription_status
//     flipped to past_due) — asks them to update their payment method
//
// billing_reminders_sent enforces "at most once per tenant per kind per
// date" even if this job runs more than once on the same day.
//
// Requires: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// APP_URL, and CRON_SECRET (shared secret from the GitHub Actions workflow).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const NOTIFY_FROM = "LiBooks <noreply@liafrik.com>";

// Kept in sync with the price tables in flutterwave-auto-renew,
// flutterwave-verify/webhook, payunit-checkout, Billing.tsx and
// LandingPage.tsx. Shown in the renewal reminder so nobody is surprised
// by the exact amount an auto-charge is about to take — especially
// important if prices change after someone already set up auto-renewal
// at an older price.
const PLAN_PRICE_USD: Record<string, number> = {
  starter: 14,
  pro: 29,
  premium: 79,
  enterprise: 199,
};

async function sendEmail(resendKey: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({ from: NOTIFY_FROM, to, subject, html }),
  });
  if (!res.ok) console.error("Resend email failed:", await res.text());
  return res.ok;
}

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

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = Deno.env.get("APP_URL") ?? "https://libooks.liafrik.com";
  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const sent: Record<string, unknown>[] = [];

  async function alreadySent(tenantId: string, kind: string, forDate: string) {
    const { data } = await serviceClient.from("billing_reminders_sent").select("id").eq("tenant_id", tenantId).eq("kind", kind).eq("for_date", forDate).maybeSingle();
    return !!data;
  }
  async function markSent(tenantId: string, kind: string, forDate: string) {
    await serviceClient.from("billing_reminders_sent").insert({ tenant_id: tenantId, kind, for_date: forDate }).select().maybeSingle();
  }

  try {
    // 1. Trial ending in 3 days, no active plan yet.
    const { data: trialTenants } = await serviceClient
      .from("tenants").select("id, name, trial_ends_at")
      .eq("subscription_status", "trialing")
      .gte("trial_ends_at", `${in3Days}T00:00:00`).lt("trial_ends_at", `${in3Days}T23:59:59`);

    for (const t of trialTenants ?? []) {
      if (await alreadySent(t.id, "trial_ending", in3Days)) continue;
      const { data: admins } = await serviceClient.from("tenant_users").select("user_id").eq("tenant_id", t.id).eq("is_owner", true);
      for (const a of admins ?? []) {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(a.user_id);
        const email = authUser?.user?.email;
        if (!email || !resendKey) continue;
        await sendEmail(resendKey, email, "Ton essai LiBooks se termine dans 3 jours",
          `<p>Bonjour,</p><p>L'essai gratuit de <strong>${t.name}</strong> sur LiBooks se termine dans 3 jours.</p>
           <p>Choisis un forfait pour continuer à utiliser LiBooks sans interruption :</p>
           <p><a href="${appUrl}/app/billing">Voir les forfaits</a></p>`);
      }
      await markSent(t.id, "trial_ending", in3Days);
      sent.push({ tenant_id: t.id, kind: "trial_ending" });
    }

    // 2. Auto-renew charge coming in 3 days — transparency notice.
    const { data: renewingTenants } = await serviceClient
      .from("tenants").select("id, name, plan, next_billing_date, locked_price_usd")
      .eq("auto_renew", true).eq("subscription_status", "active").eq("next_billing_date", in3Days);

    for (const t of renewingTenants ?? []) {
      if (await alreadySent(t.id, "renewal_upcoming", in3Days)) continue;
      const { data: admins } = await serviceClient.from("tenant_users").select("user_id").eq("tenant_id", t.id).eq("is_owner", true);
      for (const a of admins ?? []) {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(a.user_id);
        const email = authUser?.user?.email;
        if (!email || !resendKey) continue;
        await sendEmail(resendKey, email, "Ton abonnement LiBooks sera renouvelé dans 3 jours",
          `<p>Bonjour,</p><p>Ta carte enregistrée sera débitée automatiquement de <strong>$${t.locked_price_usd ?? PLAN_PRICE_USD[t.plan as string] ?? '—'}</strong> dans 3 jours pour renouveler le forfait <strong>${t.plan}</strong> de ${t.name}.</p>
           <p>Tu peux annuler le renouvellement automatique à tout moment depuis <a href="${appUrl}/app/billing">Facturation</a>.</p>`);
      }
      await markSent(t.id, "renewal_upcoming", in3Days);
      sent.push({ tenant_id: t.id, kind: "renewal_upcoming" });
    }

    // 3. A renewal charge failed today (subscription just flipped past_due).
    const { data: failedTenants } = await serviceClient
      .from("tenants").select("id, name").eq("subscription_status", "past_due");

    for (const t of failedTenants ?? []) {
      if (await alreadySent(t.id, "payment_failed", todayStr)) continue;
      const { data: admins } = await serviceClient.from("tenant_users").select("user_id").eq("tenant_id", t.id).eq("is_owner", true);
      for (const a of admins ?? []) {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(a.user_id);
        const email = authUser?.user?.email;
        if (!email || !resendKey) continue;
        await sendEmail(resendKey, email, "Le paiement de ton abonnement LiBooks a échoué",
          `<p>Bonjour,</p><p>Le renouvellement automatique de ${t.name} n'a pas pu être débité (carte expirée, fonds insuffisants, ou refus de la banque).</p>
           <p>Mets à jour ton moyen de paiement pour éviter toute interruption : <a href="${appUrl}/app/billing">Facturation</a>.</p>`);
      }
      await markSent(t.id, "payment_failed", todayStr);
      sent.push({ tenant_id: t.id, kind: "payment_failed" });
    }
  } catch (err) {
    await logFunctionError("billing-reminders", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", sent: sent.length }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ sent: sent.length, details: sent }), { status: 200, headers: { "Content-Type": "application/json" } });
});
