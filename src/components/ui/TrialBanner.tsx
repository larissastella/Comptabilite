import { Link } from 'react-router-dom';
import { useTenant } from '../../contexts/TenantContext';
import { Clock, AlertTriangle } from 'lucide-react';

export default function TrialBanner() {
  const { isTrialActive, trialDaysLeft, isTrialExpired, hasActiveSubscription } = useTenant();

  if (hasActiveSubscription) return null;

  if (isTrialExpired) {
    return (
      <div className="bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Essai expiré.</strong> Choisissez un forfait pour continuer à utiliser LiAfrik Books.
            </span>
          </div>
          <Link
            to="/app/billing"
            className="flex-shrink-0 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Choisir un forfait
          </Link>
        </div>
      </div>
    );
  }

  if (isTrialActive) {
    const urgent = trialDaysLeft <= 3;
    return (
      <div className={`${urgent ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30' : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'} border-b px-4 py-2.5`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className={`flex items-center gap-2 text-sm ${urgent ? 'text-amber-800 dark:text-amber-300' : 'text-blue-800 dark:text-blue-300'}`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Essai gratuit</strong> — {trialDaysLeft} jour{trialDaysLeft > 1 ? 's' : ''} restant{trialDaysLeft > 1 ? 's' : ''}
              {urgent && ' — souscrivez pour éviter la suspension'}
            </span>
          </div>
          <Link
            to="/app/billing"
            className={`flex-shrink-0 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              urgent ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            Voir les forfaits
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
