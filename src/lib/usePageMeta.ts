import { useEffect } from 'react';

const SITE_NAME = 'LiBooks';
const SITE_URL = 'https://libooks.liafrik.com';
const DEFAULT_TITLE = `${SITE_NAME} — Gestion comptable internationale`;
const DEFAULT_DESCRIPTION = "LiBooks — Gestion comptable et commerciale internationale, avec une expertise OHADA reconnue. Facturation, stocks, Mobile Money, IA trésorerie.";

/**
 * Sets the document title, meta description, canonical link, and
 * OpenGraph/Twitter tags for the lifetime of the mounted page, restoring
 * the site-wide defaults on unmount. No new dependency (no react-helmet)
 * — every public page in this app is a single top-level route with no
 * nested/competing title needs, so a simple imperative effect is enough
 * and keeps the bundle smaller.
 *
 * Caveat: this only reaches crawlers that execute JavaScript (Googlebot
 * does). Social-preview bots (Facebook/LinkedIn/X/WhatsApp/iMessage)
 * generally don't, so a shared link to any page other than "/" still
 * unfurls with the homepage's static index.html tags, not this page's —
 * fixing that fully needs prerendering/SSR per route, which this Vite
 * SPA doesn't have.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;

    const metaDescription = document.querySelector('meta[name="description"]');
    const previousDescription = metaDescription?.getAttribute('content') ?? DEFAULT_DESCRIPTION;
    if (metaDescription && description) {
      metaDescription.setAttribute('content', description);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const previousOgTitle = ogTitle?.getAttribute('content') ?? SITE_NAME;
    if (ogTitle) ogTitle.setAttribute('content', title || SITE_NAME);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    const previousOgDescription = ogDescription?.getAttribute('content') ?? DEFAULT_DESCRIPTION;
    if (ogDescription && description) ogDescription.setAttribute('content', description);

    const canonicalUrl = `${SITE_URL}${window.location.pathname}`;
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    const previousCanonical = canonicalLink?.getAttribute('href') ?? `${SITE_URL}/`;
    if (canonicalLink) canonicalLink.setAttribute('href', canonicalUrl);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    const previousOgUrl = ogUrl?.getAttribute('content') ?? `${SITE_URL}/`;
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const previousTwitterTitle = twitterTitle?.getAttribute('content') ?? SITE_NAME;
    if (twitterTitle) twitterTitle.setAttribute('content', title || SITE_NAME);

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const previousTwitterDescription = twitterDescription?.getAttribute('content') ?? DEFAULT_DESCRIPTION;
    if (twitterDescription && description) twitterDescription.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      if (metaDescription) metaDescription.setAttribute('content', previousDescription);
      if (ogTitle) ogTitle.setAttribute('content', previousOgTitle);
      if (ogDescription) ogDescription.setAttribute('content', previousOgDescription);
      if (canonicalLink) canonicalLink.setAttribute('href', previousCanonical);
      if (ogUrl) ogUrl.setAttribute('content', previousOgUrl);
      if (twitterTitle) twitterTitle.setAttribute('content', previousTwitterTitle);
      if (twitterDescription) twitterDescription.setAttribute('content', previousTwitterDescription);
    };
  }, [title, description]);
}
