import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { PLAN_LIMITS, ModuleKey } from '../../lib/countryData';
import { Link } from 'react-router-dom';

interface PremiumGateProps {
  module: ModuleKey;
  children: React.ReactNode;
}

export default function PremiumGate({ module, children }: PremiumGateProps) {
  const { tenant, isTrialActive } = useTenant();
  const { isSuperAdmin, staffInfo } = useAuth();
  const { t } = useTranslation();
  const plan = tenant?.plan || 'starter';

  // Super admins and internal staff never pay for a plan and always have
  // full platform access — matches the DB-level bypass already granted in
  // RLS (is_super_admin() on every plan-tier policy, migration 023).
  if (isSuperAdmin || staffInfo.isStaff) {
    return <>{children}</>;
  }

  // During an active trial, all premium modules are unlocked.
  if (isTrialActive) {
    return <>{children}</>;
  }

  const allowed = PLAN_LIMITS[plan]?.includes(module);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 px-4 dark:bg-surface-0">
        <div className="w-16 h-16 bg-gray-100 dark:bg-surface-2 rounded-full flex items-center justify-center">
          <Lock className="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Module Premium</h3>
        <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm">
          Ce module fait partie du plan <strong>Premium</strong>.
          Votre forfait actuel (<strong>{plan}</strong>) ne l'inclut pas.
          Passez à un forfait supérieur pour y accéder.
        </p>
        <Link to="/app/billing" className="px-6 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors">
          {t('billing.upgrade')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
