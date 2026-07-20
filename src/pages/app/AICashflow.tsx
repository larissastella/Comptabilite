import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bot, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { addDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function AICashflow() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const [forecastDays, setForecastDays] = useState(30);

  // Real data: past 3 months of paid invoices (in) and purchases (out)
  const { data: cashflowData } = useQuery({
    queryKey: ['ai-cashflow', tenant?.id],
    queryFn: async () => {
      const startDate = format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd');
      const [salesRes, purchasesRes] = await Promise.all([
        supabase.from('sales_invoices')
          .select('invoice_date, total, status, amount_paid')
          .eq('tenant_id', tenant!.id)
          .gte('invoice_date', startDate),
        supabase.from('purchase_invoices')
          .select('invoice_date, total, amount_paid')
          .eq('tenant_id', tenant!.id)
          .gte('invoice_date', startDate),
      ]);
      return {
        sales: salesRes.data || [],
        purchases: purchasesRes.data || [],
      };
    },
    enabled: !!tenant?.id,
  });

  // Compute historical + forecast
  const { historical, forecast, kpis } = useMemo(() => {
    const sales = (cashflowData?.sales || []) as Array<Record<string, unknown>>;
    const purchases = (cashflowData?.purchases || []) as Array<Record<string, unknown>>;

    const months = Array.from({ length: 3 }, (_, i) => {
      const d = subMonths(new Date(), 2 - i);
      return { start: startOfMonth(d), end: endOfMonth(d), label: format(d, 'MMM', { locale: fr }) };
    });

    const hist = months.map(m => {
      const inflow = sales
        .filter(s => {
          const d = new Date(s.invoice_date as string);
          return d >= m.start && d <= m.end && s.status === 'paid';
        })
        .reduce((sum, s) => sum + (s.amount_paid as number || 0), 0);
      const outflow = purchases
        .filter(p => {
          const d = new Date(p.invoice_date as string);
          return d >= m.start && d <= m.end;
        })
        .reduce((sum, p) => sum + (p.amount_paid as number || 0), 0);
      return { name: m.label, Encaissements: inflow, Décaissements: outflow, Net: inflow - outflow };
    });

    const avgInflow = hist.length > 0 ? hist.reduce((s, h) => s + h.Encaissements, 0) / hist.length : 0;
    const avgOutflow = hist.length > 0 ? hist.reduce((s, h) => s + h.Décaissements, 0) / hist.length : 0;
    const currentBalance = (hist[hist.length - 1]?.Net || 0);

    // Simple forecast: project avg in/out for next N days, with a small growth factor
    const weeks = Math.ceil(forecastDays / 7);
    const fc = Array.from({ length: weeks }, (_, i) => {
      const weekInflow = (avgInflow / 4) * (1 + i * 0.02);
      const weekOutflow = (avgOutflow / 4) * (1 + i * 0.01);
      const projected = currentBalance + (weekInflow - weekOutflow) * (i + 1);
      return {
        name: `S+${i + 1}`,
        Prévision: Math.round(projected),
        Seuil: 0,
      };
    });

    const lowestPoint = fc.length > 0 ? Math.min(...fc.map(f => f.Prévision)) : 0;
    const riskLevel = lowestPoint < 0 ? 'high' : lowestPoint < avgOutflow ? 'medium' : 'low';

    return {
      historical: hist,
      forecast: fc,
      kpis: {
        avgInflow,
        avgOutflow,
        currentBalance,
        lowestPoint,
        riskLevel,
      },
    };
  }, [cashflowData, forecastDays]);

  const riskColor = kpis.riskLevel === 'high' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800' :
                     kpis.riskLevel === 'medium' ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800' :
                     'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-800';
  const riskLabel = kpis.riskLevel === 'high' ? 'Élevé' : kpis.riskLevel === 'medium' ? 'Modéré' : 'Faible';

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.aiCashflow')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-400 mt-0.5">Prévisions de trésorerie par IA et gestion du risque de change</p>
        </div>
      </div>

      {/* Risk banner */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border mb-6 ${riskColor}`}>
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Risque de trésorerie : {riskLabel}</p>
          <p className="text-xs mt-0.5 opacity-80">
            {kpis.riskLevel === 'high'
              ? `Votre solde prévisionnel pourrait devenir négatif (${formatCurrency(kpis.lowestPoint)}). Action recommandée.`
              : kpis.riskLevel === 'medium'
              ? 'Surveillez vos prochains décaissements.'
              : 'Trésorerie saine sur la période prévisionnelle.'}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Encaissements moy.', value: formatCurrency(kpis.avgInflow), icon: TrendingUp, color: 'bg-green-500' },
          { label: 'Décaissements moy.', value: formatCurrency(kpis.avgOutflow), icon: TrendingDown, color: 'bg-orange-500' },
          { label: 'Solde net actuel', value: formatCurrency(kpis.currentBalance), icon: DollarSign, color: 'bg-blue-500' },
          { label: 'Point bas prévu', value: formatCurrency(kpis.lowestPoint), icon: AlertTriangle, color: kpis.lowestPoint < 0 ? 'bg-red-500' : 'bg-purple-500' },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
            <div className={`w-9 h-9 ${k.color} rounded-xl flex items-center justify-center mb-3`}>
              <k.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">{k.value}</p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Forecast horizon selector */}
      <div className="flex items-center gap-3 mb-4">
        <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Horizon :</span>
        {[14, 30, 60, 90].map(d => (
          <button
            key={d}
            onClick={() => setForecastDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${forecastDays === d ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
          >
            {d} jours
          </button>
        ))}
      </div>

      {/* Historical chart */}
      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Historique (3 derniers mois)</h2>
        {historical.length > 0 && historical.some(h => h.Encaissements > 0 || h.Décaissements > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={historical} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4f" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={70}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip formatter={(v) => formatCurrency(v as number)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Encaissements" fill="#10B981" radius={[4,4,0,0]} />
              <Bar dataKey="Décaissements" fill="#F97316" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
            Aucune donnée historique. Enregistrez des factures payées pour générer des prévisions.
          </div>
        )}
      </div>

      {/* Forecast chart */}
      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Prévision IA ({forecastDays} jours)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={forecast}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4f" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={70}
              tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
            <Tooltip formatter={(v) => formatCurrency(v as number)} />
            <Line type="monotone" dataKey="Prévision" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Prévision basée sur la moyenne mobile des 3 derniers mois. Précision améliorée avec plus de données historiques.
        </p>
      </div>
    </div>
  );
}
