import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Tenant, TenantUser } from '../types';
import { useAuth } from './AuthContext';

interface TenantContextValue {
  tenant: Tenant | null;
  tenantUser: TenantUser | null;
  loading: boolean;
  isReadOnly: boolean;
  isAdmin: boolean;
  isTrialing: boolean;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  trialDaysLeft: number;
  hasActiveSubscription: boolean;
  isPlanLocked: boolean;
  refreshTenant: () => Promise<void>;
  formatCurrency: (amount: number) => string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadTenant();
    } else {
      setTenant(null);
      setTenantUser(null);
      setLoading(false);
    }
  }, [user]);

  async function loadTenant() {
    setLoading(true);
    try {
      const { data: tu } = await supabase
        .from('tenant_users')
        .select('*, tenants(*)')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (tu) {
        setTenantUser(tu as TenantUser);
        setTenant((tu as Record<string, unknown>).tenants as Tenant);
      }
    } finally {
      setLoading(false);
    }
  }

  const isTrialing = tenant?.subscription_status === 'trialing';
  const trialEndsAt = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const now = new Date();
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const isTrialActive = isTrialing && trialEndsAt ? trialEndsAt > now : false;
  const isTrialExpired = isTrialing && trialEndsAt ? trialEndsAt <= now : false;

  const hasActiveSubscription = tenant?.subscription_status === 'active';

  // Plan-locked = trial expired AND no active subscription. User must choose a plan.
  const isPlanLocked = isTrialExpired && !hasActiveSubscription;

  const isReadOnly = tenant?.subscription_status === 'read_only' ||
    tenant?.subscription_status === 'canceled' ||
    isTrialExpired;

  const isAdmin = tenantUser?.role === 'admin';

  function formatCurrency(amount: number): string {
    const currency = tenant?.currency || 'XAF';
    const noDecimal = ['XAF', 'XOF', 'XPF', 'BIF', 'CDF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VUV'];
    const decimals = noDecimal.includes(currency) ? 0 : 2;
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
    } catch {
      return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
    }
  }

  return (
    <TenantContext.Provider value={{
      tenant, tenantUser, loading, isReadOnly, isAdmin,
      isTrialing, isTrialActive, isTrialExpired, trialDaysLeft,
      hasActiveSubscription, isPlanLocked,
      refreshTenant: loadTenant, formatCurrency,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
