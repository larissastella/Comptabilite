import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield, Users, Building2, Eye, UserCheck, Plus, Trash2, AlertTriangle,
  Globe, TrendingUp, Award, UserCog, BarChart3, MapPin, CreditCard, X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Tenant, SuperAdmin as SuperAdminRecord, InternalStaffRole, InternalStaffUser, PlatformStats, StaffPerformance } from '../../types';
import { format } from 'date-fns';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';
import { Navigate } from 'react-router-dom';

type SATab = 'overview' | 'tenants' | 'admins' | 'staff' | 'performance' | 'logs';

const ADMIN_MODULES = ['tenants', 'subscriptions', 'support', 'commercial', 'statistics', 'staff'];

const PLAN_COLORS: Record<string, string> = {
  starter: '#94a3b8',
  pro: '#3b82f6',
  premium: '#10B981',
  enterprise: '#8b5cf6',
};

const COUNTRY_NAMES: Record<string, string> = {
  CM: 'Cameroun', SN: 'Sénégal', NG: 'Nigéria', KE: 'Kenya', CI: 'Côte d\'Ivoire',
  GH: 'Ghana', ML: 'Mali', BF: 'Burkina Faso', BJ: 'Bénin', TG: 'Togo',
  GA: 'Gabon', CG: 'Congo', CD: 'RD Congo', MA: 'Maroc', TN: 'Tunisie',
  ZA: 'Afrique du Sud', EG: 'Égypte', RW: 'Rwanda', UG: 'Ouganda', TD: 'Tchad',
  CF: 'Centrafrique', GQ: 'Guinée Équatoriale', DJ: 'Djibouti', KM: 'Comores',
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

  if (!isSuperAdmin) return <Navigate to="/app/dashboard" replace />;

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
    enabled: isSuperAdmin && (tab === 'staff' || tab === 'performance'),
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ['sa-staff-users'],
    queryFn: async () => {
      const { data } = await supabase.from('internal_staff_users').select('*, role:internal_staff_roles(*)').order('created_at', { ascending: false });
      return (data || []) as InternalStaffUser[];
    },
    enabled: isSuperAdmin && tab === 'staff',
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['sa-logs'],
    queryFn: async () => {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sa-staff-users'] }); toast.success('Membre du staff ajouté'); setShowAddStaff(false); setNewStaffEmail(''); setNewStaffRoleId(''); },
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
    { key: 'performance', label: 'Performance', icon: TrendingUp },
    { key: 'logs', label: 'Journaux', icon: BarChart3 },
  ];

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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Plateforme LiAfrik Books — Vue globale</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

            {/* By plan */}
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
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Aucune donnée</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Utilisateurs totaux</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{platformStats.totalUsers}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">Tenants actifs</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{platformStats.activeTenants}</p>
            </div>
            <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">MRR estimé</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{platformStats.mrr} <span className="text-base font-normal text-gray-400">USD/mois</span></p>
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
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{(t as Record<string, unknown>).referred_by_staff_code as string || '—'}</td>
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
          {/* Staff users */}
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
                      <td className="px-4 py-3.5 text-sm font-mono text-gray-600 dark:text-gray-300">{su.staff_code || '—'}</td>
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
                      <tr key={sp.staff_code} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : i === 1 ? 'bg-gray-200 text-gray-600 dark:bg-surface-3 dark:text-gray-300' : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' : 'text-gray-400'}`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900 dark:text-white">{sp.email}</td>
                        <td className="px-4 py-3.5 text-sm font-mono text-gray-600 dark:text-gray-300">{sp.staff_code}</td>
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

              {/* Chart */}
              <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Revenus générés par commercial</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={staffPerformance.map(sp => ({ name: sp.email.split('@')[0], Revenus: sp.revenue, Tenants: sp.tenants_count }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Revenus" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Tenants" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                {['Action', 'Module', 'Utilisateur', 'Tenant', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                {(auditLogs as Array<{ id: string; action: string; module: string; user_id?: string; tenant_id?: string; created_at: string }>).map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.action.includes('delete') || log.action.includes('revoke') ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' :
                        log.action.includes('create') || log.action.includes('add') || log.action.includes('grant') ? 'bg-green-100 text-green-700 dark:bg-emerald-500/20 dark:text-emerald-300' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                      }`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-300">{log.module}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-400 font-mono">{log.user_id?.slice(0,8) || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-400 font-mono">{log.tenant_id?.slice(0,8) || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
