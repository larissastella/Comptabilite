import { useTranslation } from 'react-i18next';
import { CheckCircle, ArrowUpRight, CreditCard, Calendar, Zap, Loader2 } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { openFlutterwaveInline } from '../../lib/flutterwaveInline';
import { openPaddleCheckout } from '../../lib/paddleInline';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

// Single source of truth for which PSP accounts are actually approved and
// live right now. Flip a flag to true here (nowhere else) once that
// provider's account is approved — this is what auto-selection and the
// manual picker both check, so a not-yet-approved provider never gets
// offered to a real customer even if its checkout code already exists.
//
// 5 PSPs total. All 5 are fully wired (checkout + verification code
// exists and works) — the flags below are the only thing standing between
// "code is ready" and "a real customer can pay with it". Flip one to true
// once its secret key(s) are set in Supabase Edge Function secrets AND
// the merchant account is approved:
//   payunit:     PAYUNIT_API_USER, PAYUNIT_API_PASSWORD, PAYUNIT_API_KEY, PAYUNIT_MODE
//   flutterwave: FLUTTERWAVE_SECRET_KEY (+ VITE_FLUTTERWAVE_PUBLIC_KEY at build time)
//   paystack:    PAYSTACK_SECRET_KEY
//   stripe:      STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SIGNING_SECRET, STRIPE_PRICE_*
//   paddle:      PADDLE_WEBHOOK_SECRET (+ VITE_PADDLE_CLIENT_TOKEN and VITE_PADDLE_PRICE_* at build time)
const PSP_AVAILABLE: Record<'payunit' | 'flutterwave' | 'paystack' | 'stripe' | 'paddle', boolean> = {
  payunit: true,
  flutterwave: false, // not yet approved — do not enable until confirmed
  paystack: false,    // not yet approved — do not enable until confirmed
  stripe: false,      // not yet approved — do not enable until confirmed
  paddle: false,      // not yet approved — do not enable until confirmed
};

// Live USD->XAF rate, same source (fx_rates, tenant_id IS NULL) that
// supabase/functions/payunit-checkout now actually charges with — this
// used to be its own hardcoded table here, kept "in sync" by hand with a
// second hardcoded table in that function. Two manually-synced copies of
// the same number is exactly how they drift apart; querying the one
// real source removes that failure mode. Needed independently of the
// tenant's own display currency (below) because PayUnit always charges
// in XAF specifically, regardless of what currency the tenant bills in.
const FALLBACK_XAF_PER_USD = 610; // same fallback as payunit-checkout

const PLANS = [
  { id: 'starter', name: 'Starter', price: 14, features: ['Facturation illimitée', 'Gestion stocks', '2 utilisateurs', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 29, features: ['Tout Starter', 'Banque & Mobile Money', 'WhatsApp', 'Multi-magasin', '5 utilisateurs'], popular: true },
  { id: 'premium', name: 'Premium', price: 79, features: ['Tout Pro', 'IA Trésorerie & FX', 'OHADA complet', 'OCR & Paie', 'Utilisateurs illimités'] },
  { id: 'enterprise', name: 'Entreprise', price: 199, features: ['Tout Premium', 'Multi-société', 'API & intégrations', 'Support dédié 24/7', 'SLA 99.9%'] },
];

// The "Facturation annuelle disponible avec 20% de réduction" line below
// used to be pure copy — no cycle toggle, no tenant column to remember
// it, nothing on any of the 5 PSPs to charge a different amount. A
// customer had no way to actually get what this text promised.
const ANNUAL_DISCOUNT = 0.20;
function priceForCycle(monthlyPrice: number, cycle: 'monthly' | 'annual') {
  return cycle === 'annual' ? Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT)) : monthlyPrice;
}

export default function Billing() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [pickingPlanFor, setPickingPlanFor] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [payunitXafRate, setPayunitXafRate] = useState<number>(FALLBACK_XAF_PER_USD);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('fx_rates').select('rate')
        .is('tenant_id', null).eq('currency_from', 'USD').eq('currency_to', 'XAF')
        .order('rate_date', { ascending: false }).limit(1).maybeSingle();
      if (data?.rate) setPayunitXafRate(data.rate);
    })();
  }, []);

  // The platform's canonical prices (what's actually billed) are always
  // in USD — PLAN_PRICE_USD in every payment edge function is the source
  // of truth. This is purely a DISPLAY conversion so a tenant billing in
  // XOF, NGN, KES, etc. sees "≈ what that costs me", never used to
  // compute an actual charge.
  useEffect(() => {
    const currency = tenant?.currency;
    if (!currency || currency === 'USD') { setFxRate(null); return; }
    (async () => {
      const { data } = await supabase
        .from('fx_rates').select('rate')
        .is('tenant_id', null).eq('currency_from', 'USD').eq('currency_to', currency)
        .order('rate_date', { ascending: false }).limit(1).maybeSingle();
      setFxRate(data?.rate ?? null);
    })();
  }, [tenant?.currency]);

  function displayPrice(usdAmount: number): string {
    if (!fxRate || !tenant?.currency || tenant.currency === 'USD') return `$${usdAmount}`;
    return `$${usdAmount} (≈ ${formatCurrency(usdAmount * fxRate)})`;
  }

  // Automatic payment method: prefer Mobile Money (Flutterwave) in the
  // CEMAC/UEMOA franc zones when it's actually available; PayUnit
  // (card, international) otherwise. Never auto-select a provider whose
  // account isn't approved yet — falls through to whatever IS available.
  function autoProvider(): 'payunit' | 'flutterwave' | 'paystack' | 'stripe' | 'paddle' {
    const preferMomo = tenant?.currency === 'XAF' || tenant?.currency === 'XOF';
    if (preferMomo && PSP_AVAILABLE.flutterwave) return 'flutterwave';
    if (PSP_AVAILABLE.payunit) return 'payunit';
    if (PSP_AVAILABLE.flutterwave) return 'flutterwave';
    if (PSP_AVAILABLE.paystack) return 'paystack';
    return 'payunit'; // last resort — checkout will surface a clear error if truly none are configured
  }

  const trialDaysLeft = tenant?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(tenant.trial_ends_at), new Date()))
    : 0;

  const isTrialing = tenant?.subscription_status === 'trialing';
  const isActive = tenant?.subscription_status === 'active';
  const currentPlan = PLANS.find(p => p.id === tenant?.plan);

  // PayUnit is a hosted redirect — the customer leaves LiBooks and comes
  // back to this exact URL. Confirm the payment server-side as soon as
  // we land back here (webhook is the async backup for closed tabs).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('transaction_id');
    if (params.get('payunit_return') !== '1' || !transactionId || !tenant?.id) return;

    window.history.replaceState({}, '', '/app/billing');
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payunit-verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ transaction_id: transactionId, tenant_id: tenant.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Le paiement n\'a pas pu être vérifié');
        toast.success('Paiement confirmé — ton forfait est activé !');
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de vérification du paiement');
      }
    })();
  }, [tenant?.id]);

  // Paystack is also a hosted redirect — its callback_url automatically
  // gets ?reference=... appended by Paystack itself.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (params.get('paystack_return') !== '1' || !reference || !tenant?.id) return;

    window.history.replaceState({}, '', '/app/billing');
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ reference, tenant_id: tenant.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Le paiement n\'a pas pu être vérifié');
        toast.success('Paiement confirmé — ton forfait est activé !');
        window.location.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de vérification du paiement');
      }
    })();
  }, [tenant?.id]);

  // Stripe Checkout is a hosted redirect too — success_url only gets
  // visited if Stripe itself confirms the payment, but the actual DB
  // update comes from stripe-webhook (async, source of truth), not from
  // this query param. A short delay before reload gives the webhook time
  // to land before we re-fetch the tenant.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    window.history.replaceState({}, '', '/app/billing');
    if (checkout === 'success') {
      toast.success('Paiement reçu — activation en cours...');
      setTimeout(() => window.location.reload(), 2500);
    } else if (checkout === 'cancelled') {
      toast('Paiement annulé.');
    }
  }, []);

  async function handleCheckout(planId: string, provider: 'payunit' | 'flutterwave' | 'paystack' | 'stripe' | 'paddle') {
    if (!tenant?.id) return;
    setPickingPlanFor(null);

    if (provider === 'flutterwave') {
      // Inline checkout: opens as a modal over the current page, no
      // redirect, no leaving LiBooks.
      const plan = PLANS.find(p => p.id === planId);
      if (!plan) return;
      setRedirecting(true);
      try {
        // Ask the server to issue and stash the tx_ref first — this is
        // what lets the webhook safety-net later confirm the payment was
        // genuinely requested by this tenant's own admin, not just
        // pointed at this tenant_id by anyone with a Flutterwave account.
        const { data: session } = await supabase.auth.getSession();
        const initRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenant.id, plan: planId, cycle: billingCycle }),
        });
        const initJson = await initRes.json();
        if (!initRes.ok) throw new Error(initJson.error || "Impossible d'initialiser le paiement");

        await openFlutterwaveInline({
          tx_ref: initJson.tx_ref,
          amount: priceForCycle(plan.price, billingCycle),
          currency: 'USD',
          customer: { email: user?.email || '', name: tenant.name },
          customizations: { title: 'LiBooks', description: `Abonnement ${plan.name}` },
          meta: { tenant_id: tenant.id, plan: planId, cycle: billingCycle },
          callback: async (response) => {
            try {
              const { data: session } = await supabase.auth.getSession();
              const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flutterwave-verify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                  Authorization: `Bearer ${session.session?.access_token}`,
                },
                body: JSON.stringify({ transaction_id: response.transaction_id, tenant_id: tenant.id }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || 'Le paiement n\'a pas pu être vérifié');
              toast.success('Paiement confirmé — ton forfait est activé !');
              window.location.reload();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Erreur de vérification du paiement');
            } finally {
              setRedirecting(false);
            }
          },
          onclose: () => setRedirecting(false),
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de paiement');
        setRedirecting(false);
      }
      return;
    }

    if (provider === 'paystack') {
      // Also a hosted page by design (authorization_url) — same redirect
      // pattern as PayUnit, different endpoint/reference format.
      setRedirecting(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paystack-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ plan: planId, tenant_id: tenant.id, cycle: billingCycle }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Impossible de démarrer le paiement');
        window.location.href = json.url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de paiement');
        setRedirecting(false);
      }
      return;
    }

    if (provider === 'stripe') {
      // Hosted redirect, like PayUnit/Paystack — Stripe Checkout Session
      // URL is created server-side with the real price ID, nothing
      // client-editable in the amount.
      setRedirecting(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ plan: planId, tenant_id: tenant.id, cycle: billingCycle }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Impossible de démarrer le paiement');
        window.location.href = json.url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de paiement');
        setRedirecting(false);
      }
      return;
    }

    if (provider === 'paddle') {
      // Inline overlay, like Flutterwave — but activation always waits
      // for paddle-webhook (the source of truth); the checkout.completed
      // event here is only used to give the user immediate feedback.
      const priceEnvKey = `VITE_PADDLE_PRICE_${planId.toUpperCase()}${billingCycle === 'annual' ? '_ANNUAL' : ''}`;
      const priceId = (import.meta.env as Record<string, string | undefined>)[priceEnvKey];
      if (!priceId) {
        toast.error(`Le paiement par carte via Paddle n'est pas encore configuré pour ce forfait${billingCycle === 'annual' ? ' en facturation annuelle' : ''}.`);
        return;
      }
      setRedirecting(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const initRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paddle-init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenant.id, plan: planId, cycle: billingCycle }),
        });
        const initJson = await initRes.json();
        if (!initRes.ok) throw new Error(initJson.error || "Impossible d'initialiser le paiement");

        await openPaddleCheckout(
          {
            items: [{ priceId, quantity: 1 }],
            customer: user?.email ? { email: user.email } : undefined,
            customData: { tenant_id: tenant.id, plan: planId, cycle: billingCycle, checkout_ref: initJson.checkout_ref },
          },
          (event) => {
            if (event.name === 'checkout.completed') {
              toast.success('Paiement reçu — activation en cours...');
              setTimeout(() => window.location.reload(), 3000);
            } else if (event.name === 'checkout.closed') {
              setRedirecting(false);
            }
          },
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur de paiement');
        setRedirecting(false);
      }
      return;
    }

    // PayUnit checkout is a hosted page by design (like the old Stripe
    // Checkout was) -- a real redirect is unavoidable here.
    setRedirecting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payunit-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ plan: planId, tenant_id: tenant.id, cycle: billingCycle }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Impossible de démarrer le paiement');
      window.location.href = json.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement');
      setRedirecting(false);
    }
  }

  // "Gérer" opens Stripe's self-service billing portal for tenants who
  // subscribed via Stripe (the only one of the 5 PSPs with that API) —
  // otherwise falls back to the same checkout flow used to subscribe,
  // since that's what actually gets them to a page where they can
  // update their card/Mobile Money details and pay.
  async function handleManageBilling() {
    if (tenant?.stripe_customer_id && PSP_AVAILABLE.stripe) {
      setRedirecting(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenant.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Impossible d\'ouvrir le portail de facturation');
        window.location.href = json.url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur');
        setRedirecting(false);
      }
      return;
    }
    if (!tenant?.plan) return;
    handleCheckout(tenant.plan, autoProvider());
  }

  async function handleCancelAutoRenew() {
    if (!tenant?.id) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-cancel-autorenew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ tenant_id: tenant.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      toast.success('Renouvellement automatique annulé. Ton accès reste actif jusqu\'à la fin de la période en cours.');
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('billing.title')}</h1>

      {/* Current plan card */}
      <div className={`rounded-2xl border-2 p-5 sm:p-6 mb-8 ${isTrialing ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-500/10' : 'border-[#0057D9] dark:border-[#0057D9] bg-[#0057D9]/5 dark:bg-[#0057D9]/10'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-[#0057D9]" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('billing.currentPlan')}</h2>
            </div>
            <p className="text-2xl sm:text-3xl font-medium text-gray-900 dark:text-white mt-1">{currentPlan?.name || tenant?.plan}</p>
            {isTrialing && (
              <div className="flex items-center gap-2 mt-2">
                <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t('billing.trialEnds')} dans <strong>{trialDaysLeft} jour(s)</strong>
                  {tenant?.trial_ends_at && ` (${format(new Date(tenant.trial_ends_at), 'dd MMMM yyyy', { locale: fr })})`}
                </p>
              </div>
            )}
            {isActive && (
              <>
                <p className="text-sm text-[#0057D9] mt-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Abonnement actif
                </p>
                {tenant?.auto_renew ? (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Renouvellement automatique
                      {tenant?.locked_price_usd && ` — $${tenant.locked_price_usd}/mois`}
                      {tenant?.next_billing_date && ` le ${format(new Date(tenant.next_billing_date), 'dd MMMM yyyy', { locale: fr })}`}
                    </p>
                    <button onClick={handleCancelAutoRenew} className="text-xs text-red-500 hover:text-red-600 underline">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Paiement manuel
                    {tenant?.next_billing_date && ` — pense à renouveler avant le ${format(new Date(tenant.next_billing_date), 'dd MMMM yyyy', { locale: fr })}`}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-gray-400">Prix actuel</p>
            <p className="text-xl sm:text-2xl font-medium text-gray-900">{displayPrice(tenant?.locked_price_usd ?? currentPlan?.price ?? 0)}<span className="text-sm font-normal text-gray-400">/mois</span></p>
          </div>
        </div>

        {isTrialing && trialDaysLeft <= 3 && (
          <div className="mt-4 p-3 bg-amber-100 rounded-xl">
            <p className="text-sm text-amber-800 font-medium">⚠ Votre essai expire bientôt. Souscrivez pour continuer à utiliser LiBooks.</p>
          </div>
        )}
      </div>

      {/* Plans */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-medium text-gray-900">Choisissez votre forfait</h2>
          <div className="inline-flex rounded-xl border-2 border-gray-200 p-1 bg-gray-50">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${billingCycle === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Annuel
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">-20%</span>
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => {
            const isCurrent = plan.id === tenant?.plan && (tenant?.billing_cycle ?? 'monthly') === billingCycle;
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 p-5 transition-all ${
                  isCurrent ? 'border-[#0057D9]' : plan.popular ? 'border-blue-300 shadow-md' : 'border-gray-200'
                }`}
              >
                {plan.popular && !isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-blue-500 text-white px-3 py-1 rounded-full">Populaire</span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-[#0057D9] text-white px-3 py-1 rounded-full">Actuel</span>
                )}
                <h3 className="text-base font-medium text-gray-900">{plan.name}</h3>
                {billingCycle === 'annual' ? (
                  <>
                    <p className="text-2xl font-medium text-gray-900 mt-1">
                      {displayPrice(priceForCycle(plan.price, 'annual'))}
                      <span className="text-sm font-normal text-gray-400">/an</span>
                    </p>
                    <p className="text-xs text-gray-400 line-through">{displayPrice(plan.price * 12)}/an</p>
                  </>
                ) : (
                  <p className="text-2xl font-medium text-gray-900 mt-1">{displayPrice(plan.price)}<span className="text-sm font-normal text-gray-400">/mois</span></p>
                )}
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-[#0057D9] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <div className="mt-4 space-y-1.5">
                    <button
                      onClick={() => handleCheckout(plan.id, autoProvider())}
                      disabled={redirecting}
                      className="w-full py-2 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                    >
                      {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
                      {plan.price > (currentPlan?.price || 0) ? t('billing.upgrade') : t('billing.downgrade')}
                    </button>
                    {Object.values(PSP_AVAILABLE).filter(Boolean).length > 1 && (
                      <button
                        onClick={() => setPickingPlanFor(plan.id)}
                        disabled={redirecting}
                        className="w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-60"
                      >
                        Choisir un autre moyen de paiement
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-3">
          Facturation annuelle disponible avec 20% de réduction. Paiement sécurisé via {[
            PSP_AVAILABLE.payunit && 'carte bancaire (PayUnit)',
            PSP_AVAILABLE.flutterwave && 'Mobile Money (Flutterwave)',
            PSP_AVAILABLE.paystack && 'carte bancaire (Paystack)',
            PSP_AVAILABLE.stripe && 'carte bancaire (Stripe)',
            PSP_AVAILABLE.paddle && 'carte bancaire (Paddle)',
          ].filter(Boolean).join(' ou ')}.
        </p>
      </div>

      {/* Payment method */}
      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('billing.paymentMethod')}</h3>
          <button
            onClick={handleManageBilling}
            disabled={redirecting}
            className="flex items-center gap-1.5 text-sm text-[#0057D9] hover:underline disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Gérer
          </button>
        </div>
        <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
          <CreditCard className="w-8 h-8 flex-shrink-0" />
          <p className="text-sm">Aucun moyen de paiement enregistré. Ajoutez une carte pour activer votre abonnement.</p>
        </div>
      </div>

      {pickingPlanFor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPickingPlanFor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Choisis ton moyen de paiement</h3>
            <p className="text-sm text-gray-500 mb-5">Comment veux-tu payer ton abonnement {PLANS.find(p => p.id === pickingPlanFor)?.name} ?</p>
            <div className="space-y-3">
              {PSP_AVAILABLE.payunit && (
                <button
                  onClick={() => handleCheckout(pickingPlanFor, 'payunit')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl hover:border-[#0057D9] transition-colors text-left"
                >
                  <CreditCard className="w-5 h-5 text-[#0057D9] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Carte bancaire</p>
                    <p className="text-xs text-gray-400">Visa, Mastercard — via PayUnit — {Math.round(priceForCycle(PLANS.find(p => p.id === pickingPlanFor)?.price ?? 0, billingCycle) * payunitXafRate).toLocaleString('fr-FR')} FCFA</p>
                  </div>
                </button>
              )}
              {PSP_AVAILABLE.flutterwave && (
                <button
                  onClick={() => handleCheckout(pickingPlanFor, 'flutterwave')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl hover:border-[#0057D9] transition-colors text-left"
                >
                  <Zap className="w-5 h-5 text-[#0057D9] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Mobile Money / Carte locale</p>
                    <p className="text-xs text-gray-400">Orange Money, MTN MoMo, Airtel... — reste sur LiBooks</p>
                  </div>
                </button>
              )}
              {PSP_AVAILABLE.paystack && (
                <button
                  onClick={() => handleCheckout(pickingPlanFor, 'paystack')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl hover:border-[#0057D9] transition-colors text-left"
                >
                  <CreditCard className="w-5 h-5 text-[#0057D9] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Carte bancaire</p>
                    <p className="text-xs text-gray-400">Visa, Mastercard — via Paystack — ${priceForCycle(PLANS.find(p => p.id === pickingPlanFor)?.price ?? 0, billingCycle)}</p>
                  </div>
                </button>
              )}
              {PSP_AVAILABLE.stripe && (
                <button
                  onClick={() => handleCheckout(pickingPlanFor, 'stripe')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl hover:border-[#635BFF] transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-[#635BFF] flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">S</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Carte bancaire</p>
                    <p className="text-xs text-gray-400">Visa, Mastercard, Amex — via Stripe — ${priceForCycle(PLANS.find(p => p.id === pickingPlanFor)?.price ?? 0, billingCycle)}</p>
                  </div>
                </button>
              )}
              {PSP_AVAILABLE.paddle && (
                <button
                  onClick={() => handleCheckout(pickingPlanFor, 'paddle')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-2 border-gray-200 rounded-xl hover:border-gray-900 transition-colors text-left"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-900 flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">P</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Carte bancaire</p>
                    <p className="text-xs text-gray-400">Visa, Mastercard — via Paddle — ${priceForCycle(PLANS.find(p => p.id === pickingPlanFor)?.price ?? 0, billingCycle)}</p>
                  </div>
                </button>
              )}
            </div>
            <button onClick={() => setPickingPlanFor(null)} className="w-full mt-4 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
