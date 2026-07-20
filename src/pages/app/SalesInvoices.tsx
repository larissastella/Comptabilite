import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, FileText, Download, MessageCircle, Printer, CheckCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { SalesInvoice, SalesInvoiceItem, InvoiceStatus, Customer, Product, Warehouse } from '../../types';
import { format, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

const STATUS_TABS: { key: InvoiceStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'draft', label: 'Brouillon' },
  { key: 'sent', label: 'Envoyée' },
  { key: 'paid', label: 'Payée' },
  { key: 'overdue', label: 'En retard' },
  { key: 'cancelled', label: 'Annulée' },
];

const statusBadge = (status: string, dueDate?: string) => {
  const computedStatus = status === 'sent' && dueDate && isAfter(new Date(), new Date(dueDate)) ? 'overdue' : status;
  const map: Record<string, { variant: 'gray' | 'info' | 'success' | 'danger'; label: string }> = {
    draft: { variant: 'gray', label: 'Brouillon' },
    sent: { variant: 'info', label: 'Envoyée' },
    paid: { variant: 'success', label: 'Payée' },
    overdue: { variant: 'danger', label: 'En retard' },
    cancelled: { variant: 'gray', label: 'Annulée' },
    credit_note: { variant: 'warning' as never, label: 'Avoir' },
  };
  const s = map[computedStatus] || { variant: 'gray' as const, label: computedStatus };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

interface InvoiceLineFormData {
  id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  vat_rate: number;
}

function calcLine(line: InvoiceLineFormData, defaultVat: number) {
  const vat = line.vat_rate !== undefined ? line.vat_rate : defaultVat;
  const subtotal = line.quantity * line.unit_price * (1 - line.discount_pct / 100);
  const vatAmount = subtotal * (vat / 100);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

export default function SalesInvoices() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<InvoiceLineFormData[]>([{
    id: uuidv4(), product_id: '', description: '', quantity: 1, unit_price: 0, discount_pct: 0, vat_rate: tenant?.vat_rate || 0,
  }]);
  const [formData, setFormData] = useState({
    customer_id: '',
    warehouse_id: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    payment_method: '',
    notes: '',
    terms: '',
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['sales-invoices', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('*, customers(name)')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (SalesInvoice & { customers: { name: string } | null })[];
    },
    enabled: !!tenant?.id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').eq('tenant_id', tenant!.id).eq('is_active', true);
      return (data || []) as Pick<Customer, 'id' | 'name'>[];
    },
    enabled: !!tenant?.id,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id, name').eq('tenant_id', tenant!.id).eq('is_active', true);
      return (data || []) as Pick<Warehouse, 'id' | 'name'>[];
    },
    enabled: !!tenant?.id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sale_price, vat_rate, unit_of_measure').eq('tenant_id', tenant!.id).eq('is_active', true);
      return (data || []) as Pick<Product, 'id' | 'name' | 'sale_price' | 'vat_rate' | 'unit_of_measure'>[];
    },
    enabled: !!tenant?.id,
  });

  const filtered = invoices.filter(inv => {
    const matchSearch = !search ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customers?.name || '').toLowerCase().includes(search.toLowerCase());
    const isOverdue = inv.status === 'sent' && inv.due_date && isAfter(new Date(), new Date(inv.due_date));
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'overdue' ? isOverdue : inv.status === statusFilter);
    return matchSearch && matchStatus;
  });

  const totals = {
    subtotal: lines.reduce((s, l) => s + calcLine(l, tenant?.vat_rate || 0).subtotal, 0),
    vat: lines.reduce((s, l) => s + calcLine(l, tenant?.vat_rate || 0).vatAmount, 0),
    total: lines.reduce((s, l) => s + calcLine(l, tenant?.vat_rate || 0).total, 0),
  };

  const createInvoice = useMutation({
    mutationFn: async () => {
      const { data: invNum } = await supabase.rpc('next_invoice_number', { p_tenant_id: tenant!.id });

      const { data: inv, error: invError } = await supabase
        .from('sales_invoices')
        .insert({
          tenant_id: tenant!.id,
          invoice_number: invNum,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          customer_id: formData.customer_id || null,
          warehouse_id: formData.warehouse_id || null,
          status: 'draft',
          subtotal: totals.subtotal,
          vat_amount: totals.vat,
          total: totals.total,
          currency: tenant!.currency,
          payment_method: formData.payment_method,
          notes: formData.notes,
          terms: formData.terms,
          created_by: user!.id,
          offline_id: uuidv4(),
        })
        .select()
        .single();

      if (invError) throw invError;

      const itemsPayload = lines.map((l, idx) => {
        const { subtotal, vatAmount, total } = calcLine(l, tenant?.vat_rate || 0);
        return {
          invoice_id: inv.id,
          tenant_id: tenant!.id,
          product_id: l.product_id || null,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          vat_rate: l.vat_rate,
          subtotal,
          vat_amount: vatAmount,
          total,
          sort_order: idx,
        };
      });

      const { error: itemsError } = await supabase.from('sales_invoice_items').insert(itemsPayload);
      if (itemsError) throw itemsError;

      return inv;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success('Facture créée');
      setShowForm(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { data: inv } = await supabase.from('sales_invoices').select('total').eq('id', id).single();
      const { error } = await supabase.from('sales_invoices').update({
        status: 'paid', amount_paid: inv?.total || 0, paid_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-invoices'] }); toast.success('Marquée comme payée'); },
    onError: (err: Error) => toast.error(err.message),
  });

  function resetForm() {
    setFormData({ customer_id: '', warehouse_id: '', invoice_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', payment_method: '', notes: '', terms: '' });
    setLines([{ id: uuidv4(), product_id: '', description: '', quantity: 1, unit_price: 0, discount_pct: 0, vat_rate: tenant?.vat_rate || 0 }]);
  }

  function addLine() {
    setLines(prev => [...prev, { id: uuidv4(), product_id: '', description: '', quantity: 1, unit_price: 0, discount_pct: 0, vat_rate: tenant?.vat_rate || 0 }]);
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function updateLine(id: string, key: keyof InvoiceLineFormData, value: string | number) {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (key === 'product_id' && typeof value === 'string') {
        const prod = products.find(p => p.id === value);
        if (prod) return { ...l, product_id: value, description: prod.name, unit_price: prod.sale_price, vat_rate: prod.vat_rate ?? tenant?.vat_rate ?? 0 };
      }
      return { ...l, [key]: value };
    }));
  }

  function sendWhatsApp(inv: SalesInvoice & { customers: { name: string } | null }) {
    const msg = encodeURIComponent(`Bonjour ${inv.customers?.name || ''}, veuillez trouver ci-joint votre facture N° ${inv.invoice_number} d'un montant de ${formatCurrency(inv.total)}. Merci.`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  const statusCounts: Record<string, number> = {
    all: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'sent' && i.due_date && isAfter(new Date(), new Date(i.due_date))).length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
    credit_note: invoices.filter(i => i.status === 'credit_note').length,
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('invoices.title')}</h1>
        <button onClick={() => { setShowForm(true); resetForm(); }} className="flex items-center gap-2 px-4 py-2.5 bg-[#10B981] hover:bg-[#0d9e6e] text-white text-sm font-semibold rounded-xl">
          <Plus className="w-4 h-4" /> {t('invoices.new')}
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-5">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-[#10B981] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {statusCounts[tab.key] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${statusFilter === tab.key ? 'bg-white/20' : 'bg-gray-200'}`}>
                {statusCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par numéro ou client..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-16 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-14 h-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">{t('invoices.noInvoices')}</h3>
          <p className="text-sm text-gray-400 mb-4">{t('invoices.noInvoicesDesc')}</p>
          <button onClick={() => { setShowForm(true); resetForm(); }} className="px-4 py-2 bg-[#10B981] text-white text-sm rounded-xl hover:bg-[#0d9e6e]">{t('invoices.createFirst')}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('invoices.number'), t('invoices.customer'), t('invoices.date'), t('invoices.dueDate'), t('invoices.status'), t('invoices.total'), t('invoices.balance'), ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50 group">
                      <td className="px-4 py-3.5">
                        <Link to={`/app/sales-invoices/${inv.id}`} className="font-mono text-sm font-semibold text-[#10B981] hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-900">{inv.customers?.name || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {format(new Date(inv.invoice_date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {inv.due_date ? format(new Date(inv.due_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3.5">{statusBadge(inv.status, inv.due_date)}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(inv.total)}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatCurrency(inv.balance_due)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/app/sales-invoices/${inv.id}`} className="p-1.5 text-gray-400 hover:text-[#10B981] rounded-lg hover:bg-gray-100">
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => sendWhatsApp(inv)} className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg hover:bg-green-50">
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          {inv.status !== 'paid' && (
                            <button onClick={() => markPaid.mutate(inv.id)} className="p-1.5 text-gray-400 hover:text-[#10B981] rounded-lg hover:bg-gray-100">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(inv => (
              <div key={inv.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <Link to={`/app/sales-invoices/${inv.id}`} className="font-mono text-sm font-semibold text-[#10B981] hover:underline">
                      {inv.invoice_number}
                    </Link>
                    <p className="text-sm text-gray-900 mt-0.5">{inv.customers?.name || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(inv.invoice_date), 'dd/MM/yyyy')}
                      {inv.due_date && ` · Échéance ${format(new Date(inv.due_date), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                  {statusBadge(inv.status, inv.due_date)}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  <div>
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(inv.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Solde dû</p>
                    <p className="text-sm text-gray-600">{formatCurrency(inv.balance_due)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Link to={`/app/sales-invoices/${inv.id}`} className="p-1.5 text-gray-400 hover:text-[#10B981] rounded-lg hover:bg-gray-100">
                      <FileText className="w-4 h-4" />
                    </Link>
                    <button onClick={() => sendWhatsApp(inv)} className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg hover:bg-green-50">
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    {inv.status !== 'paid' && (
                      <button onClick={() => markPaid.mutate(inv.id)} className="p-1.5 text-gray-400 hover:text-[#10B981] rounded-lg hover:bg-gray-100">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Invoice Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">{t('invoices.new')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {/* Header fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.customer')}</label>
                  <select value={formData.customer_id} onChange={e => setFormData(p => ({ ...p, customer_id: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]">
                    <option value="">Aucun client</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.date')}</label>
                  <input type="date" value={formData.invoice_date} onChange={e => setFormData(p => ({ ...p, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.dueDate')}</label>
                  <input type="date" value={formData.due_date} onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Magasin</label>
                  <select value={formData.warehouse_id} onChange={e => setFormData(p => ({ ...p, warehouse_id: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]">
                    <option value="">Défaut</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('invoices.paymentMethod')}</label>
                  <select value={formData.payment_method} onChange={e => setFormData(p => ({ ...p, payment_method: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]">
                    <option value="">Sélectionner</option>
                    <option value="cash">Espèces</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="bank_transfer">Virement bancaire</option>
                    <option value="cheque">Chèque</option>
                    <option value="card">Carte bancaire</option>
                  </select>
                </div>
              </div>

              {/* Line items — desktop grid */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('invoices.invoiceLines')}</h3>
                <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider gap-2">
                    <div className="col-span-3">{t('invoices.product')}</div>
                    <div className="col-span-3">{t('invoices.description')}</div>
                    <div className="col-span-1 text-right">{t('invoices.quantity')}</div>
                    <div className="col-span-2 text-right">{t('invoices.unitPrice')}</div>
                    <div className="col-span-1 text-right">Rem %</div>
                    <div className="col-span-1 text-right">TVA %</div>
                    <div className="col-span-1"></div>
                  </div>
                  {lines.map(line => {
                    const { total } = calcLine(line, tenant?.vat_rate || 0);
                    return (
                      <div key={line.id} className="grid grid-cols-12 px-4 py-2.5 border-t border-gray-100 gap-2 items-center">
                        <div className="col-span-3">
                          <select value={line.product_id} onChange={e => updateLine(line.id, 'product_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#10B981]">
                            <option value="">Saisie libre</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} placeholder="Description"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        </div>
                        <div className="col-span-1">
                          <input type="number" step="0.001" min="0" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        </div>
                        <div className="col-span-2">
                          <input type="number" step="0.01" min="0" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        </div>
                        <div className="col-span-1">
                          <input type="number" step="0.1" min="0" max="100" value={line.discount_pct} onChange={e => updateLine(line.id, 'discount_pct', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        </div>
                        <div className="col-span-1">
                          <input type="number" step="0.01" min="0" value={line.vat_rate} onChange={e => updateLine(line.id, 'vat_rate', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{formatCurrency(total)}</span>
                          {lines.length > 1 && (
                            <button onClick={() => removeLine(line.id)} className="text-red-400 hover:text-red-600 ml-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Line items — mobile stacked */}
                <div className="sm:hidden space-y-3">
                  {lines.map((line, idx) => {
                    const { total } = calcLine(line, tenant?.vat_rate || 0);
                    return (
                      <div key={line.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase">Ligne {idx + 1}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">{formatCurrency(total)}</span>
                            {lines.length > 1 && (
                              <button onClick={() => removeLine(line.id)} className="text-red-400 hover:text-red-600">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <select value={line.product_id} onChange={e => updateLine(line.id, 'product_id', e.target.value)}
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#10B981]">
                          <option value="">Saisie libre</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)} placeholder="Description"
                          className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400">Qté</label>
                            <input type="number" step="0.001" min="0" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Prix unit.</label>
                            <input type="number" step="0.01" min="0" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">Remise %</label>
                            <input type="number" step="0.1" min="0" max="100" value={line.discount_pct} onChange={e => updateLine(line.id, 'discount_pct', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">TVA %</label>
                            <input type="number" step="0.01" min="0" value={line.vat_rate} onChange={e => updateLine(line.id, 'vat_rate', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#10B981]" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={addLine} className="mt-2 flex items-center gap-1.5 text-sm text-[#10B981] hover:underline">
                  <Plus className="w-4 h-4" /> {t('invoices.addItem')}
                </button>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full sm:w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('invoices.subtotal')}</span>
                    <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t('invoices.vat')}</span>
                    <span className="font-medium">{formatCurrency(totals.vat)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
                    <span>Total</span>
                    <span className="text-[#10B981]">{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Conditions</label>
                  <textarea value={formData.terms} onChange={e => setFormData(p => ({ ...p, terms: e.target.value }))} rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 sm:px-6 pb-5 sm:pb-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50">{t('common.cancel')}</button>
              <button onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}
                className="flex-1 px-4 py-2.5 bg-[#10B981] hover:bg-[#0d9e6e] text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                {createInvoice.isPending ? 'Création...' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
