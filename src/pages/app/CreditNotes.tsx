import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Receipt, X, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

interface CreditNote {
  id: string;
  credit_note_number: string;
  issue_date: string;
  reason: string | null;
  subtotal: number;
  vat_amount: number;
  total: number;
  status: 'draft' | 'issued' | 'applied' | 'cancelled';
  original_invoice_id: string | null;
  customers: { name: string } | null;
  sales_invoices: { invoice_number: string } | null;
}

interface LineFormData {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
}

function calcLine(l: LineFormData) {
  const subtotal = l.quantity * l.unit_price;
  const vatAmount = subtotal * (l.vat_rate / 100);
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

function statusBadge(status: string, t: (key: string) => string) {
  const map: Record<string, { variant: 'gray' | 'info' | 'success' | 'danger'; label: string }> = {
    draft: { variant: 'gray', label: t('creditNotes.statusDraft') },
    issued: { variant: 'info', label: t('creditNotes.statusIssued') },
    applied: { variant: 'success', label: t('creditNotes.statusApplied') },
    cancelled: { variant: 'danger', label: t('creditNotes.statusCancelled') },
  };
  const s = map[status] || { variant: 'gray' as const, label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function CreditNotes() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [lines, setLines] = useState<LineFormData[]>([
    { id: uuidv4(), description: '', quantity: 1, unit_price: 0, vat_rate: tenant?.vat_rate || 0 },
  ]);
  const [formData, setFormData] = useState({
    customer_id: '',
    original_invoice_id: '',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
  });

  const { data: creditNotes = [], isLoading } = useQuery({
    queryKey: ['credit-notes', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*, customers(name), sales_invoices(invoice_number)')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as CreditNote[];
    },
    enabled: !!tenant?.id,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').eq('tenant_id', tenant!.id).eq('is_active', true);
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!tenant?.id,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['sales-invoices-for-cn', tenant?.id, formData.customer_id],
    queryFn: async () => {
      let q = supabase.from('sales_invoices').select('id, invoice_number, customer_id, total').eq('tenant_id', tenant!.id).in('status', ['sent', 'paid']);
      if (formData.customer_id) q = q.eq('customer_id', formData.customer_id);
      const { data } = await q.order('created_at', { ascending: false });
      return (data || []) as { id: string; invoice_number: string; customer_id: string; total: number }[];
    },
    enabled: !!tenant?.id,
  });

  const filtered = creditNotes.filter(cn =>
    !search ||
    cn.credit_note_number.toLowerCase().includes(search.toLowerCase()) ||
    (cn.customers?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totals = {
    subtotal: lines.reduce((s, l) => s + calcLine(l).subtotal, 0),
    vat: lines.reduce((s, l) => s + calcLine(l).vatAmount, 0),
    total: lines.reduce((s, l) => s + calcLine(l).total, 0),
  };

  const resetForm = () => {
    setLines([{ id: uuidv4(), description: '', quantity: 1, unit_price: 0, vat_rate: tenant?.vat_rate || 0 }]);
    setFormData({ customer_id: '', original_invoice_id: '', issue_date: format(new Date(), 'yyyy-MM-dd'), reason: '' });
  };

  const createCreditNote = useMutation({
    mutationFn: async () => {
      if (!formData.customer_id) throw new Error(t('creditNotes.selectCustomerError'));
      if (lines.every(l => !l.description)) throw new Error(t('creditNotes.addLineError'));

      const { data: cnNumber, error: numErr } = await supabase.rpc('next_credit_note_number', { p_tenant_id: tenant!.id });
      if (numErr) throw numErr;

      const { data: cn, error: cnError } = await supabase
        .from('credit_notes')
        .insert({
          tenant_id: tenant!.id,
          credit_note_number: cnNumber,
          customer_id: formData.customer_id,
          original_invoice_id: formData.original_invoice_id || null,
          issue_date: formData.issue_date,
          reason: formData.reason || null,
          subtotal: totals.subtotal,
          vat_amount: totals.vat,
          total: totals.total,
          currency: tenant?.currency || 'XOF',
          status: 'draft',
          created_by: user?.id,
        })
        .select()
        .single();
      if (cnError) throw cnError;

      const itemRows = lines.filter(l => l.description).map(l => {
        const c = calcLine(l);
        return {
          tenant_id: tenant!.id,
          credit_note_id: cn.id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          vat_rate: l.vat_rate,
          line_total: c.total,
        };
      });
      const { error: itemsError } = await supabase.from('credit_note_items').insert(itemRows);
      if (itemsError) throw itemsError;

      // Post immediately to the general ledger (reverses revenue + VAT + receivable)
      const { error: postError } = await supabase.rpc('post_credit_note_to_ledger', { p_credit_note_id: cn.id });
      if (postError) throw postError;

      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id, user_id: user?.id, action: 'create', module: 'credit_notes', record_id: cn.id,
      });

      return cn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('creditNotes.createdAndPosted'));
      setShowForm(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message || t('creditNotes.createError')),
  });

  const updateLine = (id: string, patch: Partial<LineFormData>) => {
    setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(prev => [...prev, { id: uuidv4(), description: '', quantity: 1, unit_price: 0, vat_rate: tenant?.vat_rate || 0 }]);
  const removeLine = (id: string) => setLines(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev));

  const applyInvoiceTotal = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    setFormData(prev => ({ ...prev, original_invoice_id: invoiceId }));
    if (inv) {
      setLines([{ id: uuidv4(), description: `${t('creditNotes.cancelInvoice')} ${inv.invoice_number}`, quantity: 1, unit_price: inv.total, vat_rate: 0 }]);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-medium text-gray-900 dark:text-white">{t('creditNotes.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('creditNotes.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('creditNotes.newCreditNote')}
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('creditNotes.search')}
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-1 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
        />
      </div>

      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-200 dark:border-surface-3 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm">{t('creditNotes.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('creditNotes.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-surface-2 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">{t('creditNotes.colNumber')}</th>
                  <th className="text-left px-4 py-3">{t('creditNotes.colCustomer')}</th>
                  <th className="text-left px-4 py-3">{t('creditNotes.colRelatedInvoice')}</th>
                  <th className="text-left px-4 py-3">{t('creditNotes.colDate')}</th>
                  <th className="text-right px-4 py-3">{t('creditNotes.colAmount')}</th>
                  <th className="text-left px-4 py-3">{t('creditNotes.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-surface-3">
                {filtered.map(cn => (
                  <tr key={cn.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{cn.credit_note_number}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{cn.customers?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-500">{cn.sales_invoices?.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-500">{format(new Date(cn.issue_date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatCurrency(cn.total)}</td>
                    <td className="px-4 py-3">{statusBadge(cn.status, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div
            className="bg-white dark:bg-surface-1 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('creditNotes.newCreditNoteModalTitle')}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('creditNotes.customer')}</label>
                <select
                  value={formData.customer_id}
                  onChange={e => setFormData(prev => ({ ...prev, customer_id: e.target.value, original_invoice_id: '' }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                >
                  <option value="">{t('creditNotes.selectCustomer')}</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('creditNotes.originalInvoice')}</label>
                <select
                  value={formData.original_invoice_id}
                  onChange={e => applyInvoiceTotal(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                >
                  <option value="">{t('creditNotes.noneFreeCredit')}</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — {formatCurrency(i.total)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('creditNotes.issueDate')}</label>
                <input
                  type="date"
                  value={formData.issue_date}
                  onChange={e => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('creditNotes.reason')}</label>
                <input
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={t('creditNotes.reasonPlaceholder')}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2 mb-3">
              <label className="text-xs text-gray-500 dark:text-gray-400">{t('creditNotes.lines')}</label>
              {lines.map(line => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-5 px-2 py-1.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                    placeholder={t('creditNotes.description')}
                    value={line.description}
                    onChange={e => updateLine(line.id, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    className="col-span-2 px-2 py-1.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                    placeholder={t('creditNotes.qty')}
                    value={line.quantity}
                    onChange={e => updateLine(line.id, { quantity: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className="col-span-2 px-2 py-1.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                    placeholder={t('creditNotes.unitPrice')}
                    value={line.unit_price}
                    onChange={e => updateLine(line.id, { unit_price: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    className="col-span-2 px-2 py-1.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                    placeholder={t('creditNotes.vat')}
                    value={line.vat_rate}
                    onChange={e => updateLine(line.id, { vat_rate: Number(e.target.value) })}
                  />
                  <button onClick={() => removeLine(line.id)} className="col-span-1 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addLine} className="text-xs text-[#0057D9] font-medium hover:underline">{t('creditNotes.addLine')}</button>
            </div>

            <div className="border-t border-gray-100 dark:border-surface-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>{t('creditNotes.subtotal')}</span><span>{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>{t('creditNotes.vatLabel')}</span><span>{formatCurrency(totals.vat)}</span></div>
              <div className="flex justify-between font-medium text-gray-900 dark:text-white text-base"><span>{t('creditNotes.totalCreditNote')}</span><span>{formatCurrency(totals.total)}</span></div>
            </div>

            <button
              onClick={() => createCreditNote.mutate()}
              disabled={createCreditNote.isPending}
              className="w-full mt-5 flex items-center justify-center gap-2 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              {createCreditNote.isPending ? t('creditNotes.creating') : t('creditNotes.createAndPost')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
