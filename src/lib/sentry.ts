import * as Sentry from '@sentry/react';

// DSN is not a secret (it's a write-only ingestion key, meant to be
// shipped in a public frontend bundle — this is how every Sentry SDK
// works) — but it's still kept behind an env var with this value only as
// the fallback, consistent with every other external service key in this
// codebase (VITE_SUPABASE_URL, VITE_FLUTTERWAVE_PUBLIC_KEY, ...), so a
// staging/preview deploy can point at a different Sentry project by
// setting VITE_SENTRY_DSN without a code change.
const DSN = import.meta.env.VITE_SENTRY_DSN
  || 'https://cf1e6a5a625c0d32ab9138e1ff4efada@o4512032831045632.ingest.de.sentry.io/4512032839172176';

export function initSentry() {
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Financial data (invoices, amounts, customer names) is visible on
    // almost every screen of this app — Session Replay records what's on
    // screen, so it stays off rather than risk capturing that. Only
    // plain error/breadcrumb reporting is enabled.
    integrations: [],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // sendDefaultPii defaults to false — deliberately not overridden, so
    // Sentry doesn't attach IP addresses/cookies to events by default.
    beforeSend(event) {
      // Skip noisy, actionable-by-no-one errors that don't come from our
      // own code (ad blockers, browser extensions injecting scripts).
      const message = event.exception?.values?.[0]?.value || '';
      if (/ResizeObserver loop|extension:\/\//.test(message)) return null;
      return event;
    },
  });
}
