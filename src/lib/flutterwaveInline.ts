// Loads Flutterwave's "Inline" checkout SDK, which opens payment as a
// modal overlay on top of the current page -- the user never leaves
// LiBooks or sees a URL change, unlike the redirect-based flow.
//
// Requires VITE_FLUTTERWAVE_PUBLIC_KEY to be set at build time (Cloudflare
// Pages > Environment variables). This is the PUBLIC key (starts with
// FLWPUBK_), safe to expose in the browser bundle -- never the secret key.

declare global {
  interface Window {
    FlutterwaveCheckout?: (options: FlutterwaveInlineOptions) => void;
  }
}

interface FlutterwaveInlineOptions {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options?: string;
  customer: { email: string; name?: string; phone_number?: string };
  customizations: { title: string; description?: string; logo?: string };
  meta?: Record<string, unknown>;
  callback: (response: { transaction_id: number; tx_ref: string; status: string }) => void;
  onclose: () => void;
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadFlutterwaveScript(): Promise<void> {
  if (window.FlutterwaveCheckout) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger le module de paiement Flutterwave"));
    document.body.appendChild(script);
  });
  return scriptLoadingPromise;
}

export async function openFlutterwaveInline(options: Omit<FlutterwaveInlineOptions, 'public_key'>): Promise<void> {
  const publicKey = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("Le paiement Mobile Money n'est pas encore configuré (clé publique Flutterwave manquante).");
  }
  await loadFlutterwaveScript();
  if (!window.FlutterwaveCheckout) {
    throw new Error("Le module de paiement Flutterwave n'a pas pu se charger.");
  }
  window.FlutterwaveCheckout({ ...options, public_key: publicKey });
}
