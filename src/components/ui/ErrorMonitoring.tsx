import { Component, ReactNode, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle } from 'lucide-react';
import * as Sentry from '@sentry/react';

/**
 * Reports uncaught errors both to Sentry (real-time alerting, stack
 * traces, breadcrumbs) and to the self-hosted `client_errors` table (see
 * migration 020) that already powers Super Admin > Monitoring — kept
 * rather than replaced, since staff are already using that dashboard.
 */
async function reportClientError(message: string, stack?: string, severity: 'error' | 'warning' = 'error') {
  try {
    Sentry.captureException(stack ? Object.assign(new Error(message), { stack }) : new Error(message), {
      level: severity,
    });
  } catch {
    // Never let error reporting itself crash the app -- fail silently.
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('client_errors').insert({
      user_id: user?.id ?? null,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 5000) ?? null,
      url: window.location.href,
      user_agent: navigator.userAgent,
      severity,
    });
  } catch {
    // Never let error reporting itself crash the app -- fail silently.
  }
}

/** Mounted once near the app root to catch errors outside React's tree. */
export function GlobalErrorListener() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientError(event.message, event.error?.stack);
    }
    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      reportClientError(`Unhandled promise rejection: ${message}`, stack);
    }
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);
  return null;
}

interface ErrorBoundaryState { hasError: boolean }

/** Catches React render/lifecycle crashes so one broken page doesn't take down the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    reportClientError(error.message, `${error.stack}\n\nComponent stack:${info.componentStack}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-white dark:bg-surface-0">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Une erreur inattendue est survenue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md">
            Notre équipe a été automatiquement notifiée. Essaie de recharger la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
