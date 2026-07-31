import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Truck, Edit2, Trash2, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Supplier } from '../../types';
import toast from 'react-hot-toast';

type SupplierFormData = Omit<Supplier, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>;

export default function Suppliers() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const blank: SupplierFormData = { name: '', email: '', phone: '', address: '', city: '', country: '', tax_id: '', legal_id: '', payment_terms_days: 30, notes: '', is_active: true };
  const [form, setForm] = useState<SupplierFormData>(blank);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').eq('tenant_id', tenant!.id).order('name');
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!tenant?.id,
  });

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const save = useMutation({
    mutationFn: async (d: SupplierFormData) => {
      const payload = { ...d, tenant_id: tenant!.id };
      if (editSupplier) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Enregistré'); setShowForm(false); setEditSupplier(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() { setEditSupplier(null); setForm(blank); setShowForm(true); }
  function openEdit(s: Supplier) {
    setEditSupplier(s);
    setForm({ name: s.name, email: s.email || '', phone: s.phone || '', address: s.address || '', city: s.city || '', country: s.country || '', tax_id: s.tax_id || '', legal_id: s.legal_id || '', payment_terms_days: s.payment_terms_days, notes: s.notes || '', is_active: s.is_active });
    setShowForm(true);
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('suppliers.title')}</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl">
          <Plus className="w-4 h-4" /> {t('suppliers.new')}
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher fournisseur..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 h-20 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Truck className="w-14 h-14 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('suppliers.noSuppliers')}</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{t('suppliers.noSuppliersDesc')}</p>
          <button onClick={openCreate} className="px-4 py-2 bg-[#0057D9] text-white text-sm rounded-xl hover:bg-[#003F9E]">{t('suppliers.new')}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-2">
                  {['Fournisseur', 'Contact', 'Ville', 'Délai paiement', 'Statut', ''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 group">
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-gray-900">{s.name}</p>
                      {s.tax_id && <p className="text-xs text-gray-400">NIF: {s.tax_id}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-0.5">
                        {s.email && <p className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{s.email}</p>}
                        {s.phone && <p className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{s.phone}</p>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{s.city || '—'}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{s.payment_terms_days} jours</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-[#0057D9] rounded-lg hover:bg-gray-100"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del.mutate(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(s => (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    {s.tax_id && <p className="text-xs text-gray-400 mt-0.5">NIF: {s.tax_id}</p>}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  {s.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{s.email}</p>}
                  {s.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{s.phone}</p>}
                  <p className="flex items-center gap-1.5"><span className="font-medium text-gray-400">Ville:</span>{s.city || '—'}</p>
                  <p className="flex items-center gap-1.5"><span className="font-medium text-gray-400">Délai:</span>{s.payment_terms_days} jours</p>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <button onClick={() => openEdit(s)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg"><Edit2 className="w-3 h-3" />Modifier</button>
                  <button onClick={() => del.mutate(s.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-3 h-3" />Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <h2 className="text-lg font-medium text-gray-900 mb-5">{editSupplier ? 'Modifier fournisseur' : t('suppliers.new')}</h2>
            <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom / Raison sociale *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Délai paiement (jours)</label>
                  <input type="number" value={form.payment_terms_days} onChange={e => setForm(p => ({ ...p, payment_terms_days: parseInt(e.target.value) || 30 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">{t('common.cancel')}</button>
                <button type="submit" disabled={save.isPending} className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60">{t('common.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
