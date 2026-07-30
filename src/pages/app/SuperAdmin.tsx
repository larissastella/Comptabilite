import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Users, Building2, UserCheck, Plus, Trash2, AlertTriangle,
  Globe, TrendingUp, Award, UserCog, BarChart3, MapPin, CreditCard, X,
  DollarSign, Activity, Target, GitBranch, Search, RefreshCw,
  Ticket, UserPlus, TrendingDown, Zap, Headset, Send,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
  RadialBarChart, RadialBar, LabelList,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Tenant, SuperAdmin as SuperAdminRecord, InternalStaffRole, InternalStaffUser,
  PlatformStats, StaffPerformance, ReferralEvent, CodeAssignment,
} from '../../types';
import { format, subMonths, startOfMonth, eachDayOfInterval, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';
import { Navigate } from 'react-router-dom';

type SATab = 'overview' | 'tenants' | 'admins' | 'staff' | 'commercial' | 'performance' | 'logs' | 'support';

const ADMIN_MODULES = ['tenants', 'subscriptions', 'support', 'commercial', 'statistics', 'staff'];

const PLAN_COLORS: Record<string, string> = {
  starter: '#94a3b8',
  pro: '#3b82f6',
  premium: '#0057D9',
  enterprise: '#8b5cf6',
};

const COUNTRY_NAMES: Record<string, string> = {
  CM: 'Cameroun', SN: 'Sénégal', NG: 'Nigéria', KE: 'Kenya', CI: 'Côte d\'Ivoire',
  GH: 'Ghana', ML: 'Mali', BF: 'Burkina Faso', BJ: 'Bénin', TG: 'Togo',
  GA: 'Gabon', CG: 'Congo', CD: 'RD Congo', MA: 'Maroc', TN: 'Tunisie',
  ZA: 'Afrique du Sud', EG: 'Égypte', RW: 'Rwanda', UG: 'Ouganda', TD: 'Tchad',
  CF: 'Centrafrique', GQ: 'Guinée Équatoriale', DJ: 'Djibouti', KM: 'Comores',
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  code_entered: { label: 'Code saisi', color: '#94a3b8' },
  signup: { label: 'Inscription', color: '#3b82f6' },
  trial_started: { label: 'Essai démarré', color: '#f59e0b' },
  trial_converted: { label: 'Essai converti', color: '#0057D9' },
  trial_expired: { label: 'Essai expiré', color: '#ef4444' },
  churned: { label: 'Désabonnement', color: '#dc2626' },
};

function isSameMonthSafe(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

const chartTooltipStyle = {
  backgroundColor: 'rgba(15, 42, 61, 0.95)',
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
};

export default function SuperAdmin() {
  const { isSuperAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SATab>('overview');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRoleId, setNewStaffRoleId] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>>({});
  const [performancePeriod, setPerformancePeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [logFilter, setLogFilter] = useState('');
  const [logModuleFilter, setLogModuleFilter] = useState('');
  const [commercialStaffFilter, setCommercialStaffFilter] = useState('');



  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage`;

  async function callAdminFunction(action: string, body: Record<string, unknown> = {}) {
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(`${fnUrl}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.session?.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  }

  // ---- Queries ----
  const { data: tenants = [] } = useQuery({
    queryKey: ['sa-tenants'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      return (data || []) as Tenant[];
    },
    enabled: isSuperAdmin,
  });

  const { data: superAdmins = [] } = useQuery({
    queryKey: ['sa-admins'],
    queryFn: async () => {
      const { data } = await supabase.from('super_admins').select('*').order('created_at', { ascending: false });
      return (data || []) as SuperAdminRecord[];
    },
    enabled: isSuperAdmin,
  });

  const { data: staffRoles = [] } = useQuery({
    queryKey: ['sa-staff-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('internal_staff_roles').select('*, internal_staff_role_permissions(*)').order('name');
      return (data || []) as InternalStaffRole[];
    },
    enabled: isSuperAdmin && (tab === 'staff' || tab === 'performance' || tab === 'commercial'),
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['sa-staff-users'],
    queryFn: async () => {
      const { data } = await supabase.from('internal_staff_users').select('*, role:internal_staff_roles(*)').order('created_at', { ascending: false });
      return (data || []) as InternalStaffUser[];
    },
    enabled: isSuperAdmin && (tab === 'staff' || tab === 'commercial'),
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['sa-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    enabled: isSuperAdmin && tab === 'logs',
  });

  const { data: platformStats } = useQuery({
    queryKey: ['sa-platform-stats'],
    queryFn: async () => {
      const result = await callAdminFunction('platform-stats');
      return result as PlatformStats;
    },
    enabled: isSuperAdmin && tab === 'overview',
  });

  const { data: staffPerformance } = useQuery({
    queryKey: ['sa-staff-performance', performancePeriod],
    queryFn: async () => {
      const result = await callAdminFunction('staff-performance', { period: performancePeriod });
      return result.performance as StaffPerformance[];
    },
    enabled: isSuperAdmin && tab === 'performance',
  });

  // Tenant growth over last 6 months
  const { data: growthData } = useQuery({
    queryKey: ['sa-growth', tenants],
    queryFn: async () => {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return { start: startOfMonth(d), label: format(d, 'MMM', { locale: fr }) };
      });
      return months.map(m => {
        const count = tenants.filter(t => new Date(t.created_at) < new Date(m.start.getFullYear(), m.start.getMonth() + 1, 0)).length;
        const newThisMonth = tenants.filter(t => isSameMonthSafe(new Date(t.created_at), m.start)).length;
        const churnedThisMonth = tenants.filter(t =>
          isSameMonthSafe(new Date(t.created_at), m.start) &&
          ['canceled', 'read_only'].includes(t.subscription_status)
        ).length;
        return { name: m.label, Total: count, Nouveaux: newThisMonth, Churn: churnedThisMonth };
      });
    },
    enabled: isSuperAdmin && tab === 'overview' && tenants.length > 0,
  });

  // 30-day activity trend
  const { data: activityData } = useQuery({
    queryKey: ['sa-activity-30d'],
    queryFn: async () => {
      const days = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('created_at')
        .gte('created_at', subDays(new Date(), 29).toISOString());
      const logByDate: Record<string, number> = {};
      (logs || []).forEach(l => {
        const d = format(new Date(l.created_at), 'yyyy-MM-dd');
        logByDate[d] = (logByDate[d] || 0) + 1;
      });
      return days.map(d => ({ name: format(d, 'dd/MM'), Activité: logByDate[format(d, 'yyyy-MM-dd')] || 0 }));
    },
    enabled: isSuperAdmin && tab === 'overview',
  });

  // ---- Commercial Tracking Queries ----
  const { data: referralEvents = [] } = useQuery({
    queryKey: ['sa-referral-events', commercialStaffFilter],
    queryFn: async () => {
      const result = await callAdminFunction('referral-events', {
        staffCode: commercialStaffFilter || undefined,
        limit: 100,
      });
      return result.events as ReferralEvent[];
    },
    enabled: isSuperAdmin && tab === 'commercial',
  });

  const { data: conversionFunnel } = useQuery({
    queryKey: ['sa-conversion-funnel'],
    queryFn: async () => {
      const result = await callAdminFunction('conversion-funnel', { days: 90 });
      return result.funnel as { code_entered: number; signup: number; trial_started: number; trial_converted: number; trial_expired: number; churned: number };
    },
    enabled: isSuperAdmin && tab === 'commercial',
  });

  const { data: churnRate } = useQuery({
    queryKey: ['sa-churn-rate'],
    queryFn: async () => {
      const result = await callAdminFunction('churn-rate', { days: 90 });
      return result.churnRate as number;
    },
    enabled: isSuperAdmin && tab === 'commercial',
  });

  const { data: referredTenants = [] } = useQuery({
    queryKey: ['sa-referred-tenants', commercialStaffFilter],
    queryFn: async () => {
      const result = await callAdminFunction('referred-tenants', {
        staffCode: commercialStaffFilter || undefined,
      });
      return result.tenants as Tenant[];
    },
    enabled: isSuperAdmin && tab === 'commercial',
  });

  const { data: codeAssignments = [] } = useQuery({
    queryKey: ['sa-code-assignments'],
    queryFn: async () => {
      const result = await callAdminFunction('code-assignments');
      return result.assignments as CodeAssignment[];
    },
    enabled: isSuperAdmin && tab === 'commercial',
  });

  // ---- Mutations ----
  const addAdmin = useMutation({
    mutationFn: async () => {
      await callAdminFunction('add-super-admin', { email: newAdminEmail });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-admins'] }); toast.success('Super admin ajouté'); setShowAddAdmin(false); setNewAdminEmail(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAdmin = useMutation({
    mutationFn: async (adminId: string) => {
      await callAdminFunction('delete-super-admin', { adminId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-admins'] }); toast.success('Super admin supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      await callAdminFunction('add-staff', { email: newStaffEmail, roleId: newStaffRoleId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-staff-users'] });
      qc.invalidateQueries({ queryKey: ['sa-code-assignments'] });
      toast.success('Membre du staff ajouté');
      setShowAddStaff(false); setNewStaffEmail(''); setNewStaffRoleId('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteStaff = useMutation({
    mutationFn: async (staffId: string) => {
      await callAdminFunction('delete-staff', { staffId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-staff-users'] }); toast.success('Membre supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleStaff = useMutation({
    mutationFn: async ({ staffId, isActive }: { staffId: string; isActive: boolean }) => {
      await callAdminFunction('toggle-staff', { staffId, isActive });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-staff-users'] }); toast.success('Statut mis à jour'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateCode = useMutation({
    mutationFn: async (staffUserId: string) => {
      await callAdminFunction('generate-code', { staffUserId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-staff-users'] });
      qc.invalidateQueries({ queryKey: ['sa-code-assignments'] });
      toast.success('Code commercial généré');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addRole = useMutation({
    mutationFn: async () => {
      await callAdminFunction('add-role', { name: newRoleName });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-staff-roles'] }); toast.success('Rôle créé'); setShowAddRole(false); setNewRoleName(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePermissions = useMutation({
    mutationFn: async (roleId: string) => {
      const permissions = ADMIN_MODULES.map(m => ({
        module: m,
        can_view: permDraft[m]?.can_view ?? false,
        can_create: permDraft[m]?.can_create ?? false,
        can_edit: permDraft[m]?.can_edit ?? false,
        can_delete: permDraft[m]?.can_delete ?? false,
      })).filter(p => p.can_view || p.can_create || p.can_edit || p.can_delete);
      await callAdminFunction('update-permissions', { roleId, permissions });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-staff-roles'] }); toast.success('Permissions mises à jour'); setEditingRoleId(null); setPermDraft({}); },
    onError: (err: Error) => toast.error(err.message),
  });

  // ---- Helpers ----
  const planBadge = (plan: string) => {
    const map: Record<string, 'gray' | 'info' | 'success' | 'danger'> = { starter: 'gray', pro: 'info', premium: 'success', enterprise: 'danger' };
    return <Badge variant={map[plan] || 'gray'}>{plan}</Badge>;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, 'gray' | 'info' | 'success' | 'danger' | 'warning'> = {
      trialing: 'warning' as never, active: 'success', past_due: 'danger', canceled: 'gray', read_only: 'gray',
    };
    return <Badge variant={map[status] || 'gray'}>{status}</Badge>;
  };

  function startEditPermissions(role: InternalStaffRole) {
    const draft: Record<string, { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }> = {};
    ADMIN_MODULES.forEach(m => {
      const perm = role.permissions?.find(p => p.module === m);
      draft[m] = {
        can_view: perm?.can_view ?? false,
        can_create: perm?.can_create ?? false,
        can_edit: perm?.can_edit ?? false,
        can_delete: perm?.can_delete ?? false,
      };
    });
    setPermDraft(draft);
    setEditingRoleId(role.id);
  }

  const tabs: { key: SATab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'overview', label: 'Plateforme', icon: Globe },
    { key: 'tenants', label: 'Tenants', icon: Building2 },
    { key: 'admins', label: 'Super Admins', icon: Shield },
    { key: 'staff', label: 'Équipe interne', icon: UserCog },
    { key: 'commercial', label: 'Commercial', icon: Target },
    { key: 'support', label: 'Support', icon: Headset },
    { key: 'performance', label: 'Performance', icon: TrendingUp },
    { key: 'logs', label: 'Journaux', icon: BarChart3 },
  ];

  // Filtered logs
  const filteredLogs = (auditLogs as Array<Record<string, unknown>>).filter(log => {
    const actionMatch = !logFilter || (log.action as string)?.toLowerCase().includes(logFilter.toLowerCase());
    const moduleMatch = !logModuleFilter || log.module === logModuleFilter;
    return actionMatch && moduleMatch;
  });

  // Funnel data
  const funnelData = conversionFunnel ? [
    { name: 'Code saisi', value: conversionFunnel.code_entered, fill: '#94a3b8' },
    { name: 'Inscription', value: conversionFunnel.signup, fill: '#3b82f6' },
    { name: 'Essai démarré', value: conversionFunnel.trial_started, fill: '#f59e0b' },
    { name: 'Essai converti', value: conversionFunnel.trial_converted, fill: '#0057D9' },
  ].filter(d => d.value > 0) : [];

  const funnelConversionRate = conversionFunnel && conversionFunnel.code_entered > 0
    ? Math.round((conversionFunnel.trial_converted / conversionFunnel.code_entered) * 100)
    : 0;

  if (!isSuperAdmin) return <Navigate to="/app/dashboard" replace />;

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Super Admin</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500">Accès restreint — Toutes les actions sont journalisées</p>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Zone d'administration globale. Toute action est tracée avec votre identité, l'horodatage et la justification.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Tenants', value: tenants.length, icon: Building2, color: 'bg-blue-500' },
          { label: 'Actifs', value: tenants.filter(t => t.subscription_status === 'active').length, icon: UserCheck, color: 'bg-emerald-500' },
          { label: 'En essai', value: tenants.filter(t => t.subscription_status === 'trialing').length, icon: Users, color: 'bg-amber-500' },
          { label: 'Super Admins', value: superAdmins.length, icon: Shield, color: 'bg-purple-500' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5 flex items-center gap-4">
            <div className={`w-10 h-10 ${s.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- OVERVIEW ---- */}
      {tab === 'overview' && platformStats && (
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Plateforme LiBooks — Vue globale</h2>

          {/* Growth trend + activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Croissance des tenants (6 mois)</h3>
              </div>
              {growthData && growthData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={growthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0057D9" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0057D9" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Total" stroke="#0057D9" strokeWidth={2.5} fill="url(#totalGrad)" name="Total cumulé" />
                    <Area type="monotone" dataKey="Nouveaux" stroke="#3B82F6" strokeWidth={2} fill="url(#newGrad)" name="Nouveaux / mois" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Aucune donnée</div>
              )}
            </div>

            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Activité plateforme (30 jours)</h3>
              </div>
              {activityData && activityData.some(d => d.Activité > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={activityData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Line type="monotone" dataKey="Activité" stroke="#3B82F6" strokeWidth={2} dot={false} name="Actions journalisées" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Aucune activité récente</div>
              )}
            </div>
          </div>

          {/* Revenue by plan + Country + Plan distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue by plan bar chart */}
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Revenus par forfait</h3>
              </div>
              {platformStats.revenueByPlan && platformStats.revenueByPlan.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={platformStats.revenueByPlan.map(r => ({ name: r.plan, Revenus: r.revenue }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `$${Number(v)}/mois`} />
                    <Bar dataKey="Revenus" radius={[4, 4, 0, 0]}>
                      {platformStats.revenueByPlan.map(r => <Cell key={r.plan} fill={PLAN_COLORS[r.plan] || '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Aucun revenu</div>
              )}
            </div>

            {/* By country */}
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tenants par pays</h3>
              </div>
              {platformStats.byCountry.length > 0 ? (
                <div className="space-y-2">
                  {platformStats.byCountry.sort((a, b) => b.count - a.count).map(c => (
                    <div key={c.country} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-surface-3 last:border-0">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{COUNTRY_NAMES[c.country] || c.country}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{c.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>
              )}
            </div>

            {/* By plan pie */}
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Distribution par forfait</h3>
              </div>
              {platformStats.byPlan.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={platformStats.byPlan.map(p => ({ name: p.plan, value: p.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                      {platformStats.byPlan.map(p => <Cell key={p.plan} fill={PLAN_COLORS[p.plan] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>
              )}
            </div>
          </div>

          {/* KPI summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Utilisateurs</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{platformStats.totalUsers}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Tenants actifs</p>
              </div>
              <p className="text-3xl font-bold text-emerald-600">{platformStats.activeTenants}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">MRR estimé</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{platformStats.mrr} <span className="text-base font-normal text-gray-400">$/mois</span></p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Taux de churn</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{platformStats.churnRate}%</p>
            </div>
          </div>
        </div>
      )}

      {/* ---- TENANTS ---- */}
      {tab === 'tenants' && (
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                {['Entreprise', 'Pays', 'Devise', 'Plan', 'Statut', 'Code commercial', 'Créé le'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{t.id.slice(0,8)}...</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{COUNTRY_NAMES[t.country] || t.country}</td>
                    <td className="px-4 py-3.5 text-sm font-mono text-gray-600 dark:text-gray-300">{t.currency}</td>
                    <td className="px-4 py-3.5">{planBadge(t.plan)}</td>
                    <td className="px-4 py-3.5">{statusBadge(t.subscription_status)}</td>
                    <td className="px-4 py-3.5">
                      {t.referred_by_staff_code ? (
                        <span className="text-sm font-mono text-emerald-600 dark:text-emerald-400">{t.referred_by_staff_code}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{format(new Date(t.created_at), 'dd/MM/yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- SUPER ADMINS ---- */}
      {tab === 'admins' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAddAdmin(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">
              <Plus className="w-4 h-4" /> Ajouter un Super Admin
            </button>
          </div>
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                {['Email', 'Ajouté le', 'Ajouté par', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                {superAdmins.map(sa => (
                  <tr key={sa.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                          <Shield className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{sa.email}</span>
                        {sa.user_id === user?.id && <Badge variant="success">Vous</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{format(new Date(sa.created_at), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-400 font-mono">{sa.added_by?.slice(0,8) || 'seed'}...</td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => {
                          if (sa.user_id === user?.id) { toast.error('Vous ne pouvez pas vous supprimer'); return; }
                          if (confirm(`Supprimer ${sa.email} des super admins ?`)) deleteAdmin.mutate(sa.id);
                        }}
                        className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">Au moins 2 Super Admin doivent rester actifs à tout moment.</p>

          {showAddAdmin && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ajouter un Super Admin</h2>
                  <button onClick={() => setShowAddAdmin(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl mb-4">
                  <p className="text-sm text-amber-800 dark:text-amber-300">Cet utilisateur aura accès à tous les tenants. Action journalisée.</p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email de l'utilisateur</label>
                  <input type="email" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <p className="text-xs text-gray-400 mt-1">L'utilisateur doit avoir un compte existant.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAddAdmin(false)} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 rounded-xl text-sm">Annuler</button>
                  <button onClick={() => addAdmin.mutate()} disabled={!newAdminEmail || addAdmin.isPending}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                    {addAdmin.isPending ? '...' : 'Ajouter'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- STAFF ---- */}
      {tab === 'staff' && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Membres du staff interne</h3>
              <button onClick={() => setShowAddStaff(true)} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                  {['Email', 'Rôle', 'Code commercial', 'Statut', 'Créé le', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                  {staffUsers.map(su => (
                    <tr key={su.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{su.email}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={su.role?.name === 'Staff Admin' ? 'danger' : su.role?.name === 'Commercial' ? 'info' : 'gray'}>
                          {su.role?.name || '—'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5">
                        {su.staff_code ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-emerald-600 dark:text-emerald-400">{su.staff_code}</span>
                            <button
                              onClick={() => { if (confirm(`Générer un nouveau code pour ${su.email} ?`)) generateCode.mutate(su.id); }}
                              className="text-gray-400 hover:text-emerald-600"
                              title="Générer un nouveau code"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => generateCode.mutate(su.id)}
                            disabled={generateCode.isPending}
                            className="text-xs text-emerald-600 hover:underline"
                          >
                            Générer
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => toggleStaff.mutate({ staffId: su.id, isActive: !su.is_active })}
                          className={`text-xs px-2 py-1 rounded-full font-medium ${su.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-surface-2 dark:text-gray-400'}`}
                        >
                          {su.is_active ? 'Actif' : 'Inactif'}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{format(new Date(su.created_at), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => { if (confirm(`Supprimer ${su.email} du staff ?`)) deleteStaff.mutate(su.id); }}
                          className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Roles + permissions */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Rôles internes & permissions</h3>
              <button onClick={() => setShowAddRole(true)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-surface-2">
                <Plus className="w-4 h-4" /> Nouveau rôle
              </button>
            </div>
            <div className="space-y-3">
              {staffRoles.map(role => (
                <div key={role.id} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{role.name}</span>
                      {role.is_system && <Badge variant="info">Système</Badge>}
                    </div>
                    <button
                      onClick={() => editingRoleId === role.id ? setEditingRoleId(null) : startEditPermissions(role)}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      {editingRoleId === role.id ? 'Annuler' : 'Modifier permissions'}
                    </button>
                  </div>

                  {editingRoleId === role.id ? (
                    <div className="space-y-2">
                      {ADMIN_MODULES.map(m => (
                        <div key={m} className="flex items-center gap-4 py-1.5 border-b border-gray-50 dark:border-surface-3 last:border-0">
                          <span className="text-sm text-gray-700 dark:text-gray-300 w-32 capitalize">{m}</span>
                          <div className="flex gap-3">
                            {(['can_view', 'can_create', 'can_edit', 'can_delete'] as const).map(perm => (
                              <label key={perm} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <input
                                  type="checkbox"
                                  checked={permDraft[m]?.[perm] ?? false}
                                  onChange={e => setPermDraft(prev => ({ ...prev, [m]: { ...prev[m], [perm]: e.target.checked } }))}
                                  className="rounded text-emerald-600"
                                />
                                {perm.replace('can_', '')}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => updatePermissions.mutate(role.id)}
                        disabled={updatePermissions.isPending}
                        className="mt-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {updatePermissions.isPending ? '...' : 'Enregistrer'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {role.permissions && role.permissions.length > 0 ? role.permissions.map(p => (
                        <span key={p.id} className="text-xs px-2 py-1 bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 rounded-lg">
                          {p.module}: {[p.can_view && 'V', p.can_create && 'C', p.can_edit && 'E', p.can_delete && 'D'].filter(Boolean).join('+')}
                        </span>
                      )) : <span className="text-xs text-gray-400">Aucune permission</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add staff modal */}
          {showAddStaff && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ajouter un membre du staff</h2>
                  <button onClick={() => setShowAddStaff(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input type="email" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rôle</label>
                    <select value={newStaffRoleId} onChange={e => setNewStaffRoleId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">— Sélectionner —</option>
                      {staffRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowAddStaff(false)} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 rounded-xl text-sm">Annuler</button>
                  <button onClick={() => addStaff.mutate()} disabled={!newStaffEmail || !newStaffRoleId || addStaff.isPending}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                    {addStaff.isPending ? '...' : 'Ajouter'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add role modal */}
          {showAddRole && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nouveau rôle interne</h2>
                  <button onClick={() => setShowAddRole(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du rôle</label>
                  <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="ex: Commercial Senior" />
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowAddRole(false)} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 rounded-xl text-sm">Annuler</button>
                  <button onClick={() => addRole.mutate()} disabled={!newRoleName || addRole.isPending}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                    {addRole.isPending ? '...' : 'Créer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- COMMERCIAL TRACKING ---- */}
      {tab === 'commercial' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Suivi Commercial & Tracking</h2>
            <select
              value={commercialStaffFilter}
              onChange={e => setCommercialStaffFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tous les commerciaux</option>
              {staffUsers.filter(s => s.staff_code).map(s => (
                <option key={s.id} value={s.staff_code}>{s.email} ({s.staff_code})</option>
              ))}
            </select>
          </div>

          {/* Commercial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-4 h-4 text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Codes actifs</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{staffUsers.filter(s => s.staff_code && s.is_active).length}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="w-4 h-4 text-emerald-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Tenants référés</p>
              </div>
              <p className="text-3xl font-bold text-emerald-600">{referredTenants.length}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-amber-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Taux conversion</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{funnelConversionRate}%</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Taux de churn</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{churnRate || 0}%</p>
            </div>
          </div>

          {/* Conversion funnel + Churn radial */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Funnel bar chart */}
            <div className="lg:col-span-2 bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Entonnoir de conversion (90 jours)</h3>
              </div>
              {funnelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#6B7280', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Aucune donnée de conversion</div>
              )}
            </div>

            {/* Churn radial */}
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Taux de churn</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <RadialBarChart innerRadius="60%" outerRadius="100%" data={[{ name: 'Churn', value: churnRate || 0, fill: '#ef4444' }]} startAngle={90} endAngle={-270}>
                  <RadialBar background dataKey="value" cornerRadius={10} />
                  <LabelList position="center" formatter={() => `${churnRate || 0}%`} style={{ fontSize: 28, fontWeight: 700, fill: '#1f2937' }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 text-center mt-2">Sur 90 jours</p>
            </div>
          </div>

          {/* Referred tenants table */}
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-surface-3">
              <Building2 className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tenants référés par les commerciaux</h3>
            </div>
            {referredTenants.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                    {['Entreprise', 'Pays', 'Plan', 'Statut', 'Code', 'Créé le'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                    {referredTenants.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{t.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{COUNTRY_NAMES[t.country] || t.country}</td>
                        <td className="px-4 py-3">{planBadge(t.plan)}</td>
                        <td className="px-4 py-3">{statusBadge(t.subscription_status)}</td>
                        <td className="px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400">{t.referred_by_staff_code}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{format(new Date(t.created_at), 'dd/MM/yyyy')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucun tenant référé</p>
            )}
          </div>

          {/* Referral events timeline */}
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Chronologie des événements de parrainage</h3>
            </div>
            {referralEvents.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {referralEvents.map(ev => {
                  const eventInfo = EVENT_LABELS[ev.event_type] || { label: ev.event_type, color: '#94a3b8' };
                  return (
                    <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-gray-50 dark:border-surface-3 last:border-0">
                      <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: eventInfo.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{eventInfo.label}</span>
                          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{ev.staff_code}</span>
                          {ev.tenants && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">→ {ev.tenants.name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{format(new Date(ev.created_at), 'dd/MM/yyyy à HH:mm')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucun événement de parrainage</p>
            )}
          </div>

          {/* Code assignment history */}
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-surface-3">
              <Ticket className="w-5 h-5 text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Historique d'assignation des codes</h3>
            </div>
            {codeAssignments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                    {['Code', 'Membre', 'Action', 'Notes', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                    {codeAssignments.map(ca => (
                      <tr key={ca.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400">{ca.staff_code}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{ca.staff?.email || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={ca.action === 'generated' ? 'success' : ca.action === 'revoked' ? 'danger' : 'info'}>
                            {ca.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{ca.notes || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{format(new Date(ca.created_at), 'dd/MM/yyyy HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucun historique d'assignation</p>
            )}
          </div>
        </div>
      )}

      {/* ---- PERFORMANCE ---- */}
      {tab === 'performance' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Performance des commerciaux</h3>
            <div className="flex gap-2">
              {(['month', 'quarter', 'year'] as const).map(p => (
                <button key={p} onClick={() => setPerformancePeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${performancePeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300'}`}>
                  {p === 'month' ? 'Mois' : p === 'quarter' ? 'Trimestre' : 'Année'}
                </button>
              ))}
            </div>
          </div>

          {staffPerformance && staffPerformance.length > 0 ? (
            <>
              {/* Leaderboard */}
              <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-surface-3">
                  <Award className="w-5 h-5 text-amber-500" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Classement</h4>
                </div>
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                    {['#', 'Commercial', 'Code', 'Tenants', 'Convertis', 'Taux', 'Revenus'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                    {staffPerformance.map((sp, i) => (
                      <tr key={sp.staff_code || sp.email} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : i === 1 ? 'bg-gray-200 text-gray-600 dark:bg-surface-3 dark:text-gray-300' : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' : 'text-gray-400'}`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{sp.email}</td>
                        <td className="px-4 py-3.5 text-sm font-mono text-gray-600 dark:text-gray-300">{sp.staff_code || '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-900 dark:text-white">{sp.tenants_count}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-900 dark:text-white">{sp.paid_count}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-sm font-medium ${sp.conversion_rate >= 50 ? 'text-emerald-600' : sp.conversion_rate >= 25 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {sp.conversion_rate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm font-bold text-gray-900 dark:text-white">{sp.revenue} USD</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue bar chart */}
                <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Revenus générés par commercial</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={staffPerformance.map(sp => ({ name: sp.email.split('@')[0], Revenus: sp.revenue, Tenants: sp.tenants_count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Revenus" fill="#0057D9" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Tenants" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Conversion rate radial */}
                <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Taux de conversion par commercial</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={staffPerformance.map(sp => ({ name: sp.email.split('@')[0], Conversion: sp.conversion_rate }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} unit="%" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${Number(v).toFixed(0)}%`} />
                      <Bar dataKey="Conversion" radius={[0, 4, 4, 0]}>
                        {staffPerformance.map((sp, i) => (
                          <Cell key={i} fill={sp.conversion_rate >= 50 ? '#0057D9' : sp.conversion_rate >= 25 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-12 text-center">
              <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Aucune donnée de performance pour cette période</p>
            </div>
          )}
        </div>
      )}

      {/* ---- LOGS ---- */}
      {tab === 'logs' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                placeholder="Filtrer par action..."
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              value={logModuleFilter}
              onChange={e => setLogModuleFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Tous les modules</option>
              <option value="super_admin">Super Admin</option>
              <option value="staff">Staff</option>
              <option value="commercial">Commercial</option>
              <option value="tenants">Tenants</option>
              <option value="subscriptions">Subscriptions</option>
              <option value="support">Support</option>
              <option value="statistics">Statistics</option>
            </select>
          </div>

          {/* Logs table */}
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                  {['Action', 'Module', 'Utilisateur', 'Tenant', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                  {filteredLogs.map((log) => {
                    const action = log.action as string;
                    const module = log.module as string;
                    return (
                      <tr key={log.id as string} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            action?.includes('delete') || action?.includes('revoke') ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' :
                            action?.includes('create') || action?.includes('add') || action?.includes('grant') ? 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-300' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          }`}>{action}</span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300">{module}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-400 font-mono">{(log.user_id as string)?.slice(0,8) || '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-400 font-mono">{(log.tenant_id as string)?.slice(0,8) || '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{format(new Date(log.created_at as string), 'dd/MM/yyyy HH:mm')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredLogs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Aucun journal trouvé</p>
            )}
          </div>
          <p className="text-xs text-gray-400">{filteredLogs.length} entrées affichées sur {auditLogs.length}</p>
        </div>
      )}

      {tab === 'support' && <SupportPanel />}
    </div>
  );
}

function SupportPanel() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const { data: conversations = [] } = useQuery({
    queryKey: ['sa-support-conversations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('support_conversations')
        .select('*, tenants(name)')
        .order('last_message_at', { ascending: false })
        .limit(100);
      return data || [];
    },
    refetchInterval: 10000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['sa-support-messages', selectedId],
    queryFn: async () => {
      const { data } = await supabase.from('support_messages').select('*').eq('conversation_id', selectedId!).order('created_at');
      return data || [];
    },
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  const claimConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('escalate_conversation_to_staff', { p_conversation_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-support-conversations'] }),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('support_messages').insert({
        conversation_id: selectedId, sender: 'staff', staff_id: user?.id, content: reply,
      });
      if (error) throw error;
      await supabase.from('support_conversations').update({ last_message_at: new Date().toISOString(), status: 'escalated' }).eq('id', selectedId);
    },
    onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['sa-support-messages'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('support_conversations').update({ status: 'resolved' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-support-conversations'] }),
  });

  const escalatedCount = conversations.filter((c: Record<string, unknown>) => c.status === 'escalated').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)]">
      <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
          {escalatedCount > 0 && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">{escalatedCount} en attente</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Aucune conversation</p>
          ) : conversations.map((c: Record<string, unknown>) => (
            <button
              key={c.id as string}
              onClick={() => setSelectedId(c.id as string)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === c.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {(c.tenants as { name?: string } | null)?.name || (c.visitor_name as string) || 'Visiteur anonyme'}
                </p>
                {c.status === 'escalated' && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />}
                {c.status === 'resolved' && <span className="w-2 h-2 bg-gray-300 rounded-full flex-shrink-0" />}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {c.status === 'ai' ? 'IA en charge' : c.status === 'escalated' ? 'Escaladée' : 'Résolue'} · {new Date(c.last_message_at as string).toLocaleString('fr-FR')}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            <Headset className="w-8 h-8 mr-2 opacity-40" /> Sélectionne une conversation
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Conversation</p>
              <div className="flex gap-2">
                <button onClick={() => claimConversation.mutate(selectedId)} className="text-xs px-3 py-1.5 bg-[#0057D9] text-white rounded-lg font-medium">Prendre en charge</button>
                <button onClick={() => resolveConversation.mutate(selectedId)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg font-medium">Marquer résolu</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m: Record<string, unknown>) => (
                <div key={m.id as string} className={`flex ${m.sender === 'staff' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.sender === 'staff' ? 'bg-[#0057D9] text-white' : m.sender === 'ai' ? 'bg-blue-50 text-gray-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="whitespace-pre-wrap">{m.content as string}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100 flex items-center gap-2">
              <input
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && reply.trim()) sendReply.mutate(); }}
                placeholder="Répondre au client..."
                className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
              />
              <button onClick={() => sendReply.mutate()} disabled={!reply.trim() || sendReply.isPending} className="w-10 h-10 bg-[#0057D9] text-white rounded-xl flex items-center justify-center disabled:opacity-40">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
