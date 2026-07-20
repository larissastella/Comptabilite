import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Users, Edit2, Trash2, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Customer } from '../../types';
import toast from 'react-hot-toast';

type CustomerFormData = Omit<Customer, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>;

export default function Customers() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const blank: CustomerFormData = { name: '', email: '', phone: '', address: '', city: '', country: '', tax_id: '', legal_id: '', payment_terms_days: 30, credit_limit: undefined, notes: '', is_active: true };
  const [form, setForm] = useState<CustomerFormData>(blank);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', tenant!.id).order('name');
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!tenant?.id,
  });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  );

  const save = useMutation({
    mutationFn: async (d: CustomerFormData) => {
      const payload = { ...d, tenant_id: tenant!.id, credit_limit: d.credit_limit || null };
      if (editCustomer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Enregistré'); setShowForm(false); setEditCustomer(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() { setEditCustomer(null); setForm(blank); setShowForm(true); }
  function openEdit(c: Customer) {
    setEditCustomer(c);
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', city: c.city || '', country: c.country || '', tax_id: c.tax_id || '', legal_id: c.legal_id || '', payment_terms_days: c.payment_terms_days, credit_limit: c.credit_limit, notes: c.notes || '', is_active: c.is_active });
    setShowForm(true);
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('customers.title')}</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#10B981] hover:bg-[#0d9e6e] text-white text-sm font-semibold rounded-xl">
          <Plus className="w-4 h-4" /> {t('customers.new')}
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher client..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 h-20 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-14 h-14 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('customers.noCustomers')}</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{t('customers.noCustomersDesc')}</p>
          <button onClick={openCreate} className="px-4 py-2 bg-[#10B981] text-white text-sm rounded-xl hover:bg-[#0d9e6e]">{t('customers.new')}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                  {['Nom', 'Contact', 'Ville', 'Délai paiement', 'Statut', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-surface-2">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-surface-2 group">
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                        {c.tax_id && <p className="text-xs text-gray-400 dark:text-gray-500">NIF: {c.tax_id}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        {c.email && <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Mail className="w-3 h-3" />{c.email}</p>}
                        {c.phone && <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Phone className="w-3 h-3" />{c.phone}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.city || '—'}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{c.payment_terms_days} jours</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-[#10B981] rounded-lg hover:bg-gray-100"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del.mutate(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(c => (
              <div key={c.id} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                    {c.tax_id && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">NIF: {c.tax_id}</p>}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {c.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{c.email}</p>}
                  {c.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{c.phone}</p>}
                  <p className="flex items-center gap-1.5"><span className="font-medium text-gray-400 dark:text-gray-500">Ville:</span>{c.city || '—'}</p>
                  <p className="flex items-center gap-1.5"><span className="font-medium text-gray-400 dark:text-gray-500">Délai:</span>{c.payment_terms_days} jours</p>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 dark:border-surface-2">
                  <button onClick={() => openEdit(c)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg"><Edit2 className="w-3 h-3" />Modifier</button>
                  <button onClick={() => del.mutate(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-3 h-3" />Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editCustomer ? 'Modifier client' : t('customers.new')}</h2>
            <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom / Raison sociale *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville</label>
                  <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NIF / Identifiant fiscal</label>
                  <input value={form.tax_id} onChange={e => setForm(p => ({ ...p, tax_id: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Délai paiement (jours)</label>
                  <input type="number" value={form.payment_terms_days} onChange={e => setForm(p => ({ ...p, payment_terms_days: parseInt(e.target.value) || 30 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Limite de crédit</label>
                  <input type="number" step="0.01" value={form.credit_limit || ''} onChange={e => setForm(p => ({ ...p, credit_limit: parseFloat(e.target.value) || undefined }))}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" placeholder="Illimitée" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-surface-3 text-gray-700 dark:text-gray-300 dark:bg-surface-2 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-surface-3">{t('common.cancel')}</button>
                <button type="submit" disabled={save.isPending} className="flex-1 px-4 py-2.5 bg-[#10B981] text-white rounded-xl text-sm font-semibold disabled:opacity-60">{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
