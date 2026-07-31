import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, ArrowLeftRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Transaction, Account } from '../../types';
import { format } from 'date-fns';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

interface LineFormData { id: string; account_id: string; description: string; debit: number; credit: number; }

export default function Transactions() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ date: format(new Date(), 'yyyy-MM-dd'), reference: '', description: '', transaction_type: 'journal' });
  const [lines, setLines] = useState<LineFormData[]>([
    { id: uuidv4(), account_id: '', description: '', debit: 0, credit: 0 },
    { id: uuidv4(), account_id: '', description: '', debit: 0, credit: 0 },
  ]);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions').select('*').eq('tenant_id', tenant!.id).order('date', { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!tenant?.id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name').eq('tenant_id', tenant!.id).eq('is_active', true).order('code');
      return (data || []) as Pick<Account, 'id' | 'code' | 'name'>[];
    },
    enabled: !!tenant?.id,
  });

  const filtered = transactions.filter(t =>
    !search ||
    (t.reference || '').toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const save = useMutation({
    mutationFn: async () => {
      if (!isBalanced) throw new Error(t('transactions.unbalancedError'));
      const { data: tx, error } = await supabase.from('transactions').insert({
        tenant_id: tenant!.id, ...formData, is_posted: true, created_by: user!.id,
      }).select().single();
      if (error) throw error;

      const linesPayload = lines.filter(l => l.account_id && (l.debit || l.credit)).map(l => ({
        transaction_id: tx.id, tenant_id: tenant!.id,
        account_id: l.account_id, description: l.description,
        debit: l.debit, credit: l.credit,
      }));
      const { error: le } = await supabase.from('transaction_lines').insert(linesPayload);
      if (le) throw le;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('transactions.saved'));
      setShowForm(false);
      setFormData({ date: format(new Date(), 'yyyy-MM-dd'), reference: '', description: '', transaction_type: 'journal' });
      setLines([{ id: uuidv4(), account_id: '', description: '', debit: 0, credit: 0 }, { id: uuidv4(), account_id: '', description: '', debit: 0, credit: 0 }]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function updateLine(id: string, key: keyof LineFormData, value: string | number) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [key]: value } : l));
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('transactions.title')}</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl">
          <Plus className="w-4 h-4" /> {t('transactions.newEntry')}
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('transactions.search')}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border h-16 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ArrowLeftRight className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">{t('transactions.empty')}</h3>
          <p className="text-sm text-gray-400 mb-4">{t('transactions.emptyDesc')}</p>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-[#0057D9] text-white text-sm rounded-xl">{t('transactions.newEntry')}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {[t('transactions.colDate'), t('transactions.colReference'), t('transactions.colDescription'), t('transactions.colType'), t('transactions.colStatus'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{format(new Date(tx.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3.5 font-mono text-sm text-gray-700">{tx.reference || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-900">{tx.description}</td>
                    <td className="px-4 py-3.5">
                      <Badge variant="info">{tx.transaction_type}</Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      {tx.is_posted
                        ? <Badge variant="success">{t('transactions.posted')}</Badge>
                        : <Badge variant="gray">{t('transactions.draft')}</Badge>
                      }
                    </td>
                    <td className="px-4 py-3.5"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(tx => (
              <div key={tx.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{tx.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(tx.date), 'dd/MM/yyyy')} {tx.reference && `· ${tx.reference}`}</p>
                  </div>
                  {tx.is_posted
                    ? <Badge variant="success">{t('transactions.posted')}</Badge>
                    : <Badge variant="gray">{t('transactions.draft')}</Badge>
                  }
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{tx.transaction_type}</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg sm:text-xl font-medium text-gray-900">{t('transactions.newEntryModalTitle')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.date')} *</label>
                  <input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.reference')}</label>
                  <input value={formData.reference} onChange={e => setFormData(p => ({ ...p, reference: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.type')}</label>
                  <select value={formData.transaction_type} onChange={e => setFormData(p => ({ ...p, transaction_type: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                    <option value="journal">{t('transactions.typeJournal')}</option>
                    <option value="payment">{t('transactions.typePayment')}</option>
                    <option value="receipt">{t('transactions.typeReceipt')}</option>
                    <option value="transfer">{t('transactions.typeTransfer')}</option>
                    <option value="adjustment">{t('transactions.typeAdjustment')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('transactions.description')} *</label>
                <input value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
              </div>

              {/* Line items — desktop grid */}
              <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider gap-2">
                  <div className="col-span-4">{t('transactions.account')}</div>
                  <div className="col-span-4">{t('transactions.description')}</div>
                  <div className="col-span-2 text-right">{t('transactions.debit')}</div>
                  <div className="col-span-2 text-right">{t('transactions.credit')}</div>
                </div>
                {lines.map(line => (
                  <div key={line.id} className="grid grid-cols-12 px-4 py-2.5 border-t border-gray-100 gap-2 items-center">
                    <div className="col-span-4">
                      <select value={line.account_id} onChange={e => updateLine(line.id, 'account_id', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0057D9]">
                        <option value="">{t('transactions.selectAccount')}</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} placeholder={t('transactions.description')}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-12 px-4 py-3 bg-gray-50 border-t border-gray-200 gap-2 text-sm font-semibold">
                  <div className="col-span-8 text-gray-600">{t('transactions.total')}</div>
                  <div className={`col-span-2 text-right ${!isBalanced ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(totalDebit)}</div>
                  <div className={`col-span-2 text-right ${!isBalanced ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(totalCredit)}</div>
                </div>
              </div>

              {/* Line items — mobile stacked */}
              <div className="sm:hidden space-y-3">
                {lines.map((line, idx) => (
                  <div key={line.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('transactions.line')} {idx + 1}</p>
                    <select value={line.account_id} onChange={e => updateLine(line.id, 'account_id', e.target.value)}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0057D9]">
                      <option value="">{t('transactions.selectAccountFull')}</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                    <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} placeholder={t('transactions.description')}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400">{t('transactions.debit')}</label>
                        <input type="number" min="0" step="0.01" value={line.debit || ''} onChange={e => updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">{t('transactions.credit')}</label>
                        <input type="number" min="0" step="0.01" value={line.credit || ''} onChange={e => updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#0057D9]" />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100">
                  <span className="text-gray-600">{t('transactions.total')}</span>
                  <span className={isBalanced ? 'text-gray-900' : 'text-red-600'}>
                    D: {formatCurrency(totalDebit)} · C: {formatCurrency(totalCredit)}
                  </span>
                </div>
              </div>

              {!isBalanced && (
                <p className="text-xs text-red-500">⚠ {t('transactions.unbalanced')} {formatCurrency(Math.abs(totalDebit - totalCredit))}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLines(prev => [...prev, { id: uuidv4(), account_id: '', description: '', debit: 0, credit: 0 }])}
                  className="text-sm text-[#0057D9] hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> {t('transactions.addLine')}
                </button>
                {lines.length > 2 && (
                  <button onClick={() => setLines(prev => prev.slice(0, -1))} className="text-sm text-red-400 hover:underline ml-4">
                    {t('transactions.removeLast')}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-5 sm:px-6 pb-5 sm:pb-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">{t('transactions.cancel')}</button>
              <button onClick={() => save.mutate()} disabled={save.isPending || !isBalanced || !formData.description}
                className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                {save.isPending ? '...' : t('transactions.post')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
