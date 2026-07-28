import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Tenant, TenantUser } from '../types';
import { useAuth } from './AuthContext';

const ACTIVE_TENANT_KEY = 'active_tenant_id';

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
  // Multi-company (Enterprise)
  availableCompanies: (Tenant & { tenant_user_id: string; role: string })[];
  switchCompany: (tenantId: string) => void;
  canAddCompany: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantUser, setTenantUser] = useState<TenantUser | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<(Tenant & { tenant_user_id: string; role: string })[]>([]);
  const [canAddCompany, setCanAddCompany] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTenant = useCallback(async () => {
    setLoading(true);
    try {
      // Every tenant_users row this user belongs to. RLS (tu_select)
      // already guarantees this can only ever be rows where
      // user_id = auth.uid() -- we never trust or need a client-supplied
      // "which tenant" filter for this query.
      const { data: memberships } = await supabase
        .from('tenant_users')
        .select('*, tenants(*)')
        .eq('user_id', user!.id);

      const companies = (memberships || [])
        .filter((m: Record<string, unknown>) => m.tenants)
        .map((m: Record<string, unknown>) => ({
          ...(m.tenants as Tenant),
          tenant_user_id: m.id as string,
          role: m.role as string,
        }));
      setAvailableCompanies(companies);

      if (companies.length === 0) {
        setTenant(null);
        setTenantUser(null);
        return;
      }

      // Which company is "active" is a pure UI preference stored
      // client-side -- it carries no authority. Every query elsewhere in
      // the app filters by this tenant's id, and RLS independently
      // re-checks membership on every single one of those requests, so
      // even a tampered localStorage value can only ever resolve to "no
      // access" server-side, never to another tenant's data.
      const stored = localStorage.getItem(ACTIVE_TENANT_KEY);
      const active = companies.find(c => c.id === stored) || companies[0];
      localStorage.setItem(ACTIVE_TENANT_KEY, active.id);

      setTenant(active);
      const rawMembership = (memberships || []).find((m: Record<string, unknown>) => m.id === active.tenant_user_id);
      setTenantUser(rawMembership as TenantUser);

      if (companies.length > 1 || active.plan === 'enterprise') {
        const { data: allowed } = await supabase.rpc('can_create_additional_company');
        setCanAddCompany(!!allowed);
      } else {
        setCanAddCompany(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTenant();
    } else {
      setTenant(null);
      setTenantUser(null);
      setAvailableCompanies([]);
      setLoading(false);
    }
  }, [user, loadTenant]);

  function switchCompany(tenantId: string) {
    const target = availableCompanies.find(c => c.id === tenantId);
    if (!target) return; // silently ignore -- not a company this user belongs to
    localStorage.setItem(ACTIVE_TENANT_KEY, tenantId);
    // Full reload keeps every query hook, cached react-query data, and
    // realtime subscription cleanly scoped to the newly active company
    // rather than trying to invalidate everything in place.
    window.location.href = '/app/dashboard';
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
      availableCompanies, switchCompany, canAddCompany,
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
