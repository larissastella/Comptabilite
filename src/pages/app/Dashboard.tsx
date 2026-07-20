import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, FileText, Users, Package, AlertTriangle,
  ArrowUpRight, Clock, CheckCircle, XCircle, Award, Shield, UserCog,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link, Navigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { useState } from 'react';

function StatCard({ title, value, icon: Icon, trend, color, to }: {
  title: string; value: string; icon: React.ComponentType<{ className?: string }>;
  trend?: string; color: string; to?: string;
}) {
  const content = (
    <div className={`bg-white dark:bg-surface-1 rounded-2xl p-5 border border-gray-100 dark:border-surface-3 hover:shadow-md dark:hover:shadow-lg transition-shadow ${to ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {to && <ArrowUpRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{title}</p>
      {trend && <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">{trend}</p>}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

const statusBadge = (status: string) => {
  const map: Record<string, React.ReactNode> = {
    draft: <Badge variant="gray">Brouillon</Badge>,
    sent: <Badge variant="info">Envoyée</Badge>,
    paid: <Badge variant="success">Payée</Badge>,
    overdue: <Badge variant="danger">En retard</Badge>,
    cancelled: <Badge variant="gray">Annulée</Badge>,
  };
  return map[status] || <Badge>{status}</Badge>;
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { isSuperAdmin, staffInfo, user } = useAuth();
  const tenantId = tenant?.id;
  const [teamPeriod, setTeamPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const pageClasses = 'dark:bg-surface-0';

  // If platform user without tenant, redirect to super-admin
  if (!tenant && (isSuperAdmin || staffInfo.isStaff)) {
    return <Navigate to="/app/super-admin" replace />;
  }

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;

      const [invoicesRes, customersRes, productsRes, purchasesRes] = await Promise.all([
        supabase.from('sales_invoices').select('status, total, amount_paid, balance_due').eq('tenant_id', tenantId),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('purchase_invoices').select('total, amount_paid').eq('tenant_id', tenantId),
      ]);

      const invoices = invoicesRes.data || [];
      const paidRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
      const receivables = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.balance_due || 0), 0);
      const purchases = (purchasesRes.data || []).reduce((s, i) => s + (i.total || 0), 0);
      const payables = (purchasesRes.data || []).reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amount_paid || 0)), 0);

      return {
        revenue: paidRevenue,
        purchases,
        receivables,
        payables,
        invoiceCount: invoices.length,
        customerCount: customersRes.count || 0,
        productCount: productsRes.count || 0,
      };
    },
    enabled: !!tenantId,
  });

  const { data: recentInvoices } = useQuery({
    queryKey: ['recent-invoices', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_invoices')
        .select('*, customers(name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Build monthly chart data for last 6 months
  const { data: chartData } = useQuery({
    queryKey: ['monthly-chart', tenantId],
    queryFn: async () => {
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, 'MMM', { locale: fr }) };
      });

      const results = await Promise.all(months.map(async m => {
        const { data: inv } = await supabase
          .from('sales_invoices')
          .select('total')
          .eq('tenant_id', tenantId!)
          .eq('status', 'paid')
          .gte('invoice_date', m.start.toISOString().split('T')[0])
          .lte('invoice_date', m.end.toISOString().split('T')[0]);

        const { data: pur } = await supabase
          .from('purchase_invoices')
          .select('total')
          .eq('tenant_id', tenantId!)
          .gte('invoice_date', m.start.toISOString().split('T')[0])
          .lte('invoice_date', m.end.toISOString().split('T')[0]);

        return {
          name: m.label,
          CA: inv?.reduce((s, i) => s + (i.total || 0), 0) || 0,
          Achats: pur?.reduce((s, i) => s + (i.total || 0), 0) || 0,
        };
      }));
      return results;
    },
    enabled: !!tenantId,
  });

  // Team performance — invoices per team member
  const { data: teamData } = useQuery({
    queryKey: ['team-performance', tenantId, teamPeriod],
    queryFn: async () => {
      if (!tenantId) return [];
      const periodDays = teamPeriod === 'year' ? 365 : teamPeriod === 'quarter' ? 90 : 30;
      const since = new Date(Date.now() - periodDays * 86400000).toISOString();

      const { data: invoices } = await supabase
        .from('sales_invoices')
        .select('id, total, status, created_by, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', since);

      const userIds = [...new Set((invoices || []).map((inv: Record<string, unknown>) => inv.created_by).filter(Boolean))] as string[];
      if (userIds.length === 0) return [];

      // Fetch user emails from tenant_users join
      const { data: tenantUsers } = await supabase
        .from('tenant_users')
        .select('user_id')
        .in('user_id', userIds);

      // We can't access auth.users.email from the client, so use user_id as identifier
      const memberMap: Record<string, { user_id: string; email: string; invoice_count: number; total_revenue: number }> = {};
      (invoices || []).forEach((inv: Record<string, unknown>) => {
        const uid = inv.created_by as string;
        if (!uid) return;
        if (!memberMap[uid]) {
          memberMap[uid] = { user_id: uid, email: `User ${uid.slice(0, 8)}`, invoice_count: 0, total_revenue: 0 };
        }
        memberMap[uid].invoice_count += 1;
        if (inv.status === 'paid') {
          memberMap[uid].total_revenue += inv.total as number;
        }
      });

      return Object.values(memberMap).sort((a, b) => b.total_revenue - a.total_revenue);
    },
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
              <div className="w-10 h-10 bg-gray-200 rounded-xl mb-3" />
              <div className="h-7 bg-gray-200 rounded mb-2 w-2/3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {user?.email} · {tenant?.name}
          </p>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.revenue')}
          value={formatCurrency(stats?.revenue || 0)}
          icon={TrendingUp}
          color="bg-[#10B981]"
          to="/app/sales-invoices"
        />
        <StatCard
          title={t('dashboard.purchases')}
          value={formatCurrency(stats?.purchases || 0)}
          icon={TrendingDown}
          color="bg-orange-500"
          to="/app/purchase-invoices"
        />
        <StatCard
          title={t('dashboard.receivables')}
          value={formatCurrency(stats?.receivables || 0)}
          icon={Clock}
          color="bg-blue-500"
          to="/app/sales-invoices"
        />
        <StatCard
          title={t('dashboard.payables')}
          value={formatCurrency(stats?.payables || 0)}
          icon={AlertTriangle}
          color="bg-red-500"
          to="/app/purchase-invoices"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t('dashboard.invoices'), value: stats?.invoiceCount || 0, icon: FileText, color: 'text-[#10B981]' },
          { label: t('dashboard.customers'), value: stats?.customerCount || 0, icon: Users, color: 'text-blue-500' },
          { label: t('dashboard.products'), value: stats?.productCount || 0, icon: Package, color: 'text-purple-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 flex items-center gap-4">
            <s.icon className={`w-7 h-7 sm:w-8 sm:h-8 ${s.color} flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500 truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Recent invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">{t('dashboard.revenueChart')}</h2>
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={60}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                <Tooltip formatter={(v) => formatCurrency(v as number)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="CA" fill="#10B981" radius={[4, 4, 0, 0]} name="CA" />
                <Bar dataKey="Achats" fill="#F97316" radius={[4, 4, 0, 0]} name="Achats" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              Aucune donnée disponible
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">{t('dashboard.recentInvoices')}</h2>
            <Link to="/app/sales-invoices" className="text-xs text-[#10B981] hover:underline">Voir tout</Link>
          </div>

          {!recentInvoices || recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Aucune facture</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentInvoices.map((inv: Record<string, unknown>) => (
                <Link
                  key={inv.id as string}
                  to={`/app/sales-invoices/${inv.id}`}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(inv.customers as { name: string } | null)?.name || 'Client inconnu'}
                    </p>
                    <p className="text-xs text-gray-400">{inv.invoice_number as string}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3">
                    {statusBadge(inv.status as string)}
                    <span className="text-xs font-semibold text-gray-900">{formatCurrency(inv.total as number)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team performance */}
      {teamData && teamData.length > 0 && (
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Performance de l'équipe</h2>
            </div>
            <div className="flex gap-2">
              {(['month', 'quarter', 'year'] as const).map(p => (
                <button key={p} onClick={() => setTeamPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${teamPeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300'}`}>
                  {p === 'month' ? 'Mois' : p === 'quarter' ? 'Trimestre' : 'Année'}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100 dark:border-surface-3">
                {['Membre', 'Factures créées', 'CA généré', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                {teamData.map((member, i) => (
                  <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-surface-2 dark:text-gray-400'}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{member.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{member.invoice_count}</td>
                    <td className="px-3 py-3 text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(member.total_revenue)}</td>
                    <td className="px-3 py-3">
                      <div className="w-24 h-2 bg-gray-100 dark:bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (member.total_revenue / (teamData[0]?.total_revenue || 1)) * 100)}%` }} />
                      </div>
                    </td>
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
