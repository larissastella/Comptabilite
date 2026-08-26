import { useEffect } from 'react';

const SITE_NAME = 'LiBooks';
const DEFAULT_TITLE = `${SITE_NAME} — Gestion comptable internationale`;
const DEFAULT_DESCRIPTION = "LiBooks — Gestion comptable et commerciale internationale, avec une expertise OHADA reconnue. Facturation, stocks, Mobile Money, IA trésorerie.";

/**
 * Sets the document title and meta description for the lifetime of the
 * mounted page, restoring the site-wide defaults on unmount. No new
 * dependency (no react-helmet) — every public page in this app is a
 * single top-level route with no nested/competing title needs, so a
 * simple imperative effect is enough and keeps the bundle smaller.
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

    return () => {
      document.title = previousTitle;
      if (metaDescription) metaDescription.setAttribute('content', previousDescription);
      if (ogTitle) ogTitle.setAttribute('content', previousOgTitle);
      if (ogDescription) ogDescription.setAttribute('content', previousOgDescription);
    };
  }, [title, description]);
}
