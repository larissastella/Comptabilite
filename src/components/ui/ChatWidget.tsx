import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, Send, Loader2, Headset, User as UserIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ChatMessage {
  id: string;
  sender: 'visitor' | 'ai' | 'staff';
  content: string;
}

function getVisitorId(): string {
  const key = 'libooks_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ChatWidget() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const isFr = i18n.language?.startsWith('fr');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Live-update once a staff member joins (realtime), so replies appear
  // instantly without the visitor needing to send another message first.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`support-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = payload.new as { id: string; sender: 'visitor' | 'ai' | 'staff'; content: string };
        if (row.sender === 'staff') {
          setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, { id: row.id, sender: row.sender, content: row.content }]));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'visitor', content: text }]);
    setSending(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY };
      if (session.session?.access_token) headers.Authorization = `Bearer ${session.session.access_token}`;

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          visitor_id: getVisitorId(),
          language: isFr ? 'fr' : 'en',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setConversationId(json.conversation_id);
      if (json.escalated) setEscalated(true);
      if (json.reply) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'ai', content: json.reply }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), sender: 'ai',
        content: isFr ? "Désolé, une erreur est survenue. Réessaie dans un instant." : 'Sorry, something went wrong. Please try again shortly.',
      }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            if (messages.length === 0) {
              setMessages([{
                id: 'welcome', sender: 'ai',
                content: isFr
                  ? `Bonjour${user ? '' : ' 👋'} ! Je suis l'assistant LiBooks. Comment puis-je t'aider aujourd'hui ?`
                  : `Hi${user ? '' : ' 👋'}! I'm the LiBooks assistant. How can I help you today?`,
              }]);
            }
          }}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 bg-[#0057D9] hover:bg-[#003F9E] text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          aria-label="Support chat"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 h-[70vh] sm:h-[560px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-[#0F2A3D] text-white px-4 py-3.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#0057D9] rounded-full flex items-center justify-center">
                <Headset className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">LiBooks {isFr ? 'Assistance' : 'Support'}</p>
                <p className="text-xs text-white/60">{escalated ? (isFr ? 'Équipe en cours de connexion...' : 'Team joining...') : (isFr ? 'Assistant en ligne' : 'Assistant online')}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.sender === 'visitor' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex items-start gap-2 max-w-[85%] ${m.sender === 'visitor' ? 'flex-row-reverse' : ''}`}>
                  {m.sender !== 'visitor' && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.sender === 'staff' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                      {m.sender === 'staff' ? <UserIcon className="w-3.5 h-3.5 text-emerald-600" /> : <Headset className="w-3.5 h-3.5 text-[#0057D9]" />}
                    </div>
                  )}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.sender === 'visitor' ? 'bg-[#0057D9] text-white rounded-br-sm' :
                    m.sender === 'staff' ? 'bg-emerald-50 text-gray-800 border border-emerald-200 rounded-bl-sm' :
                    'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}>
                    {m.sender === 'staff' && <p className="text-[10px] font-semibold text-emerald-600 mb-0.5">{isFr ? 'Équipe LiBooks' : 'LiBooks Team'}</p>}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            )}
            {escalated && (
              <p className="text-center text-xs text-gray-400 py-1">
                {isFr ? "Un membre de l'équipe va te répondre bientôt." : 'A team member will reply shortly.'}
              </p>
            )}
          </div>

          <div className="p-3 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
              placeholder={isFr ? 'Écris ton message...' : 'Type your message...'}
              className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="w-10 h-10 bg-[#0057D9] hover:bg-[#003F9E] disabled:opacity-40 text-white rounded-xl flex items-center justify-center flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
