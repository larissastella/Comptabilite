import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PopupRow {
  id: string;
  title: string;
  body: string | null;
  cta_text: string | null;
  cta_url: string | null;
  bg_color: string;
}

// Dismissing a popup hides it for 7 days (localStorage), keyed by row id
// so a NEW campaign always shows even if an old one was dismissed.
// Shown after a short delay so it never blocks the initial page paint.
export default function MarketingPopup() {
  const [popup, setPopup] = useState<PopupRow | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('marketing_content')
        .select('id, title, body, cta_text, cta_url, bg_color')
        .eq('kind', 'popup')
        .eq('is_active', true)
        .maybeSingle();
      if (!data) return;

      const dismissedUntil = Number(localStorage.getItem(`popup_dismissed_${data.id}`) || 0);
      if (Date.now() < dismissedUntil) return;

      setPopup(data);
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    })();
  }, []);

  if (!popup || !visible) return null;

  function dismiss() {
    localStorage.setItem(`popup_dismissed_${popup!.id}`, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={dismiss}>
      <div
        className="relative bg-white dark:bg-surface-1 rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-2" style={{ background: popup.bg_color }} />
        <button onClick={dismiss} aria-label="Fermer" className="absolute right-3 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-5 h-5" />
        </button>
        <div className="p-6 pt-5">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 pr-6">{popup.title}</h3>
          {popup.body && <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">{popup.body}</p>}
          {popup.cta_text && popup.cta_url && (
            <a
              href={popup.cta_url}
              onClick={dismiss}
              className="block w-full text-center py-3 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity"
              style={{ background: popup.bg_color }}
            >
              {popup.cta_text}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
