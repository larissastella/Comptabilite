import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Repeat, Trash2, Pause, Play, X, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Customer, Product } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
};

interface TemplateLine {
  id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

interface RecurringTemplate {
  id: string;
  label: string;
  customer_id: string | null;
  frequency: string;
  next_run_date: string;
  end_date: string | null;
  is_active: boolean;
  due_in_days: number;
  customers: { name: string } | null;
}

/**
 * The DB layer for this (recurring_invoice_templates + the
 * generate_due_recurring_invoices() function, migration 012) has existed
 * for a while with no UI and no scheduler ever calling it — meaning
 * "automatic recurring invoicing" was 0% functional for every tenant on
 * every plan, not specifically missing from a lower tier. This page +
 * supabase/functions/generate-recurring-invoices (wired into the daily
 * billing-cron.yml) is the real fix. Access is gated to Premium/
 * Enterprise both here AND at the RLS level (migration 040) — hiding
 * this page alone wouldn't have stopped a Starter tenant from writing to
 * the table directly via the Supabase client.
 */
export default function RecurringInvoices() {
  const { tenant, formatCurrency } = useTenant();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dueInDays, setDueInDays] = useState(30);
  const [endDate, setEndDate] = useState('');
  const [lines, setLines] = useState<TemplateLine[]>([
    { id: crypto.randomUUID(), product_id: '', description: '', quantity: 1, unit_price: 0, vat_rate: 0 },
  ]);

  const isPremiumOrAbove = tenant?.plan === 'premium' || tenant?.plan === 'enterprise';

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['recurring-templates', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_invoice_templates')
        .select('id, label, customer_id, frequency, next_run_date, end_date, is_active, due_in_days, customers(name)')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecurringTemplate[];
    },
    enabled: !!tenant?.id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-recurring', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').eq('tenant_id', tenant!.id).order('name');
      return (data ?? []) as Pick<Customer, 'id' | 'name'>[];
    },
    enabled: !!tenant?.id && showCreate,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-recurring', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sale_price, vat_rate').eq('tenant_id', tenant!.id).order('name');
      return (data ?? []) as unknown as (Pick<Product, 'id' | 'name'> & { sale_price: number; vat_rate: number })[];
    },
    enabled: !!tenant?.id && showCreate,
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!label.trim()) throw new Error('Le nom du modèle est requis');
      if (lines.some(l => !l.description.trim())) throw new Error('Chaque ligne doit avoir une description');
      const { data: tpl, error } = await supabase.from('recurring_invoice_templates').insert({
        tenant_id: tenant!.id,
        label,
        customer_id: customerId || null,
        frequency,
        due_in_days: dueInDays,
        end_date: endDate || null,
        currency: tenant?.currency ?? 'XAF',
      }).select('id').single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from('recurring_invoice_template_items').insert(
        lines.map((l, i) => ({
          template_id: tpl.id,
          tenant_id: tenant!.id,
          product_id: l.product_id || null,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          vat_rate: l.vat_rate,
          sort_order: i,
        }))
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-templates'] });
      toast.success('Modèle de facture récurrente créé');
      setShowCreate(false);
      setLabel(''); setCustomerId(''); setFrequency('monthly'); setDueInDays(30); setEndDate('');
      setLines([{ id: crypto.randomUUID(), product_id: '', description: '', quantity: 1, unit_price: 0, vat_rate: 0 }]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('recurring_invoice_templates').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-templates'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_invoice_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-templates'] }); toast.success('Modèle supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function updateLine(id: string, patch: Partial<TemplateLine>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines(prev => [...prev, { id: crypto.randomUUID(), product_id: '', description: '', quantity: 1, unit_price: 0, vat_rate: 0 }]);
  }
  function removeLine(id: string) {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  if (!isPremiumOrAbove) {
    return (
      <div className="p-6 sm:p-8 max-w-2xl mx-auto">
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Factures récurrentes</h1>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Automatise la génération de tes factures pour tes clients réguliers (abonnements, loyers, contrats
            de maintenance...). Disponible à partir du forfait Premium.
          </p>
          <Link to="/app/billing" className="inline-flex px-6 py-2.5 bg-[#0057D9] text-white text-sm font-semibold rounded-xl hover:bg-[#003F9E]">
            Passer à Premium
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Repeat className="w-5 h-5 text-[#0057D9]" /> Factures récurrentes</h1>
          <p className="text-sm text-gray-400 mt-1">Génération automatique de brouillons de facture selon la fréquence choisie</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] text-white text-sm font-semibold rounded-xl hover:bg-[#003F9E]">
          <Plus className="w-4 h-4" /> Nouveau modèle
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Chargement...</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 border-dashed">
          <Repeat className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucun modèle de facture récurrente pour l'instant.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Modèle</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fréquence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Prochaine génération</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map(tpl => (
                <tr key={tpl.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{tpl.label}</td>
                  <td className="px-4 py-3 text-gray-600">{tpl.customers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{FREQUENCY_LABELS[tpl.frequency] ?? tpl.frequency}</td>
                  <td className="px-4 py-3 text-gray-600">{tpl.is_active ? format(new Date(tpl.next_run_date), 'dd/MM/yyyy') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${tpl.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tpl.is_active ? 'Actif' : 'En pause'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => toggleActive.mutate({ id: tpl.id, isActive: !tpl.is_active })} className="p-1.5 text-gray-400 hover:text-gray-700" title={tpl.is_active ? 'Mettre en pause' : 'Réactiver'}>
                        {tpl.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { if (confirm(`Supprimer le modèle "${tpl.label}" ?`)) deleteTemplate.mutate(tpl.id); }} className="p-1.5 text-gray-400 hover:text-red-600" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-medium text-gray-900">Nouveau modèle de facture récurrente</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du modèle</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Abonnement mensuel client X"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                  <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                    <option value="">— Sélectionner —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fréquence</label>
                  <select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Échéance (jours après émission)</label>
                  <input type="number" min={0} value={dueInDays} onChange={e => setDueInDays(Number(e.target.value))} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin (optionnel)</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Lignes de facture</label>
                  <button onClick={addLine} className="text-xs text-[#0057D9] font-medium hover:underline">+ Ajouter une ligne</button>
                </div>
                <div className="space-y-2">
                  {lines.map(line => (
                    <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={line.product_id}
                        onChange={e => {
                          const p = products.find(p => p.id === e.target.value);
                          updateLine(line.id, { product_id: e.target.value, ...(p ? { description: p.name, unit_price: p.sale_price, vat_rate: p.vat_rate } : {}) });
                        }}
                        className="col-span-3 px-2 py-2 border border-gray-300 rounded-lg text-xs"
                      >
                        <option value="">Produit (opt.)</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input value={line.description} onChange={e => updateLine(line.id, { description: e.target.value })} placeholder="Description"
                        className="col-span-4 px-2 py-2 border border-gray-300 rounded-lg text-xs" />
                      <input type="number" min={0} value={line.quantity} onChange={e => updateLine(line.id, { quantity: Number(e.target.value) })} placeholder="Qté"
                        className="col-span-1 px-2 py-2 border border-gray-300 rounded-lg text-xs" />
                      <input type="number" min={0} value={line.unit_price} onChange={e => updateLine(line.id, { unit_price: Number(e.target.value) })} placeholder="P.U."
                        className="col-span-2 px-2 py-2 border border-gray-300 rounded-lg text-xs" />
                      <input type="number" min={0} max={100} value={line.vat_rate} onChange={e => updateLine(line.id, { vat_rate: Number(e.target.value) })} placeholder="TVA%"
                        className="col-span-1 px-2 py-2 border border-gray-300 rounded-lg text-xs" />
                      <button onClick={() => removeLine(line.id)} className="col-span-1 text-gray-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Total estimé par occurrence : {formatCurrency(lines.reduce((s, l) => s + l.quantity * l.unit_price * (1 + l.vat_rate / 100), 0))}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">Annuler</button>
              <button
                onClick={() => createTemplate.mutate()}
                disabled={createTemplate.isPending}
                className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
              >
                {createTemplate.isPending ? 'Création...' : 'Créer le modèle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
