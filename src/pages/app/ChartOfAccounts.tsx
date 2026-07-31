import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, ChevronDown, ChevronRight, BookOpen, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Account, AccountType } from '../../types';
import toast from 'react-hot-toast';

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
};

const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 — Ressources durables',
  2: 'Classe 2 — Actif immobilisé',
  3: 'Classe 3 — Stocks',
  4: 'Classe 4 — Tiers',
  5: 'Classe 5 — Trésorerie',
  6: 'Classe 6 — Charges',
  7: 'Classe 7 — Produits',
  8: 'Classe 8 — Autres charges',
  9: 'Classe 9 — Comptabilité analytique',
};

interface AccountFormData {
  code: string;
  name: string;
  name_en: string;
  account_class: number;
  account_type: AccountType;
  parent_id: string;
  is_active: boolean;
}

export default function ChartOfAccounts() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [collapsedClasses, setCollapsedClasses] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountFormData>({
    code: '', name: '', name_en: '', account_class: 1, account_type: 'asset', parent_id: '', is_active: true,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('code');
      if (error) throw error;
      return data as Account[];
    },
    enabled: !!tenant?.id,
  });

  const save = useMutation({
    mutationFn: async (d: AccountFormData) => {
      const payload = {
        ...d,
        tenant_id: tenant!.id,
        parent_id: d.parent_id || null,
        account_class: Number(d.account_class),
      };
      if (editAccount) {
        const { error } = await supabase.from('accounts').update(payload).eq('id', editAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('accounts').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success(editAccount ? 'Compte modifié' : 'Compte créé');
      setShowForm(false);
      setEditAccount(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Compte supprimé');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = accounts.filter(a =>
    a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const byClass = Array.from({ length: 9 }, (_, i) => i + 1).reduce((acc, cls) => {
    acc[cls] = filtered.filter(a => a.account_class === cls);
    return acc;
  }, {} as Record<number, Account[]>);

  function openCreate() {
    setEditAccount(null);
    setForm({ code: '', name: '', name_en: '', account_class: 1, account_type: 'asset', parent_id: '', is_active: true });
    setShowForm(true);
  }

  function openEdit(a: Account) {
    setEditAccount(a);
    setForm({
      code: a.code, name: a.name, name_en: a.name_en || '', account_class: a.account_class,
      account_type: a.account_type, parent_id: a.parent_id || '', is_active: a.is_active,
    });
    setShowForm(true);
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('accounts.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('accounts.syscohada')}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          {t('accounts.new')}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par code ou intitulé..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="space-y-2">
                {[1,2].map(j => <div key={j} className="h-4 bg-gray-100 rounded w-full" />)}
              </div>
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-14 h-14 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('accounts.noAccounts')}</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">Créez votre premier compte ou importez le SYSCOHADA</p>
          <button onClick={openCreate} className="px-4 py-2 bg-[#0057D9] text-white text-sm font-medium rounded-xl hover:bg-[#003F9E] transition-colors">
            {t('accounts.new')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(byClass).map(([cls, accs]) => {
            if (accs.length === 0) return null;
            const clsNum = Number(cls);
            const isCollapsed = collapsedClasses.has(clsNum);
            return (
              <div key={cls} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
                <button
                  onClick={() => setCollapsedClasses(prev => {
                    const next = new Set(prev);
                    if (next.has(clsNum)) next.delete(clsNum); else next.add(clsNum);
                    return next;
                  })}
                  className="flex items-center justify-between w-full px-5 py-3.5 bg-gray-50 dark:bg-surface-2 hover:bg-gray-100 dark:hover:bg-surface-3 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{CLASS_LABELS[clsNum]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{accs.length} compte(s)</span>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-gray-50 dark:divide-surface-2">
                    {/* Desktop header */}
                    <div className="hidden sm:grid grid-cols-12 px-5 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-white dark:bg-surface-1">
                      <div className="col-span-2">Code</div>
                      <div className="col-span-5">Intitulé</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-2">Statut</div>
                      <div className="col-span-1"></div>
                    </div>
                    {accs.map(acc => (
                      <div key={acc.id}>
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-12 items-center px-5 py-3 hover:bg-gray-50 dark:hover:bg-surface-2 group">
                          <div className="col-span-2">
                            <span className="font-mono text-sm text-gray-700 dark:text-gray-300 font-semibold">{acc.code}</span>
                          </div>
                          <div className="col-span-5">
                            <p className="text-sm text-gray-900 dark:text-white">{acc.name}</p>
                            {acc.name_en && <p className="text-xs text-gray-400 dark:text-gray-500">{acc.name_en}</p>}
                          </div>
                          <div className="col-span-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACCOUNT_TYPE_COLORS[acc.account_type]}`}>
                              {t(`accounts.${acc.account_type}`)}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${acc.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {acc.is_active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                          <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(acc)} className="p-1.5 text-gray-400 hover:text-[#0057D9] rounded-lg hover:bg-gray-100">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!acc.is_system && (
                              <button onClick={() => deleteAccount.mutate(acc.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Mobile card */}
                        <div className="sm:hidden p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-mono text-sm text-gray-700 font-semibold">{acc.code}</span>
                              <p className="text-sm text-gray-900 mt-0.5">{acc.name}</p>
                              {acc.name_en && <p className="text-xs text-gray-400">{acc.name_en}</p>}
                            </div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${acc.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {acc.is_active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACCOUNT_TYPE_COLORS[acc.account_type]}`}>
                              {t(`accounts.${acc.account_type}`)}
                            </span>
                            <div className="flex gap-1">
                              <button onClick={() => openEdit(acc)} className="p-1.5 text-gray-400 hover:text-[#0057D9] rounded-lg hover:bg-gray-100">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {!acc.is_system && (
                                <button onClick={() => deleteAccount.mutate(acc.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {editAccount ? 'Modifier le compte' : t('accounts.new')}
            </h2>
            <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('accounts.code')}</label>
                  <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Classe</label>
                  <select value={form.account_class} onChange={e => setForm(p => ({ ...p, account_class: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                    {Array.from({ length: 9 }, (_, i) => i + 1).map(c => <option key={c} value={c}>Classe {c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('accounts.accountName')} (FR)</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('accounts.accountName')} (EN)</label>
                <input value={form.name_en} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('accounts.type')}</label>
                <select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value as AccountType }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                  {(['asset','liability','equity','revenue','expense','other'] as AccountType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} id="active-chk" className="rounded dark:bg-surface-2 dark:border-surface-3" />
                <label htmlFor="active-chk" className="text-sm text-gray-700 dark:text-gray-300">Compte actif</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 dark:bg-surface-2 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-surface-3">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={save.isPending}
                  className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:bg-[#003F9E]">
                  {save.isPending ? '...' : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
