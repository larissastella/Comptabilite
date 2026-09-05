// Loads Paddle's Billing v2 checkout SDK (Paddle.js) and opens the
// checkout as an overlay on top of the current page — same idea as
// flutterwaveInline.ts for Flutterwave, but for Paddle.
//
// Requires VITE_PADDLE_CLIENT_TOKEN (starts with "live_" or "test_") to
// be set at build time. This is the CLIENT-SIDE token, safe to expose in
// the browser bundle — it can only open a checkout, never move money or
// read account data on its own. Never put a Paddle API key (secret) here.
//
// Paddle Billing v2 also requires a Price ID per plan (configured in the
// Paddle Dashboard > Catalog > Prices), not a raw amount — those go in
// VITE_PADDLE_PRICE_STARTER / _PRO / _PREMIUM / _ENTERPRISE.

declare global {
  interface Window {
    Paddle?: {
      Initialize: (options: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
      Checkout: { open: (options: PaddleCheckoutOptions) => void };
    };
  }
}

interface PaddleEvent {
  name: string;
  data?: Record<string, unknown>;
}

interface PaddleCheckoutOptions {
  items: { priceId: string; quantity: number }[];
  customer?: { email: string };
  customData?: Record<string, unknown>;
}

let scriptLoadingPromise: Promise<void> | null = null;
let initialized = false;

function loadPaddleScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Impossible de charger le module de paiement Paddle"));
    document.body.appendChild(script);
  });
  return scriptLoadingPromise;
}

export async function openPaddleCheckout(
  options: PaddleCheckoutOptions,
  onEvent?: (event: PaddleEvent) => void,
): Promise<void> {
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
  if (!token) {
    throw new Error("Le paiement par carte via Paddle n'est pas encore configuré (token client manquant).");
  }
  await loadPaddleScript();
  if (!window.Paddle) {
    throw new Error("Le module de paiement Paddle n'a pas pu se charger.");
  }
  if (!initialized) {
    window.Paddle.Initialize({ token, eventCallback: onEvent });
    initialized = true;
  }
  window.Paddle.Checkout.open(options);
}
