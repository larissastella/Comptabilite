import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookMarked, BookOpen, CheckSquare, Lock, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

type LedgerTab = 'grand-livre' | 'journal' | 'lettrage' | 'cloture';

export default function Ledger() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState<LedgerTab>('grand-livre');
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');

  // Fetch all accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-all', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id, code, name, account_class, account_type, is_active')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('code');
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch all transactions with lines
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['ledger-transactions', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select(`
          id, date, reference, description, transaction_type, is_posted,
          transaction_lines(id, account_id, description, debit, credit, reconciled)
        `)
        .eq('tenant_id', tenant!.id)
        .order('date', { ascending: false });
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Grand Livre: per-account chronological movements
  const grandLivre = useMemo(() => {
    const accountMap = new Map<string, { code: string; name: string; lines: Array<{ date: string; reference: string; description: string; debit: number; credit: number }> }>();
    (accounts as Array<{ id: string; code: string; name: string }>).forEach(a => {
      accountMap.set(a.id, { code: a.code, name: a.name, lines: [] });
    });
    (transactions as Array<Record<string, unknown>>).forEach(tx => {
      const lines = (tx.transaction_lines as Array<Record<string, unknown>>) || [];
      lines.forEach(l => {
        const accId = l.account_id as string;
        const acc = accountMap.get(accId);
        if (acc) {
          acc.lines.push({
            date: tx.date as string,
            reference: (tx.reference as string) || '',
            description: (l.description as string) || (tx.description as string) || '',
            debit: (l.debit as number) || 0,
            credit: (l.credit as number) || 0,
          });
        }
      });
    });
    let entries = Array.from(accountMap.values()).filter(a => a.lines.length > 0);
    if (accountFilter) {
      entries = entries.filter(a => a.code.includes(accountFilter) || a.name.toLowerCase().includes(accountFilter.toLowerCase()));
    }
    entries.forEach(a => a.lines.sort((x, y) => y.date.localeCompare(x.date)));
    return entries;
  }, [accounts, transactions, accountFilter]);

  // Journal: per-transaction chronological
  const journal = useMemo(() => {
    let entries = (transactions as Array<Record<string, unknown>>).slice();
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter(tx =>
        ((tx.reference as string) || '').toLowerCase().includes(s) ||
        ((tx.description as string) || '').toLowerCase().includes(s)
      );
    }
    return entries;
  }, [transactions, search]);

  // Lettrage: unreconciled lines for matching
  const unreconciledLines = useMemo(() => {
    const result: Array<{ line_id: string; tx_id: string; date: string; reference: string; description: string; account_code: string; account_name: string; debit: number; credit: number; reconciled: boolean }> = [];
    (transactions as Array<Record<string, unknown>>).forEach(tx => {
      const lines = (tx.transaction_lines as Array<Record<string, unknown>>) || [];
      lines.forEach(l => {
        const acc = (accounts as Array<{ id: string; code: string; name: string }>).find(a => a.id === l.account_id);
        result.push({
          line_id: l.id as string,
          tx_id: tx.id as string,
          date: tx.date as string,
          reference: (tx.reference as string) || '',
          description: (l.description as string) || (tx.description as string) || '',
          account_code: acc?.code || '—',
          account_name: acc?.name || '—',
          debit: (l.debit as number) || 0,
          credit: (l.credit as number) || 0,
          reconciled: (l.reconciled as boolean) || false,
        });
      });
    });
    return result.filter(l => !l.reconciled);
  }, [transactions, accounts]);

  const reconcile = useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase
        .from('transaction_lines')
        .update({ reconciled: true })
        .eq('id', lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ledger-transactions'] });
      toast.success('Écriture lettrée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Clôture: check if fiscal year is closed
  const [closingYear, setClosingYear] = useState(new Date().getFullYear());
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const closeFiscalYear = useMutation({
    mutationFn: async () => {
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'close_fiscal_year',
        module: 'ledger',
        after_data: { year: closingYear },
      });
    },
    onSuccess: () => {
      toast.success(`Exercice ${closingYear} clôturé. Les soldes d'ouverture ont été reportés.`);
      setShowCloseConfirm(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tabs: { key: LedgerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'grand-livre', label: 'Grand Livre', icon: BookMarked },
    { key: 'journal', label: 'Journal', icon: BookOpen },
    { key: 'lettrage', label: 'Lettrage', icon: CheckSquare },
    { key: 'cloture', label: 'Clôture d\'exercice', icon: Lock },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-gray-900">{t('nav.ledger')}</h1>
        <p className="text-sm text-gray-400 mt-1">Grand livre, journal, lettrage et clôture d'exercice</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === tabItem.key ? 'bg-[#0057D9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <tabItem.icon className="w-4 h-4" />
            {tabItem.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {/* Grand Livre */}
      {tab === 'grand-livre' && !isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
                placeholder="Filtrer par code ou nom de compte..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
              />
            </div>
          </div>

          {grandLivre.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <BookMarked className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucune écriture comptable.</p>
              <p className="text-xs text-gray-400 mt-1">Saisissez des transactions pour voir le grand livre.</p>
            </div>
          ) : (
            grandLivre.map(acc => {
              const totalDebit = acc.lines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = acc.lines.reduce((s, l) => s + l.credit, 0);
              return (
                <div key={acc.code} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-semibold text-gray-900">{acc.code}</span>
                      <span className="text-sm text-gray-600 ml-2">{acc.name}</span>
                    </div>
                    <span className={`text-sm font-semibold ${totalDebit - totalCredit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      Solde: {formatCurrency(totalDebit - totalCredit)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-gray-50">
                        {['Date', 'Référence', 'Description', 'Débit', 'Crédit'].map(h => (
                          <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {acc.lines.map((l, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-600">{format(new Date(l.date), 'dd/MM/yyyy')}</td>
                            <td className="px-4 py-2 text-sm text-gray-500 font-mono">{l.reference}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{l.description}</td>
                            <td className="px-4 py-2 text-sm text-right">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                            <td className="px-4 py-2 text-sm text-right">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                          <td colSpan={3} className="px-4 py-2 text-sm">Total {acc.code}</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(totalDebit)}</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(totalCredit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Journal */}
      {tab === 'journal' && !isLoading && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par référence ou description..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
            />
          </div>

          {journal.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucune écriture au journal.</p>
            </div>
          ) : (
            journal.map((tx: Record<string, unknown>) => {
              const lines = (tx.transaction_lines as Array<Record<string, unknown>>) || [];
              const totalDebit = lines.reduce((s, l) => s + ((l.debit as number) || 0), 0);
              const totalCredit = lines.reduce((s, l) => s + ((l.credit as number) || 0), 0);
              return (
                <div key={tx.id as string} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">{format(new Date(tx.date as string), 'dd/MM/yyyy')}</span>
                      <span className="text-sm font-medium text-gray-900">{(tx.reference as string) || '—'}</span>
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{tx.transaction_type as string}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tx.is_posted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {tx.is_posted ? 'Validé' : 'Brouillon'}
                    </span>
                  </div>
                  <div className="px-5 py-2 border-b border-gray-50">
                    <p className="text-sm text-gray-700">{tx.description as string}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-50">
                        {lines.map((l, i) => {
                          const acc = (accounts as Array<{ id: string; code: string; name: string }>).find(a => a.id === l.account_id);
                          return (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono text-sm text-gray-600">{acc?.code || '—'}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{(l.description as string) || acc?.name || ''}</td>
                              <td className="px-4 py-2 text-sm text-right">{(l.debit as number) > 0 ? formatCurrency(l.debit as number) : '—'}</td>
                              <td className="px-4 py-2 text-sm text-right">{(l.credit as number) > 0 ? formatCurrency(l.credit as number) : '—'}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                          <td colSpan={2} className="px-4 py-2 text-sm text-right">Total</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(totalDebit)}</td>
                          <td className="px-4 py-2 text-sm text-right">{formatCurrency(totalCredit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Lettrage */}
      {tab === 'lettrage' && !isLoading && (
        <div>
          {unreconciledLines.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Toutes les écritures sont lettrées.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Écritures à lettrer</h2>
                <p className="text-xs text-gray-400 mt-0.5">Cliquez sur "Lettrer" pour marquer une écriture comme rapprochée</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Date', 'Référence', 'Compte', 'Description', 'Débit', 'Crédit', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {unreconciledLines.map(l => (
                      <tr key={l.line_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-sm text-gray-600">{format(new Date(l.date), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{l.reference}</td>
                        <td className="px-4 py-2.5 font-mono text-sm text-gray-600">{l.account_code}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-900">{l.description}</td>
                        <td className="px-4 py-2.5 text-sm text-right">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-right">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => reconcile.mutate(l.line_id)}
                            disabled={reconcile.isPending}
                            className="px-3 py-1 bg-[#0057D9] hover:bg-[#003F9E] text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors"
                          >
                            Lettrer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clôture */}
      {tab === 'cloture' && !isLoading && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-6 h-6 text-[#0057D9]" />
              <h2 className="text-base font-semibold text-gray-900">Clôture d'exercice</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              La clôture d'exercice fige les écritures de l'année, calcule le résultat net et génère les soldes d'ouverture pour le nouvel exercice.
              Cette opération est irréversible.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exercice à clôturer</label>
                <select
                  value={closingYear}
                  onChange={e => setClosingYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                >
                  {[closingYear, closingYear - 1, closingYear - 2].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary of accounts by class */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Aperçu de l'exercice {closingYear}</h3>
              <div className="space-y-1.5">
                {(() => {
                  const yearTx = (transactions as Array<Record<string, unknown>>).filter(tx => (tx.date as string).startsWith(String(closingYear)));
                  const lines = yearTx.flatMap(tx => (tx.transaction_lines as Array<Record<string, unknown>>) || []);
                  const classTotals: Record<number, { debit: number; credit: number }> = {};
                  lines.forEach(l => {
                    const acc = (accounts as Array<{ id: string; account_class: number }>).find(a => a.id === l.account_id);
                    if (!acc) return;
                    if (!classTotals[acc.account_class]) classTotals[acc.account_class] = { debit: 0, credit: 0 };
                    classTotals[acc.account_class].debit += (l.debit as number) || 0;
                    classTotals[acc.account_class].credit += (l.credit as number) || 0;
                  });
                  const labels: Record<number, string> = {
                    1: 'Ressources durables', 2: 'Actif immobilisé', 3: 'Stocks', 4: 'Tiers',
                    5: 'Trésorerie', 6: 'Charges', 7: 'Produits', 8: 'Autres', 9: 'Spéciaux',
                  };
                  return Object.entries(classTotals).map(([cls, vals]) => (
                    <div key={cls} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Classe {cls} — {labels[parseInt(cls)] || '—'}</span>
                      <span className={`font-medium ${vals.debit - vals.credit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(vals.debit - vals.credit)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <button
              onClick={() => setShowCloseConfirm(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              <Lock className="w-4 h-4" />
              Clôturer l'exercice {closingYear}
            </button>
          </div>
        </div>
      )}

      {/* Close confirmation modal */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Lock className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-medium text-gray-900">Confirmation de clôture</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Vous êtes sur le point de clôturer l'exercice <strong>{closingYear}</strong>. Cette action est irréversible :
              les écritures seront figées et les soldes d'ouverture seront générés pour {closingYear + 1}.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCloseConfirm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">Annuler</button>
              <button
                onClick={() => closeFiscalYear.mutate()}
                disabled={closeFiscalYear.isPending}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {closeFiscalYear.isPending ? 'Clôture...' : 'Confirmer la clôture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
