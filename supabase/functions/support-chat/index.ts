// Bilingual (FR/EN) support chatbot for LiBooks. Handles both anonymous
// landing-page visitors and logged-in app users. Detects when the
// visitor wants a human, or when the AI genuinely can't help, and
// escalates the conversation -- visible in Super Admin > Support for
// staff to pick up and reply to in real time.
//
// Requires the Edge Function secret: ANTHROPIC_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `Tu es l'assistant support de LiBooks, un logiciel de comptabilité SaaS pour PME africaines (conforme OHADA/SYSCOHADA).

Réponds TOUJOURS dans la langue du visiteur (français ou anglais selon sa dernière question). Reste bref (2-4 phrases sauf si une explication détaillée est vraiment nécessaire), chaleureux et professionnel.

Ce que tu sais sur LiBooks :
- 4 forfaits : Starter (9$/mois, 2 utilisateurs, facturation, stocks, avoirs), Pro (19$/mois, 5 utilisateurs, + Banque, WhatsApp), Premium (69$/mois, utilisateurs illimités, + IA Trésorerie, OHADA complet, OCR, Paie), Enterprise (189$/mois, + Multi-société, API, support dédié).
- Fonctionnalités : facturation, gestion de stock multi-magasin, comptabilité en partie double SYSCOHADA, rapprochement bancaire, immobilisations, factures récurrentes, multi-devise, 2FA, invitations d'équipe, paiement par carte (Stripe) ou Mobile Money (Flutterwave).
- Essai gratuit disponible, pas de carte bancaire requise pour démarrer.
- L'inscription se fait sur la page d'accueil, bouton "Commencer" ou "Essai gratuit".

RÈGLES IMPORTANTES :
- Si le visiteur demande explicitement à parler à un humain, ou à un agent, ou dit qu'il veut un support humain -> réponds brièvement que tu transmets sa demande à l'équipe, puis termine ta réponse par exactement ce marqueur sur sa propre ligne : [ESCALATE]
- Si la question sort largement de ton champ (bug technique précis nécessitant un accès à son compte, litige de facturation, demande commerciale complexe) -> propose de transmettre à un humain et termine par [ESCALATE]
- Ne réponds JAMAIS à des questions sans rapport avec LiBooks, la comptabilité, ou l'utilisation du logiciel.
- N'invente jamais de fonctionnalité qui n'existe pas.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const { conversation_id, message, visitor_id, visitor_name, visitor_email, language } = await req.json();
    if (!message) throw new Error("message is required");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Identify the caller, if logged in (optional -- anonymous visitors
    // have no Authorization header at all, which is fine for pre-sale chat).
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

    // Find or create the conversation.
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
        language: language === "en" ? "en" : "fr",
        status: "ai",
      }).select().single();
      if (error) throw error;
      conversation = data;
    }

    // Save the visitor's message.
    await serviceClient.from("support_messages").insert({ conversation_id: conversation.id, sender: "visitor", content: message });

    // If a human already took over, don't let the bot answer -- just
    // store the message and let staff see it in real time.
    if (conversation.status === "escalated") {
      await serviceClient.from("support_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
      return new Response(JSON.stringify({ conversation_id: conversation.id, escalated: true, reply: null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build history for context (last 10 messages).
    const { data: history } = await serviceClient
      .from("support_messages").select("sender, content").eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }).limit(20);

    const claudeMessages = (history || [])
      .filter(m => m.sender !== "staff")
      .map(m => ({ role: m.sender === "visitor" ? "user" : "assistant", content: m.content }));

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!claudeRes.ok) throw new Error(`Claude API error: ${await claudeRes.text()}`);
    const claudeData = await claudeRes.json();
    let reply = claudeData.content?.find((b: { type: string }) => b.type === "text")?.text || "";

    const shouldEscalate = reply.includes("[ESCALATE]");
    reply = reply.replace("[ESCALATE]", "").trim();

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
