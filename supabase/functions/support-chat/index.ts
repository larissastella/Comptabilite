// Bilingual (FR/EN) support chatbot for LiBooks -- FREE, keyword/FAQ
// based, zero external API cost. No Anthropic/OpenAI key required.
//
// How it works: matches the visitor's message against a small FAQ
// knowledge base (French + English) using simple keyword scoring. If no
// confident match is found, it doesn't guess -- it escalates to a human
// immediately rather than giving a bad automated answer.
//
// Handles both anonymous landing-page visitors and logged-in app users.
// Escalated conversations are visible in Super Admin > Support for
// staff to pick up and reply to in real time.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FaqEntry {
  keywords: { fr: string[]; en: string[] };
  answer: { fr: string; en: string };
}

// Add/edit entries here any time -- no redeploy of any AI model needed,
// just this static list.
const FAQ: FaqEntry[] = [
  {
    keywords: { fr: ["prix", "tarif", "combien", "cout", "coûte", "abonnement", "forfait"], en: ["price", "pricing", "cost", "how much", "plan", "subscription"] },
    answer: {
      fr: "LiBooks propose 4 forfaits : Starter (14$/mois), Pro (29$/mois), Premium (79$/mois) et Enterprise (199$/mois). Chaque forfait supérieur inclut tout l'inférieur, plus des fonctionnalités avancées. Tu peux voir le détail complet sur notre page tarifs.",
      en: "LiBooks has 4 plans: Starter ($14/mo), Pro ($29/mo), Premium ($79/mo) and Enterprise ($199/mo). Each higher plan includes everything from the one below, plus more features. Full details are on our pricing page.",
    },
  },
  {
    keywords: { fr: ["essai", "gratuit", "gratuitement", "tester"], en: ["free trial", "trial", "try", "free"] },
    answer: {
      fr: "Oui ! Tu peux essayer LiBooks gratuitement, sans carte bancaire. Clique sur \"Essai gratuit\" en haut de la page pour démarrer.",
      en: "Yes! You can try LiBooks for free, no credit card required. Click \"Free trial\" at the top of the page to get started.",
    },
  },
  {
    keywords: { fr: ["inscri", "compte", "commencer", "demarrer", "créer un compte"], en: ["sign up", "signup", "register", "create account", "get started"] },
    answer: {
      fr: "Pour t'inscrire, clique sur \"Commencer\" ou \"Essai gratuit\" en haut de la page. Ça prend moins de 2 minutes, aucune carte bancaire n'est nécessaire pour démarrer.",
      en: "To sign up, click \"Get started\" or \"Free trial\" at the top of the page. It takes less than 2 minutes, no credit card needed to start.",
    },
  },
  {
    keywords: { fr: ["facture", "facturation", "devis"], en: ["invoice", "invoicing", "billing document", "quote"] },
    answer: {
      fr: "LiBooks te permet de créer des factures professionnelles illimitées, avec suivi des paiements, envoi par WhatsApp, et export PDF. C'est disponible dès le forfait Starter.",
      en: "LiBooks lets you create unlimited professional invoices, with payment tracking, WhatsApp sending, and PDF export. Available from the Starter plan.",
    },
  },
  {
    keywords: { fr: ["stock", "inventaire", "entrepot", "magasin"], en: ["inventory", "stock", "warehouse"] },
    answer: {
      fr: "La gestion de stock multi-magasin est incluse dès le forfait Starter : suivi des entrées/sorties, alertes de stock bas, et valorisation automatique.",
      en: "Multi-warehouse inventory management is included from the Starter plan: stock movement tracking, low-stock alerts, and automatic valuation.",
    },
  },
  {
    keywords: { fr: ["paiement", "payer", "carte bancaire", "mobile money", "orange money", "momo"], en: ["payment", "pay", "credit card", "mobile money"] },
    answer: {
      fr: "Tu peux payer ton abonnement par carte bancaire (Stripe) ou par Mobile Money / carte locale (Flutterwave) -- au choix, directement depuis la page Facturation de ton compte.",
      en: "You can pay for your subscription by credit card (Stripe) or Mobile Money / local card (Flutterwave) -- your choice, right from your account's Billing page.",
    },
  },
  {
    keywords: { fr: ["ohada", "syscohada", "comptabilite", "comptable"], en: ["ohada", "syscohada", "accounting"] },
    answer: {
      fr: "LiBooks est conforme aux normes SYSCOHADA/OHADA : plan comptable pré-configuré, comptabilité en partie double, et états financiers OHADA générés automatiquement.",
      en: "LiBooks is SYSCOHADA/OHADA compliant: pre-configured chart of accounts, double-entry bookkeeping, and automatically generated OHADA financial statements.",
    },
  },
  {
    keywords: { fr: ["utilisateur", "equipe", "inviter", "collaborateur"], en: ["user", "team", "invite", "collaborator"] },
    answer: {
      fr: "Tu peux inviter des membres de ton équipe avec des rôles personnalisés. Le nombre d'utilisateurs inclus dépend de ton forfait (2 en Starter, 5 en Pro, illimité en Premium/Enterprise).",
      en: "You can invite team members with custom roles. The number of included users depends on your plan (2 on Starter, 5 on Pro, unlimited on Premium/Enterprise).",
    },
  },
  {
    keywords: { fr: ["annuler", "resilier", "desabonner"], en: ["cancel", "unsubscribe", "cancel subscription"] },
    answer: {
      fr: "Tu peux gérer ou annuler ton abonnement à tout moment depuis la page Facturation de ton compte, section \"Gérer mon paiement\".",
      en: "You can manage or cancel your subscription any time from your account's Billing page, under \"Manage payment\".",
    },
  },
];

function scoreMatch(message: string, keywords: string[]): number {
  const lower = message.toLowerCase();
  return keywords.reduce((score, kw) => (lower.includes(kw.toLowerCase()) ? score + 1 : score), 0);
}

function findBestAnswer(message: string, lang: "fr" | "en"): string | null {
  let best: { score: number; answer: string } | null = null;
  for (const entry of FAQ) {
    const score = scoreMatch(message, entry.keywords[lang]);
    if (score > 0 && (!best || score > best.score)) {
      best = { score, answer: entry.answer[lang] };
    }
  }
  return best?.answer ?? null;
}

const GREETINGS_FR = ["bonjour", "salut", "bonsoir", "hello", "coucou"];
const HUMAN_REQUEST_FR = ["humain", "agent", "personne", "quelqu'un", "conseiller"];
const HUMAN_REQUEST_EN = ["human", "agent", "someone", "person", "representative"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { conversation_id, message, visitor_id, visitor_name, visitor_email, language } = await req.json();
    if (!message) throw new Error("message is required");
    const lang: "fr" | "en" = language === "en" ? "en" : "fr";

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userId: string | null = null;
    let tenantId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: membership } = await serviceClient.from("tenant_users").select("tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
        tenantId = membership?.tenant_id ?? null;
      }
    }

    let conversation;
    if (conversation_id) {
      const { data } = await serviceClient.from("support_conversations").select("*").eq("id", conversation_id).maybeSingle();
      conversation = data;
    }
    if (!conversation) {
      const { data, error } = await serviceClient.from("support_conversations").insert({
        tenant_id: tenantId,
        user_id: userId,
        visitor_id: userId ? null : visitor_id,
        visitor_name: visitor_name || null,
        visitor_email: visitor_email || null,
        language: lang,
        status: "ai",
      }).select().single();
      if (error) throw error;
      conversation = data;
    }

    await serviceClient.from("support_messages").insert({ conversation_id: conversation.id, sender: "visitor", content: message });

    if (conversation.status === "escalated") {
      await serviceClient.from("support_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
      return new Response(JSON.stringify({ conversation_id: conversation.id, escalated: true, reply: null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lowerMsg = message.toLowerCase();
    const wantsHuman = (lang === "fr" ? HUMAN_REQUEST_FR : HUMAN_REQUEST_EN).some(w => lowerMsg.includes(w));
    const isGreeting = GREETINGS_FR.some(w => lowerMsg.includes(w)) && message.length < 30;

    let reply: string;
    let shouldEscalate = false;

    if (wantsHuman) {
      reply = lang === "fr"
        ? "Bien sûr, je transmets ta demande à notre équipe -- quelqu'un te répondra ici même très bientôt."
        : "Of course, I'm passing this along to our team -- someone will reply right here shortly.";
      shouldEscalate = true;
    } else if (isGreeting) {
      reply = lang === "fr"
        ? "Bonjour ! Je suis l'assistant LiBooks. Pose-moi une question sur nos forfaits, nos fonctionnalités, ou comment démarrer."
        : "Hi! I'm the LiBooks assistant. Ask me about our plans, features, or how to get started.";
    } else {
      const faqAnswer = findBestAnswer(message, lang);
      if (faqAnswer) {
        reply = faqAnswer;
      } else {
        reply = lang === "fr"
          ? "Je ne suis pas certain de pouvoir répondre précisément à ça -- je transmets ta question à notre équipe, qui te répondra ici même."
          : "I'm not sure I can answer that precisely -- I'm passing your question to our team, who will reply right here.";
        shouldEscalate = true;
      }
    }

    await serviceClient.from("support_messages").insert({ conversation_id: conversation.id, sender: "ai", content: reply });

    const updatePayload: Record<string, unknown> = { last_message_at: new Date().toISOString() };
    if (shouldEscalate) updatePayload.status = "escalated";
    await serviceClient.from("support_conversations").update(updatePayload).eq("id", conversation.id);

    return new Response(JSON.stringify({ conversation_id: conversation.id, escalated: shouldEscalate, reply }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
