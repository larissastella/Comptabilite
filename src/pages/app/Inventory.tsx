import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Package, Edit2, Trash2, AlertTriangle, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Product, ProductType } from '../../types';
import toast from 'react-hot-toast';

interface ProductFormData {
  sku: string; name: string; name_en: string; description: string;
  category: string; product_type: ProductType; unit_of_measure: string;
  sale_price: number; purchase_price: number; vat_rate: string;
  track_stock: boolean; is_active: boolean;
}

const UNITS = ['pcs', 'kg', 'g', 'L', 'mL', 'm', 'cm', 'boîte', 'carton', 'sac', 'litre', 'paquet'];

export default function Inventory() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>({
    sku: '', name: '', name_en: '', description: '', category: '',
    product_type: 'goods', unit_of_measure: 'pcs',
    sale_price: 0, purchase_price: 0, vat_rate: '',
    track_stock: true, is_active: true,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products').select('*').eq('tenant_id', tenant!.id).order('name');
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!tenant?.id,
  });

  // Get stock levels
  const { data: stockLevels = [] } = useQuery({
    queryKey: ['stock-levels', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_entries')
        .select('product_id, quantity')
        .eq('tenant_id', tenant!.id);
      // Aggregate by product
      const agg: Record<string, number> = {};
      (data || []).forEach((e: { product_id: string; quantity: number }) => {
        agg[e.product_id] = (agg[e.product_id] || 0) + e.quantity;
      });
      return agg;
    },
    enabled: !!tenant?.id,
  });

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !category || p.category === category;
    return matchSearch && matchCat;
  });

  const save = useMutation({
    mutationFn: async (d: ProductFormData) => {
      const payload = {
        ...d,
        tenant_id: tenant!.id,
        vat_rate: d.vat_rate ? parseFloat(d.vat_rate) : null,
        sku: d.sku || null,
      };
      if (editProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(editProduct ? 'Produit modifié' : 'Produit créé');
      setShowForm(false); setEditProduct(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Produit supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditProduct(null);
    setForm({ sku: '', name: '', name_en: '', description: '', category: '', product_type: 'goods', unit_of_measure: 'pcs', sale_price: 0, purchase_price: 0, vat_rate: '', track_stock: true, is_active: true });
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({ sku: p.sku || '', name: p.name, name_en: p.name_en || '', description: p.description || '', category: p.category || '', product_type: p.product_type, unit_of_measure: p.unit_of_measure, sale_price: p.sale_price, purchase_price: p.purchase_price, vat_rate: p.vat_rate != null ? String(p.vat_rate) : '', track_stock: p.track_stock, is_active: p.is_active });
    setShowForm(true);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('inventory.products')}</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> {t('inventory.newProduct')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher produit / SKU..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
        </div>
        {categories.length > 0 && (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] bg-white">
              <option value="">Toutes catégories</option>
              {categories.map(c => <option key={c} value={c!}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({length: 8}).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
              <div className="h-6 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">{t('inventory.noProducts')}</h3>
          <p className="text-sm text-gray-400 mb-4">{t('inventory.noProductsDesc')}</p>
          <button onClick={openCreate} className="px-4 py-2 bg-[#0057D9] text-white text-sm font-medium rounded-xl hover:bg-[#003F9E]">
            {t('inventory.newProduct')}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produit</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Catégorie</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('inventory.salePrice')}</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('inventory.purchasePrice')}</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('inventory.stock')}</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(p => {
                    const stock = (stockLevels as Record<string, number>)[p.id] || 0;
                    const lowStock = p.track_stock && stock <= 5 && stock > 0;
                    const outOfStock = p.track_stock && stock <= 0;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 group">
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{p.name}</p>
                            {p.sku && <p className="text-xs text-gray-400 font-mono">{p.sku}</p>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {p.category ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{p.category}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm font-semibold text-gray-900">{formatCurrency(p.sale_price)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-sm text-gray-600">{formatCurrency(p.purchase_price)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {!p.track_stock ? (
                            <span className="text-xs text-gray-400">Non suivi</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {(lowStock || outOfStock) && <AlertTriangle className={`w-3.5 h-3.5 ${outOfStock ? 'text-red-500' : 'text-amber-500'}`} />}
                              <span className={`text-sm font-medium ${outOfStock ? 'text-red-600' : lowStock ? 'text-amber-600' : 'text-gray-900'}`}>
                                {stock} {p.unit_of_measure}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-[#0057D9] rounded-lg hover:bg-gray-100"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteProduct.mutate(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(p => {
              const stock = (stockLevels as Record<string, number>)[p.id] || 0;
              const lowStock = p.track_stock && stock <= 5 && stock > 0;
              const outOfStock = p.track_stock && stock <= 0;
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      {p.sku && <p className="text-xs text-gray-400 font-mono mt-0.5">{p.sku}</p>}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  {p.category && <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full mb-2">{p.category}</span>}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400">Prix vente</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(p.sale_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Prix achat</p>
                      <p className="text-sm text-gray-600">{formatCurrency(p.purchase_price)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Stock</p>
                      {!p.track_stock ? (
                        <p className="text-sm text-gray-400">Non suivi</p>
                      ) : (
                        <p className={`text-sm font-medium flex items-center gap-1 ${outOfStock ? 'text-red-600' : lowStock ? 'text-amber-600' : 'text-gray-900'}`}>
                          {(lowStock || outOfStock) && <AlertTriangle className="w-3 h-3" />}
                          {stock} {p.unit_of_measure}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button onClick={() => openEdit(p)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg"><Edit2 className="w-3 h-3" />Modifier</button>
                    <button onClick={() => deleteProduct.mutate(p.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-3 h-3" />Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <h2 className="text-lg font-medium text-gray-900 mb-5">{editProduct ? 'Modifier le produit' : t('inventory.newProduct')}</h2>
            <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.sku')}</label>
                  <input value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" placeholder="SKU-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.product_type} onChange={e => setForm(p => ({ ...p, product_type: e.target.value as ProductType }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                    <option value="goods">Marchandise</option>
                    <option value="service">Service</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom (FR) *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.category')}</label>
                  <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" list="categories-list" />
                  <datalist id="categories-list">{categories.map(c => <option key={c} value={c!} />)}</datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.unit')}</label>
                  <select value={form.unit_of_measure} onChange={e => setForm(p => ({ ...p, unit_of_measure: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.salePrice')}</label>
                  <input type="number" step="0.01" min="0" value={form.sale_price} onChange={e => setForm(p => ({ ...p, sale_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('inventory.purchasePrice')}</label>
                  <input type="number" step="0.01" min="0" value={form.purchase_price} onChange={e => setForm(p => ({ ...p, purchase_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">TVA %</label>
                  <input type="number" step="0.01" min="0" value={form.vat_rate} onChange={e => setForm(p => ({ ...p, vat_rate: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    placeholder={`${tenant?.vat_rate || 0}`} />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.track_stock} onChange={e => setForm(p => ({ ...p, track_stock: e.target.checked }))} className="rounded" />
                  {t('inventory.trackStock')}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
                  Actif
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50">{t('common.cancel')}</button>
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
