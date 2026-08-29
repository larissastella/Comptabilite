import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BannerRow {
  id: string;
  title: string;
  body: string | null;
  cta_text: string | null;
  cta_url: string | null;
  bg_color: string;
}

// Dismissing hides it for the rest of the browser session only — a new
// visit shows it again. Keyed by row id so a NEW campaign (different id)
// always shows even if the previous one was dismissed.
export default function MarketingBanner() {
  const [banner, setBanner] = useState<BannerRow | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('marketing_content')
        .select('id, title, body, cta_text, cta_url, bg_color')
        .eq('kind', 'banner')
        .eq('is_active', true)
        .maybeSingle();
      if (data) {
        setBanner(data);
        setDismissed(sessionStorage.getItem('banner_dismissed') === data.id);
        supabase.rpc('record_marketing_impression', { p_id: data.id }).then(() => {});
      }
    })();
  }, []);

  if (!banner || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem('banner_dismissed', banner!.id);
    setDismissed(true);
  }

  function trackClick() {
    supabase.rpc('record_marketing_click', { p_id: banner!.id }).then(() => {});
  }

  const content = (
    <>
      <span className="font-semibold">{banner.title}</span>
      {banner.body && <span className="hidden sm:inline text-white/80"> — {banner.body}</span>}
      {banner.cta_text && <span className="underline underline-offset-2 font-medium">{banner.cta_text}</span>}
    </>
  );

  return (
    <div className="relative text-white text-sm py-2 px-4 flex items-center justify-center gap-2 text-center" style={{ background: banner.bg_color }}>
      {banner.cta_url ? (
        <a href={banner.cta_url} onClick={trackClick} className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-1.5">{content}</div>
      )}
      <button onClick={dismiss} aria-label="Fermer" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
