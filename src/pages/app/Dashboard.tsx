import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, FileText, Users, Package, AlertTriangle,
  ArrowUpRight, Clock, Award, Wallet, Receipt, PiggyBank,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Link, Navigate } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  paid: '#0057D9',
  sent: '#3B82F6',
  overdue: '#EF4444',
  draft: '#94A3B8',
  cancelled: '#6B7280',
};

function StatCard({ title, value, icon: Icon, trend, trendUp, color, to }: {
  title: string; value: string; icon: React.ComponentType<{ className?: string }>;
  trend?: string; trendUp?: boolean; color: string; to?: string;
}) {
  const content = (
    <div className={`bg-white dark:bg-surface-1 rounded-2xl p-5 border border-gray-100 dark:border-surface-3 hover:shadow-lg dark:hover:shadow-lg transition-all duration-200 ${to ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trendUp ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-medium text-gray-900 dark:text-white truncate">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{title}</p>
      {to && <div className="flex items-center gap-1 mt-2 text-xs text-gray-400 dark:text-gray-500">
        <ArrowUpRight className="w-3 h-3" /> Voir détails
      </div>}
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

const chartTooltipStyle = {
  backgroundColor: 'rgba(15, 42, 61, 0.95)',
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#fff',
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { isSuperAdmin, staffInfo, user } = useAuth();
  const tenantId = tenant?.id;
  const [teamPeriod, setTeamPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats', tenantId],
    queryFn: async () => {
      const [invoicesRes, customersRes, productsRes, purchasesRes] = await Promise.all([
        supabase.from('sales_invoices').select('status, total, amount_paid, balance_due, invoice_date').eq('tenant_id', tenantId),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('purchase_invoices').select('total, amount_paid').eq('tenant_id', tenantId),
      ]);

      const invoices = invoicesRes.data || [];
      const paidRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
      const receivables = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.balance_due || 0), 0);
      const purchases = (purchasesRes.data || []).reduce((s, i) => s + (i.total || 0), 0);
      const payables = (purchasesRes.data || []).reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amount_paid || 0)), 0);

      const statusBreakdown = ['paid', 'sent', 'overdue', 'draft'].map(status => ({
        name: status === 'paid' ? 'Payées' : status === 'sent' ? 'Envoyées' : status === 'overdue' ? 'En retard' : 'Brouillons',
        value: invoices.filter(i => i.status === status).length,
        color: STATUS_COLORS[status],
      })).filter(s => s.value > 0);

      return {
        revenue: paidRevenue,
        purchases,
        receivables,
        payables,
        invoiceCount: invoices.length,
        customerCount: customersRes.count || 0,
        productCount: productsRes.count || 0,
        statusBreakdown,
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

        const ca = inv?.reduce((s, i) => s + (i.total || 0), 0) || 0;
        const achats = pur?.reduce((s, i) => s + (i.total || 0), 0) || 0;
        return { name: m.label, CA: ca, Achats: achats, Marge: ca - achats };
      }));
      return results;
    },
    enabled: !!tenantId,
  });

  // Daily cash flow for last 30 days (sparkline-style area chart)
  const { data: cashflowData } = useQuery({
    queryKey: ['cashflow-30d', tenantId],
    queryFn: async () => {
      const days = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() });

      const { data: inv } = await supabase
        .from('sales_invoices')
        .select('total, status, invoice_date')
        .eq('tenant_id', tenantId!)
        .eq('status', 'paid')
        .gte('invoice_date', subDays(new Date(), 29).toISOString().split('T')[0]);

      const { data: pur } = await supabase
        .from('purchase_invoices')
        .select('total, invoice_date')
        .eq('tenant_id', tenantId!)
        .gte('invoice_date', subDays(new Date(), 29).toISOString().split('T')[0]);

      const invByDate: Record<string, number> = {};
      (inv || []).forEach(i => {
        const d = i.invoice_date as string;
        invByDate[d] = (invByDate[d] || 0) + (i.total || 0);
      });
      const purByDate: Record<string, number> = {};
      (pur || []).forEach(p => {
        const d = p.invoice_date as string;
        purByDate[d] = (purByDate[d] || 0) + (p.total || 0);
      });

      return days.map(d => {
        const ds = format(d, 'yyyy-MM-dd');
        const entrees = invByDate[ds] || 0;
        const sorties = purByDate[ds] || 0;
        return { name: format(d, 'dd/MM'), Entrees: entrees, Sorties: sorties, Net: entrees - sorties };
      });
    },
    enabled: !!tenantId,
  });

  const { data: teamData } = useQuery({
    queryKey: ['team-performance', tenantId, teamPeriod],
    queryFn: async () => {
      const periodDays = teamPeriod === 'year' ? 365 : teamPeriod === 'quarter' ? 90 : 30;
      const since = new Date(Date.now() - periodDays * 86400000).toISOString();

      const { data: invoices } = await supabase
        .from('sales_invoices')
        .select('id, total, status, created_by, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', since);

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

  // Top customers by revenue
  const { data: topCustomers } = useQuery({
    queryKey: ['top-customers', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_invoices')
        .select('total, status, customers!inner(id, name)')
        .eq('tenant_id', tenantId!)
        .eq('status', 'paid');

      const customerMap: Record<string, { name: string; revenue: number; count: number }> = {};
      (data || []).forEach((inv: Record<string, unknown>) => {
        const customer = inv.customers as { id: string; name: string } | null;
        if (!customer) return;
        if (!customerMap[customer.id]) {
          customerMap[customer.id] = { name: customer.name, revenue: 0, count: 0 };
        }
        customerMap[customer.id].revenue += inv.total as number;
        customerMap[customer.id].count += 1;
      });

      return Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    },
    enabled: !!tenantId,
  });

  // AR aging breakdown
  const { data: arAging } = useQuery({
    queryKey: ['ar-aging', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_invoices')
        .select('balance_due, invoice_date, status')
        .eq('tenant_id', tenantId!)
        .in('status', ['sent', 'overdue']);

      const now = new Date();
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
      (data || []).forEach((inv: Record<string, unknown>) => {
        const balance = inv.balance_due as number;
        if (!balance || balance <= 0) return;
        const daysOutstanding = Math.floor((now.getTime() - new Date(inv.invoice_date as string).getTime()) / 86400000);
        if (daysOutstanding <= 30) buckets.current += balance;
        else if (daysOutstanding <= 60) buckets.d30 += balance;
        else if (daysOutstanding <= 90) buckets.d60 += balance;
        else if (daysOutstanding <= 120) buckets.d90 += balance;
        else buckets.d90plus += balance;
      });

      return [
        { name: '0-30j', value: buckets.current, color: '#0057D9' },
        { name: '31-60j', value: buckets.d30, color: '#3B82F6' },
        { name: '61-90j', value: buckets.d60, color: '#F59E0B' },
        { name: '91-120j', value: buckets.d90, color: '#F97316' },
        { name: '+120j', value: buckets.d90plus, color: '#EF4444' },
      ].filter(b => b.value > 0);
    },
    enabled: !!tenantId,
  });

  // Compute month-over-month revenue trend
  const momTrend = chartData && chartData.length >= 2
    ? chartData[chartData.length - 1].CA - chartData[chartData.length - 2].CA
    : 0;
  const momPct = chartData && chartData.length >= 2 && chartData[chartData.length - 2].CA > 0
    ? Math.round((momTrend / chartData[chartData.length - 2].CA) * 100)
    : 0;

  if (!tenant && (isSuperAdmin || staffInfo.isStaff)) {
    return <Navigate to="/app/super-admin" replace />;
  }
  if (!tenantId) {
    return <Navigate to="/onboarding" replace />;
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
              <div className="w-11 h-11 bg-gray-200 rounded-xl mb-3" />
              <div className="h-7 bg-gray-200 rounded mb-2 w-2/3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 dark:bg-surface-0 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {user?.email} · {tenant?.name}
          </p>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500 hidden sm:block">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.revenue')}
          value={formatCurrency(stats?.revenue || 0)}
          icon={TrendingUp}
          trend={momPct !== 0 ? `${Math.abs(momPct)}%` : undefined}
          trendUp={momPct >= 0}
          color="bg-[#0057D9]"
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
          { label: t('dashboard.invoices'), value: stats?.invoiceCount || 0, icon: FileText, color: 'text-[#0057D9]', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: t('dashboard.customers'), value: stats?.customerCount || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
          { label: t('dashboard.products'), value: stats?.productCount || 0, icon: Package, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-surface-1 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-surface-3 flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-medium text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue area chart + Invoice status donut */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Revenue trend — area chart */}
        <div className="lg:col-span-3 bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#0057D9]" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('dashboard.revenueChart')}</h2>
            </div>
            {momPct !== 0 && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${momPct > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
                {momPct > 0 ? '+' : ''}{momPct}% vs mois prec.
              </span>
            )}
          </div>
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0057D9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0057D9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="marginGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={60}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="CA" stroke="#0057D9" strokeWidth={2.5} fill="url(#caGradient)" name="Chiffre d'affaires" />
                <Area type="monotone" dataKey="Marge" stroke="#3B82F6" strokeWidth={2} fill="url(#marginGradient)" name="Marge brute" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-gray-400">
              <Wallet className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucune donnée disponible</p>
            </div>
          )}
        </div>

        {/* Invoice status donut */}
        <div className="lg:col-span-2 bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-5 h-5 text-blue-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Statut des factures</h2>
          </div>
          {stats?.statusBreakdown && stats.statusBreakdown.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                    {stats.statusBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                {stats.statusBreakdown.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{s.name}</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-white ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-gray-400">
              <Receipt className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucune facture</p>
            </div>
          )}
        </div>
      </div>

      {/* Cash flow 30-day trend + Recent invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Cash flow line chart */}
        <div className="lg:col-span-3 bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank className="w-5 h-5 text-emerald-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Flux de trésorerie (30 jours)</h2>
          </div>
          {cashflowData && cashflowData.some(d => d.Entrees > 0 || d.Sorties > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashflowData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={60}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Entrees" stroke="#0057D9" strokeWidth={2} dot={false} name="Entrées" />
                <Line type="monotone" dataKey="Sorties" stroke="#F97316" strokeWidth={2} dot={false} name="Sorties" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-gray-400">
              <PiggyBank className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucun flux récent</p>
            </div>
          )}
        </div>

        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('dashboard.recentInvoices')}</h2>
            <Link to="/app/sales-invoices" className="text-xs text-[#0057D9] hover:underline">Voir tout</Link>
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
                  className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-surface-3 last:border-0 hover:bg-gray-50 dark:hover:bg-surface-2 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {(inv.customers as { name: string } | null)?.name || 'Client inconnu'}
                    </p>
                    <p className="text-xs text-gray-400">{inv.invoice_number as string}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3">
                    {statusBadge(inv.status as string)}
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{formatCurrency(inv.total as number)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top customers + AR aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers bar chart */}
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Top 5 clients (CA généré)</h2>
          </div>
          {topCustomers && topCustomers.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topCustomers.map(c => ({ name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name, CA: c.revenue, Factures: c.count }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="CA" fill="#0057D9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-gray-400">
              <Award className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucun client payeur</p>
            </div>
          )}
        </div>

        {/* AR Aging breakdown */}
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Créances échues (aging)</h2>
          </div>
          {arAging && arAging.length > 0 ? (
            <div className="space-y-3">
              {arAging.map(bucket => {
                const total = arAging.reduce((s, b) => s + b.value, 0);
                const pct = total > 0 ? (bucket.value / total) * 100 : 0;
                return (
                  <div key={bucket.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{bucket.name}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(bucket.value)}</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 dark:bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: bucket.color }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 mt-2 border-t border-gray-100 dark:border-surface-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total créances</span>
                  <span className="text-base font-medium text-gray-900 dark:text-white">{formatCurrency(arAging.reduce((s, b) => s + b.value, 0))}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-gray-400">
              <Clock className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucune créance échue</p>
            </div>
          )}
        </div>
      </div>

      {/* Team performance with bar chart */}
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${teamPeriod === p ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300'}`}>
                  {p === 'month' ? 'Mois' : p === 'quarter' ? 'Trimestre' : 'Année'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Leaderboard table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 dark:border-surface-3">
                  {['Membre', 'Factures', 'CA généré', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-surface-3">
                  {teamData.map((member, i) => (
                    <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-surface-2 dark:text-gray-400'}`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{member.email}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{member.invoice_count}</td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(member.total_revenue)}</td>
                      <td className="px-3 py-3">
                        <div className="w-24 h-2 bg-gray-100 dark:bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (member.total_revenue / (teamData[0]?.total_revenue || 1)) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bar chart */}
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamData.map(m => ({ name: m.email.replace('User ', ''), 'CA généré': m.total_revenue, Factures: m.invoice_count }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:opacity-20" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v, name) => name === 'CA généré' ? formatCurrency(Number(v)) : v} />
                  <Bar dataKey="CA généré" fill="#0057D9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
