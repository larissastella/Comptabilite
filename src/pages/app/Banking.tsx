import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Smartphone, Plus, ArrowDownRight, ArrowUpRight, Wallet, Building2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
  created_at: string;
}

const MOMO_PROVIDERS = [
  { id: 'orange', name: 'Orange Money' },
  { id: 'mtn', name: 'MTN MoMo' },
  { id: 'wave', name: 'Wave' },
  { id: 'moov', name: 'Moov Money' },
  { id: 'airtel', name: 'Airtel Money' },
  { id: 'm-pesa', name: 'M-Pesa' },
  { id: 'tmoney', name: 'T-Money' },
  { id: 'evina', name: 'Evina' },
];

type AccountKind = 'mobile_money' | 'bank';

interface AccountForm {
  kind: AccountKind;
  label: string;
  holder: string;
  // MoMo
  momo_provider: string;
  momo_phone: string;
  // Bank
  bank_name: string;
  bank_rib: string;
  bank_swift: string;
  bank_agency: string;
}

const EMPTY_FORM: AccountForm = {
  kind: 'mobile_money',
  label: '',
  holder: '',
  momo_provider: 'orange',
  momo_phone: '',
  bank_name: '',
  bank_rib: '',
  bank_swift: '',
  bank_agency: '',
};

export default function Banking() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);

  const { data: accounts = [] } = useQuery({
    queryKey: ['banking-accounts', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .eq('account_class', 5)
        .order('created_at', { ascending: false });
      return (data || []) as Account[];
    },
    enabled: !!tenant?.id,
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['banking-movements', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, transaction_type, source_type')
        .eq('tenant_id', tenant!.id)
        .in('transaction_type', ['payment', 'receipt', 'transfer'])
        .order('date', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const { data: balances = [] } = useQuery({
    queryKey: ['banking-balances', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transaction_lines')
        .select('account_id, debit, credit')
        .eq('tenant_id', tenant!.id)
        .in('account_id', accounts.map(a => a.id));
      return data || [];
    },
    enabled: !!tenant?.id && accounts.length > 0,
  });

  const accountBalances = (balances || []).reduce((acc: Record<string, number>, l) => {
    const id = (l as { account_id: string }).account_id;
    acc[id] = (acc[id] || 0) + ((l as { debit: number }).debit || 0) - ((l as { credit: number }).credit || 0);
    return acc;
  }, {});

  const addAccount = useMutation({
    mutationFn: async () => {
      if (form.kind === 'mobile_money') {
        if (!form.momo_phone || !form.momo_provider) throw new Error('Opérateur et numéro requis');
      } else {
        if (!form.bank_name || !form.bank_rib) throw new Error('Nom de la banque et RIB requis');
        if (form.bank_rib.replace(/\s/g, '').length < 23 || form.bank_rib.replace(/\s/g, '').length > 28) {
          throw new Error('Le RIB doit contenir entre 23 et 28 chiffres');
        }
      }

      const idx = accounts.length + 1;
      const code = form.kind === 'bank' ? `521${String(idx).padStart(2, '0')}` : `522${String(idx).padStart(2, '0')}`;
      const providerName = form.kind === 'mobile_money'
        ? MOMO_PROVIDERS.find(p => p.id === form.momo_provider)?.name || form.momo_provider
        : form.bank_name;
      const label = form.label || `${providerName}${form.holder ? ` — ${form.holder}` : ''}`;

      const details = form.kind === 'mobile_money'
        ? { provider: providerName, phone: form.momo_phone, holder: form.holder }
        : { bank_name: form.bank_name, rib: form.bank_rib, swift: form.bank_swift, agency: form.bank_agency, holder: form.holder };

      const { error } = await supabase.from('accounts').insert({
        tenant_id: tenant!.id,
        code,
        name: label,
        account_class: 5,
        account_type: 'asset',
        is_system: false,
        is_active: true,
      });
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'create',
        module: 'banking',
        after_data: { code, label, kind: form.kind, details },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['banking-accounts'] });
      toast.success('Compte ajouté');
      setShowAdd(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('accounts').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banking-accounts'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const totalBalance = accounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.banking')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-400 mt-1">Banques & Mobile Money — rapprochement automatique</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Ajouter un compte</span>
        </button>
      </div>

      {/* Total balance card */}
      {accounts.length > 0 && (
        <div className="bg-gradient-to-br from-[#0F2A3D] to-[#1a3f5c] rounded-2xl p-6 mb-6">
          <p className="text-sm text-white/70">Solde total (tous comptes)</p>
          <p className="text-3xl font-bold text-white mt-1">{formatCurrency(totalBalance)}</p>
        </div>
      )}

      {/* Accounts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {accounts.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-8 text-center">
            <Wallet className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun compte bancaire ou Mobile Money enregistré.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ajoutez un compte pour suivre vos soldes et rapprocher vos transactions.</p>
          </div>
        ) : (
          accounts.map(acc => {
            const isBank = acc.code.startsWith('521');
            const bal = accountBalances[acc.id] || 0;
            return (
              <div key={acc.id} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isBank ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-orange-100 dark:bg-orange-500/20'}`}>
                    {isBank ? <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <Smartphone className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                  </div>
                  <button
                    onClick={() => toggleActive.mutate({ id: acc.id, active: !acc.is_active })}
                    className={`text-xs px-2 py-0.5 rounded-full transition-colors ${acc.is_active ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-500/30' : 'bg-gray-100 dark:bg-surface-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
                  >
                    {acc.is_active ? 'Actif' : 'Inactif'}
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{acc.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{acc.code}</p>
                <p className={`text-xl font-bold mt-3 ${bal >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(bal)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Solde actuel</p>
              </div>
            );
          })
        )}
      </div>

      {/* Recent movements */}
      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-surface-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mouvements récents</h2>
        </div>
        {movements.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
            Aucun mouvement. Les encaissements et décaissements enregistrés apparaîtront ici.
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-surface-2">
            {movements.map((m: Record<string, unknown>) => {
              const isIncoming = m.transaction_type === 'receipt';
              return (
                <div key={m.id as string} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-surface-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isIncoming ? 'bg-green-100 dark:bg-green-500/20' : 'bg-red-100 dark:bg-red-500/20'}`}>
                      {isIncoming ? <ArrowDownRight className="w-4 h-4 text-green-600 dark:text-green-400" /> : <ArrowUpRight className="w-4 h-4 text-red-600 dark:text-red-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.description as string}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(m.date as string), 'dd/MM/yyyy')}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize flex-shrink-0">{m.transaction_type as string}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add account modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-surface-1 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ajouter un compte</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"><X className="w-5 h-5" /></button>
            </div>

            {/* Kind toggle */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                onClick={() => setForm(f => ({ ...f, kind: 'mobile_money' }))}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${form.kind === 'mobile_money' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
              >
                <Smartphone className="w-4 h-4" /> Mobile Money
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, kind: 'bank' }))}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${form.kind === 'bank' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
              >
                <Building2 className="w-4 h-4" /> Banque
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom du compte (optionnel)</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder={form.kind === 'mobile_money' ? 'Ex: Orange Money Principal' : 'Ex: Compte courant BMCE'}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                />
              </div>

              {form.kind === 'mobile_money' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opérateur</label>
                    <select
                      value={form.momo_provider}
                      onChange={e => setForm(f => ({ ...f, momo_provider: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    >
                      {MOMO_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro de téléphone</label>
                    <input
                      type="tel"
                      value={form.momo_phone}
                      onChange={e => setForm(f => ({ ...f, momo_phone: e.target.value }))}
                      placeholder="+237 6XX XXX XXX"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titulaire</label>
                    <input
                      type="text"
                      value={form.holder}
                      onChange={e => setForm(f => ({ ...f, holder: e.target.value }))}
                      placeholder="Nom du titulaire"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la banque</label>
                    <input
                      type="text"
                      value={form.bank_name}
                      onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                      placeholder="Ex: Afriland First Bank"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RIB / N° de compte</label>
                    <input
                      type="text"
                      value={form.bank_rib}
                      onChange={e => setForm(f => ({ ...f, bank_rib: e.target.value }))}
                      placeholder="23 à 28 chiffres"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                    <p className="text-xs text-gray-400 mt-1">RIB à 23 ou 24 positions (RIB marocain) ou IBAN complet</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code SWIFT/BIC (optionnel)</label>
                    <input
                      type="text"
                      value={form.bank_swift}
                      onChange={e => setForm(f => ({ ...f, bank_swift: e.target.value }))}
                      placeholder="Ex: AFRICMCM"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agence (optionnel)</label>
                    <input
                      type="text"
                      value={form.bank_agency}
                      onChange={e => setForm(f => ({ ...f, bank_agency: e.target.value }))}
                      placeholder="Ex: Agence Centrale"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titulaire</label>
                    <input
                      type="text"
                      value={form.holder}
                      onChange={e => setForm(f => ({ ...f, holder: e.target.value }))}
                      placeholder="Nom du titulaire"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 dark:bg-surface-2 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-surface-3">Annuler</button>
              <button
                onClick={() => addAccount.mutate()}
                disabled={addAccount.isPending}
                className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {addAccount.isPending ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
