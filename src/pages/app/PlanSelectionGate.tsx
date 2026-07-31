import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, CheckCircle, Zap } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';

const PLANS = [
  { id: 'starter', name: 'Starter', price: 9, features: ['Facturation illimitée', 'Gestion stocks', '2 utilisateurs', 'Support email'] },
  { id: 'pro', name: 'Pro', price: 19, features: ['Tout Starter', 'Banque & Mobile Money', 'WhatsApp', 'Multi-magasin', '5 utilisateurs'], popular: true },
  { id: 'premium', name: 'Premium', price: 69, features: ['Tout Pro', 'IA Trésorerie & FX', 'OHADA complet', 'OCR & Paie', 'Utilisateurs illimités'] },
  { id: 'enterprise', name: 'Entreprise', price: 189, features: ['Tout Premium', 'Multi-société', 'API & intégrations', 'Support dédié 24/7', 'SLA 99.9%'] },
];

export default function PlanSelectionGate() {
  const { t } = useTranslation();
  const { tenant } = useTenant();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-0 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t('billing.choosePlan', 'Choisissez votre forfait')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base max-w-md mx-auto">
            Votre essai gratuit de 7 jours est terminé. Vos données sont conservées —
            choisissez un forfait pour retrouver l'accès à votre compte.
          </p>
          {tenant && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Entreprise : <strong>{tenant.name}</strong>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {PLANS.map(plan => {
            const isCurrent = plan.id === tenant?.plan;
            return (
              <div
                key={plan.id}
                className={`relative bg-white dark:bg-surface-1 rounded-2xl border-2 p-4 sm:p-5 transition-all ${
                  isCurrent ? 'border-[#0057D9] dark:border-[#0057D9]' : plan.popular ? 'border-blue-300 dark:border-blue-700 shadow-md' : 'border-gray-200 dark:border-surface-3'
                }`}
              >
                {plan.popular && !isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-blue-500 text-white px-2.5 py-0.5 rounded-full">
                    Populaire
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-[#0057D9] text-white px-2.5 py-0.5 rounded-full">
                    Forfait actuel
                  </span>
                )}
                <h3 className="text-base font-medium text-gray-900 dark:text-white">{plan.name}</h3>
                <p className="text-xl sm:text-2xl font-medium text-gray-900 dark:text-white mt-1">
                  ${plan.price}<span className="text-xs font-normal text-gray-400 dark:text-gray-500">/mois</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <CheckCircle className="w-3.5 h-3.5 text-[#0057D9] flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/app/billing"
                  className={`block w-full mt-4 py-2 text-center text-sm font-semibold rounded-xl transition-colors ${
                    isCurrent
                      ? 'bg-gray-100 text-gray-500 cursor-default'
                      : 'bg-[#0057D9] hover:bg-[#003F9E] text-white'
                  }`}
                >
                  {isCurrent ? 'Forfait actuel' : 'Choisir'}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Link
            to="/app/billing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0057D9] hover:bg-[#003F9E] text-white font-semibold rounded-xl transition-colors"
          >
            <Zap className="w-4 h-4" />
            {t('billing.upgrade', 'Souscrire maintenant')}
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            Paiement sécurisé via Stripe. Annulation à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}
