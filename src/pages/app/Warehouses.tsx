import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Warehouse, Edit2, Trash2, MapPin, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Warehouse as WarehouseType } from '../../types';
import toast from 'react-hot-toast';

interface WarehouseFormData {
  name: string; address: string; city: string; is_default: boolean; is_active: boolean;
}

export default function Warehouses() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<WarehouseType | null>(null);
  const [form, setForm] = useState<WarehouseFormData>({ name: '', address: '', city: '', is_default: false, is_active: true });

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').eq('tenant_id', tenant!.id).order('name');
      if (error) throw error;
      return data as WarehouseType[];
    },
    enabled: !!tenant?.id,
  });

  const save = useMutation({
    mutationFn: async (d: WarehouseFormData) => {
      const payload = { ...d, tenant_id: tenant!.id };
      if (editWarehouse) {
        const { error } = await supabase.from('warehouses').update(payload).eq('id', editWarehouse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('warehouses').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); toast.success('Enregistré'); setShowForm(false); setEditWarehouse(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteWarehouse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); toast.success('Supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditWarehouse(null);
    setForm({ name: '', address: '', city: '', is_default: false, is_active: true });
    setShowForm(true);
  }

  function openEdit(w: WarehouseType) {
    setEditWarehouse(w);
    setForm({ name: w.name, address: w.address || '', city: w.city || '', is_default: w.is_default, is_active: w.is_active });
    setShowForm(true);
  }

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('warehouses.title')}</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl">
          <Plus className="w-4 h-4" /> {t('warehouses.new')}
        </button>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-6 animate-pulse h-32" />)}
        </div>
      ) : warehouses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Warehouse className="w-14 h-14 text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('warehouses.noWarehouses')}</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">{t('warehouses.noWarehousesDesc')}</p>
          <button onClick={openCreate} className="px-4 py-2 bg-[#0057D9] text-white text-sm rounded-xl hover:bg-[#003F9E]">{t('warehouses.new')}</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(w => (
            <div key={w.id} className={`bg-white dark:bg-surface-1 rounded-2xl border p-5 group hover:shadow-md dark:hover:shadow-lg transition-shadow ${w.is_default ? 'border-[#0057D9] dark:border-[#0057D9]' : 'border-gray-100 dark:border-surface-3'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-[#0057D9]/10 rounded-xl flex items-center justify-center">
                  <Warehouse className="w-5 h-5 text-[#0057D9]" />
                </div>
                {w.is_default && (
                  <span className="flex items-center gap-1 text-xs text-[#0057D9] font-medium">
                    <Star className="w-3.5 h-3.5 fill-current" /> {t('warehouses.default')}
                  </span>
                )}
              </div>
              <h3 className="text-base font-semibold text-gray-900">{w.name}</h3>
              {(w.address || w.city) && (
                <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  {[w.address, w.city].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="flex items-center justify-between mt-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {w.is_active ? 'Actif' : 'Inactif'}
                </span>
                <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(w)} className="p-1.5 text-gray-400 hover:text-[#0057D9] rounded-lg hover:bg-gray-100"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteWarehouse.mutate(w.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <h2 className="text-lg font-medium text-gray-900 mb-4">{editWarehouse ? 'Modifier le magasin' : t('warehouses.new')}</h2>
            <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} className="rounded" />
                  Magasin par défaut
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
                  Actif
                </label>
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
