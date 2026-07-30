import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, TrendingUp, TrendingDown, Scale, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ReportPdfDocument } from '../../lib/reportPdf';
import { pdf } from '@react-pdf/renderer';
import toast from 'react-hot-toast';

type ReportTab = 'income' | 'balance' | 'vat' | 'trial';

const COLORS = ['#0057D9', '#F97316', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#EAB308', '#EF4444'];

export default function Reports() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const [activeTab, setActiveTab] = useState<ReportTab>('income');
  const [downloading, setDownloading] = useState(false);
  const [period, setPeriod] = useState({ from: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') });

  const { data: salesData } = useQuery({
    queryKey: ['report-sales', tenant?.id, period],
    queryFn: async () => {
      const { data } = await supabase.from('sales_invoices').select('invoice_date, total, status, vat_amount')
        .eq('tenant_id', tenant!.id).gte('invoice_date', period.from).lte('invoice_date', period.to);
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const { data: purchasesData } = useQuery({
    queryKey: ['report-purchases', tenant?.id, period],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_invoices').select('invoice_date, total, vat_amount')
        .eq('tenant_id', tenant!.id).gte('invoice_date', period.from).lte('invoice_date', period.to);
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const { data: txLines } = useQuery({
    queryKey: ['report-txlines', tenant?.id, period],
    queryFn: async () => {
      const { data } = await supabase.from('transaction_lines')
        .select('debit, credit, accounts(code, name, account_type, account_class)')
        .eq('tenant_id', tenant!.id);
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const totalRevenue = (salesData || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const totalPurchases = (purchasesData || []).reduce((s, i) => s + (i.total || 0), 0);
  const grossProfit = totalRevenue - totalPurchases;
  const vatCollected = (salesData || []).reduce((s, i) => s + (i.vat_amount || 0), 0);
  const vatDeductible = (purchasesData || []).reduce((s, i) => s + (i.vat_amount || 0), 0);
  const vatDue = vatCollected - vatDeductible;

  // Monthly breakdown
  const monthlyData = Array.from({ length: 3 }, (_, i) => {
    const d = subMonths(new Date(), 2 - i);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const revenue = (salesData || []).filter(inv => inv.invoice_date >= start && inv.invoice_date <= end && inv.status === 'paid').reduce((s, inv) => s + (inv.total || 0), 0);
    const purchases = (purchasesData || []).filter(inv => inv.invoice_date >= start && inv.invoice_date <= end).reduce((s, inv) => s + (inv.total || 0), 0);
    return { name: format(d, 'MMM yyyy', { locale: fr }), Revenus: revenue, Achats: purchases, Marge: revenue - purchases };
  });

  // Trial balance
  const trialBalance = (txLines || []).reduce((acc: Record<string, { code: string; name: string; debit: number; credit: number; type: string }>, l) => {
    const acc_data = (l as Record<string, unknown>).accounts as { code: string; name: string; account_type: string; account_class: number } | null;
    if (!acc_data) return acc;
    if (!acc[acc_data.code]) acc[acc_data.code] = { code: acc_data.code, name: acc_data.name, debit: 0, credit: 0, type: acc_data.account_type };
    acc[acc_data.code].debit += (l as { debit: number }).debit || 0;
    acc[acc_data.code].credit += (l as { credit: number }).credit || 0;
    return acc;
  }, {});
  const tbRows = Object.values(trialBalance).sort((a, b) => a.code.localeCompare(b.code));

  // Balance sheet: assets vs liabilities
  const balanceData = (() => {
    const assets = (txLines || []).filter(l => {
      const acc = (l as Record<string, unknown>).accounts as { account_type: string } | null;
      return acc?.account_type === 'asset';
    }).reduce((s, l) => s + ((l as { debit: number }).debit - (l as { credit: number }).credit), 0);
    const liabilities = (txLines || []).filter(l => {
      const acc = (l as Record<string, unknown>).accounts as { account_type: string } | null;
      return acc?.account_type === 'liability';
    }).reduce((s, l) => s + ((l as { credit: number }).credit - (l as { debit: number }).debit), 0);
    const equity = (txLines || []).filter(l => {
      const acc = (l as Record<string, unknown>).accounts as { account_type: string } | null;
      return acc?.account_type === 'equity';
    }).reduce((s, l) => s + ((l as { credit: number }).credit - (l as { debit: number }).debit), 0);
    return { assets, liabilities, equity };
  })();

  const pieData = [
    { name: 'Actif', value: Math.max(0, balanceData.assets) },
    { name: 'Passif', value: Math.max(0, balanceData.liabilities) },
    { name: 'Capitaux propres', value: Math.max(0, balanceData.equity) },
  ].filter(d => d.value > 0);

  async function downloadPdf() {
    setDownloading(true);
    try {
      let title = '';
      let kpis: Array<{ label: string; value: string }> = [];
      let columns: string[] = [];
      let rows: Array<Array<string | number>> = [];
      let totalRow: Array<string | number> | undefined;

      if (activeTab === 'income') {
        title = 'Compte de résultat';
        kpis = [
          { label: 'Chiffre d\'affaires', value: totalRevenue.toLocaleString('fr-FR') },
          { label: 'Achats', value: totalPurchases.toLocaleString('fr-FR') },
          { label: 'Marge brute', value: grossProfit.toLocaleString('fr-FR') },
          { label: '% Marge', value: totalRevenue > 0 ? `${((grossProfit / totalRevenue) * 100).toFixed(1)}%` : '—' },
        ];
        columns = ['Mois', 'Revenus', 'Achats', 'Marge'];
        rows = monthlyData.map(d => [d.name, d.Revenus, d.Achats, d.Marge]);
        totalRow = ['Total', totalRevenue, totalPurchases, grossProfit];
      } else if (activeTab === 'vat') {
        title = 'Déclaration TVA';
        kpis = [
          { label: 'TVA collectée', value: vatCollected.toLocaleString('fr-FR') },
          { label: 'TVA déductible', value: vatDeductible.toLocaleString('fr-FR') },
          { label: 'TVA à reverser', value: vatDue.toLocaleString('fr-FR') },
        ];
        columns = ['Description', 'Montant HT', 'TVA'];
        rows = [
          ['Ventes', (salesData || []).reduce((s, i) => s + (i.total || 0) - (i.vat_amount || 0), 0), vatCollected],
          ['Achats', (purchasesData || []).reduce((s, i) => s + (i.total || 0) - (i.vat_amount || 0), 0), -vatDeductible],
        ];
        totalRow = ['Net à verser', '', vatDue];
      } else if (activeTab === 'trial') {
        title = 'Balance des comptes';
        columns = ['Code', 'Compte', 'Type', 'Débit', 'Crédit', 'Solde'];
        rows = tbRows.map(r => [r.code, r.name, r.type, r.debit, r.credit, r.debit - r.credit]);
        totalRow = ['TOTAL', '', '', tbRows.reduce((s, r) => s + r.debit, 0), tbRows.reduce((s, r) => s + r.credit, 0), tbRows.reduce((s, r) => s + r.debit - r.credit, 0)];
      } else if (activeTab === 'balance') {
        title = 'Bilan comptable';
        kpis = [
          { label: 'Total Actif', value: balanceData.assets.toLocaleString('fr-FR') },
          { label: 'Total Passif', value: balanceData.liabilities.toLocaleString('fr-FR') },
          { label: 'Capitaux propres', value: balanceData.equity.toLocaleString('fr-FR') },
        ];
        columns = ['Élément', 'Montant'];
        rows = [
          ['Actif immobilisé + circulant', balanceData.assets],
          ['Dettes financières + fournisseurs', balanceData.liabilities],
          ['Capitaux propres', balanceData.equity],
        ];
      }

      const doc = (
        <ReportPdfDocument
          tenantName={tenant?.name || 'Entreprise'}
          title={title}
          period={`${format(new Date(period.from), 'dd/MM/yyyy')} — ${format(new Date(period.to), 'dd/MM/yyyy')}`}
          kpis={kpis}
          columns={columns}
          rows={rows}
          totalRow={totalRow}
          currency={tenant?.currency || 'XAF'}
        />
      );

      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-${period.from}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF téléchargé');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Échec du téléchargement');
    } finally {
      setDownloading(false);
    }
  }

  const tabs = [
    { key: 'income' as ReportTab, label: t('reports.incomeStatement'), icon: TrendingUp },
    { key: 'balance' as ReportTab, label: t('reports.balanceSheet'), icon: Scale },
    { key: 'vat' as ReportTab, label: t('reports.taxReport'), icon: FileSpreadsheet },
    { key: 'trial' as ReportTab, label: t('reports.trialBalance'), icon: BarChart3 },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-medium text-gray-900">{t('reports.title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Du</label>
            <input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Au</label>
            <input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
          </div>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors flex-shrink-0"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Télécharger PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-[#0057D9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Income Statement */}
      {activeTab === 'income' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Chiffre d\'affaires', value: totalRevenue, color: 'bg-green-500', icon: TrendingUp },
              { label: 'Achats', value: totalPurchases, color: 'bg-orange-500', icon: TrendingDown },
              { label: 'Marge brute', value: grossProfit, color: grossProfit >= 0 ? 'bg-blue-500' : 'bg-red-500', icon: BarChart3 },
              { label: '% Marge', value: null, color: 'bg-purple-500', icon: Scale, label2: totalRevenue > 0 ? `${((grossProfit / totalRevenue) * 100).toFixed(1)}%` : '—' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className={`w-9 h-9 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-xl font-medium text-gray-900">{card.label2 || formatCurrency(card.value!)}</p>
                <p className="text-sm text-gray-500 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Évolution mensuelle</h3>
            <p className="text-xs text-gray-400 mb-4">Revenus, achats et marge sur 3 mois</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip
                  formatter={(v) => [formatCurrency(v as number), '']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="Revenus" fill="#0057D9" radius={[4,4,0,0]} name="Revenus" />
                <Bar dataKey="Achats" fill="#F97316" radius={[4,4,0,0]} name="Achats" />
                <Bar dataKey="Marge" fill="#3B82F6" radius={[4,4,0,0]} name="Marge brute" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Line chart for trend */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Tendance de la marge</h3>
            <p className="text-xs text-gray-400 mb-4">Évolution du bénéfice mensuel</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip formatter={(v) => [formatCurrency(v as number), 'Marge']} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Line type="monotone" dataKey="Marge" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* VAT Report */}
      {activeTab === 'vat' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'TVA collectée', value: vatCollected, color: 'text-red-600' },
              { label: 'TVA déductible', value: vatDeductible, color: 'text-green-600' },
              { label: 'TVA à reverser', value: vatDue, color: vatDue > 0 ? 'text-orange-600' : 'text-green-600' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 text-center">
                <p className={`text-xl sm:text-2xl font-medium ${item.color}`}>{formatCurrency(item.value)}</p>
                <p className="text-sm text-gray-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Détail TVA</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100"><th className="text-left py-2 text-sm text-gray-500">Description</th><th className="text-right py-2 text-sm text-gray-500">Montant HT</th><th className="text-right py-2 text-sm text-gray-500">TVA</th></tr></thead>
                <tbody>
                  <tr className="border-b border-gray-50"><td className="py-2 text-sm text-gray-900">Ventes</td><td className="py-2 text-sm text-right">{formatCurrency((salesData || []).reduce((s, i) => s + (i.total || 0) - (i.vat_amount || 0), 0))}</td><td className="py-2 text-sm text-right font-medium text-red-600">{formatCurrency(vatCollected)}</td></tr>
                  <tr className="border-b border-gray-50"><td className="py-2 text-sm text-gray-900">Achats</td><td className="py-2 text-sm text-right">{formatCurrency((purchasesData || []).reduce((s, i) => s + (i.total || 0) - (i.vat_amount || 0), 0))}</td><td className="py-2 text-sm text-right font-medium text-green-600">-{formatCurrency(vatDeductible)}</td></tr>
                  <tr><td className="py-2 font-semibold text-gray-900">Net à verser</td><td className="py-2"></td><td className="py-2 text-right font-medium text-orange-600">{formatCurrency(vatDue)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trial Balance */}
      {activeTab === 'trial' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Balance des comptes</h3>
          </div>
          {tbRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <BarChart3 className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Aucune écriture comptable</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100">
                  {['Code', 'Compte', 'Type', 'Débit', 'Crédit', 'Solde'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {tbRows.map(row => (
                    <tr key={row.code} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-sm text-gray-600">{row.code}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-900">{row.name}</td>
                      <td className="px-4 py-2.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{row.type}</span></td>
                      <td className="px-4 py-2.5 text-sm text-right">{formatCurrency(row.debit)}</td>
                      <td className="px-4 py-2.5 text-sm text-right">{formatCurrency(row.credit)}</td>
                      <td className={`px-4 py-2.5 text-sm font-semibold text-right ${row.debit - row.credit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(row.debit - row.credit)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium border-t-2 border-gray-200">
                    <td colSpan={3} className="px-4 py-3 text-sm">TOTAL</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(tbRows.reduce((s, r) => s + r.debit, 0))}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(tbRows.reduce((s, r) => s + r.credit, 0))}</td>
                    <td className="px-4 py-3 text-sm text-right">{formatCurrency(tbRows.reduce((s, r) => s + r.debit - r.credit, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Balance Sheet */}
      {activeTab === 'balance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total Actif', value: balanceData.assets, color: 'text-blue-600' },
              { label: 'Total Passif', value: balanceData.liabilities, color: 'text-orange-600' },
              { label: 'Capitaux propres', value: balanceData.equity, color: 'text-green-600' },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 text-center">
                <p className={`text-xl sm:text-2xl font-medium ${item.color}`}>{formatCurrency(item.value)}</p>
                <p className="text-sm text-gray-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>

          {pieData.length > 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Répartition du bilan</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Scale className="w-12 h-12 mx-auto mb-3 opacity-50 text-gray-300" />
              <p className="font-medium text-gray-700">Bilan comptable</p>
              <p className="text-sm mt-1 text-gray-400">Disponible dès que vous avez des écritures comptables enregistrées.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
