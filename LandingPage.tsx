import { useTranslation } from 'react-i18next';
import { CheckCircle, ArrowUpRight, CreditCard, Calendar, Zap, Loader2 } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useState } from 'react';
import toast from 'react-hot-toast';

const PLANS = [
  { id: 'starter', name: 'Starter', price: 9, features: ['Facturation illimitée', 'Gestion stocks', '2 utilisateurs', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 19, features: ['Tout Starter', 'Banque & Mobile Money', 'WhatsApp', 'Multi-magasin', '5 utilisateurs'], popular: true },
  { id: 'premium', name: 'Premium', price: 69, features: ['Tout Pro', 'IA Trésorerie & FX', 'OHADA complet', 'OCR & Paie', 'Utilisateurs illimités'] },
  { id: 'enterprise', name: 'Entreprise', price: 189, features: ['Tout Premium', 'Multi-société', 'API & intégrations', 'Support dédié 24/7', 'SLA 99.9%'] },
];

export default function Billing() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [redirecting, setRedirecting] = useState(false);

  const trialDaysLeft = tenant?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(tenant.trial_ends_at), new Date()))
    : 0;

  const isTrialing = tenant?.subscription_status === 'trialing';
  const isActive = tenant?.subscription_status === 'active';
  const currentPlan = PLANS.find(p => p.id === tenant?.plan);

  function handleStripeRedirect() {
    setRedirecting(true);
    toast('Redirection vers la configuration du paiement Stripe...', { icon: '💳' });
    setTimeout(() => {
      window.open('https://bolt.new/setup/stripe', '_blank');
      setRedirecting(false);
    }, 800);
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('billing.title')}</h1>

      {/* Current plan card */}
      <div className={`rounded-2xl border-2 p-5 sm:p-6 mb-8 ${isTrialing ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-500/10' : 'border-[#10B981] dark:border-[#10B981] bg-[#10B981]/5 dark:bg-[#10B981]/10'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-[#10B981]" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('billing.currentPlan')}</h2>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-1">{currentPlan?.name || tenant?.plan}</p>
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
              <p className="text-sm text-[#10B981] mt-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Abonnement actif
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-gray-400">Prix actuel</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">${currentPlan?.price}<span className="text-sm font-normal text-gray-400">/mois</span></p>
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
        <h2 className="text-lg font-bold text-gray-900 mb-4">Choisissez votre forfait</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => {
            const isCurrent = plan.id === tenant?.plan;
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 p-5 transition-all ${
                  isCurrent ? 'border-[#10B981]' : plan.popular ? 'border-blue-300 shadow-md' : 'border-gray-200'
                }`}
              >
                {plan.popular && !isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-blue-500 text-white px-3 py-1 rounded-full">Populaire</span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-[#10B981] text-white px-3 py-1 rounded-full">Actuel</span>
                )}
                <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                <p className="text-2xl font-bold text-gray-900 mt-1">${plan.price}<span className="text-sm font-normal text-gray-400">/mois</span></p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
                      <CheckCircle className="w-3.5 h-3.5 text-[#10B981] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button
                    onClick={handleStripeRedirect}
                    disabled={redirecting}
                    className="w-full mt-4 py-2 bg-[#10B981] hover:bg-[#0d9e6e] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
                    {plan.price > (currentPlan?.price || 0) ? t('billing.upgrade') : t('billing.downgrade')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-3">Facturation annuelle disponible avec 20% de réduction. Paiement sécurisé via Stripe.</p>
      </div>

      {/* Payment method */}
      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('billing.paymentMethod')}</h3>
          <button
            onClick={handleStripeRedirect}
            disabled={redirecting}
            className="flex items-center gap-1.5 text-sm text-[#10B981] hover:underline disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Gérer
          </button>
        </div>
        <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
          <CreditCard className="w-8 h-8 flex-shrink-0" />
          <p className="text-sm">Aucun moyen de paiement enregistré. Ajoutez une carte pour activer votre abonnement.</p>
        </div>
      </div>
    </div>
  );
}
