import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MessageCircle, Printer, CheckCircle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { SalesInvoice, SalesInvoiceItem } from '../../types';
import { format } from 'date-fns';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';

export default function InvoiceDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { tenant, formatCurrency } = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('*, customers(*), sales_invoice_items(*, products(name, unit_of_measure))')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as SalesInvoice & {
        customers: { name: string; email?: string; phone?: string; address?: string; city?: string; tax_id?: string } | null;
        sales_invoice_items: (SalesInvoiceItem & { products: { name: string; unit_of_measure: string } | null })[];
      };
    },
    enabled: !!id,
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sales_invoices').update({
        status: 'paid', amount_paid: invoice!.total, paid_at: new Date().toISOString(),
      }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); toast.success(t('invoiceDetail.paidSuccess')); },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendInvoice = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sales_invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoice', id] }); toast.success(t('invoiceDetail.sent')); },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleWhatsApp() {
    const customer = invoice?.customers;
    const msg = encodeURIComponent(`Bonjour ${customer?.name || ''}, veuillez trouver ci-joint la facture N° ${invoice?.invoice_number} d'un montant de ${formatCurrency(invoice?.total || 0)}. Cordialement, ${tenant?.name}.`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  function handlePrint() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="p-6 dark:bg-surface-0">
        <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-8 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-32 mb-8" />
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 dark:bg-surface-0 text-center">
        <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <h3 className="text-gray-700 dark:text-gray-300 font-medium">{t('invoiceDetail.notFound')}</h3>
        <Link to="/app/sales-invoices" className="text-[#0057D9] text-sm hover:underline mt-2 inline-block">{t('invoiceDetail.backToInvoices')}</Link>
      </div>
    );
  }

  const statusMap: Record<string, { variant: 'gray' | 'info' | 'success' | 'danger'; label: string }> = {
    draft: { variant: 'gray', label: t('invoiceDetail.statusDraft') },
    sent: { variant: 'info', label: t('invoiceDetail.statusSent') },
    paid: { variant: 'success', label: t('invoiceDetail.statusPaid') },
    overdue: { variant: 'danger', label: t('invoiceDetail.statusOverdue') },
    cancelled: { variant: 'gray', label: t('invoiceDetail.statusCancelled') },
  };
  const st = statusMap[invoice.status] || { variant: 'gray' as const, label: invoice.status };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> {t('invoiceDetail.back')}
        </button>
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <button onClick={() => sendInvoice.mutate()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700">
              {t('invoiceDetail.markSent')}
            </button>
          )}
          {['draft','sent'].includes(invoice.status) && (
            <button onClick={() => markPaid.mutate()} className="flex items-center gap-2 px-4 py-2 bg-[#0057D9] text-white text-sm rounded-xl hover:bg-[#003F9E]">
              <CheckCircle className="w-4 h-4" /> {t('invoiceDetail.markPaid')}
            </button>
          )}
          <button onClick={handleWhatsApp} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-xl hover:bg-green-600">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-xl hover:bg-gray-50">
            <Printer className="w-4 h-4" /> {t('invoiceDetail.print')}
          </button>
        </div>
      </div>

      {/* Invoice document */}
      <div id="invoice-print" className="bg-white rounded-2xl border border-gray-100 p-8 print:rounded-none print:border-0 print:shadow-none">
        {/* Company header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            {tenant?.logo_url && (
              <img src={tenant.logo_url} alt="Logo" className="h-16 object-contain mb-3" />
            )}
            <h1 className="text-2xl font-bold text-[#0F2A3D]">{tenant?.name}</h1>
            {tenant?.legal_nif && <p className="text-sm text-gray-500">NIF: {tenant.legal_nif}</p>}
            {tenant?.legal_rccm && <p className="text-sm text-gray-500">RCCM: {tenant.legal_rccm}</p>}
            {tenant?.legal_regime && <p className="text-sm text-gray-500">Régime: {tenant.legal_regime}</p>}
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 mb-2">
              <h2 className="text-3xl font-medium text-[#0F2A3D]">{t('invoiceDetail.invoiceTitle')}</h2>
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>
            <p className="text-xl font-mono font-semibold text-[#0057D9]">{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 mt-1">{t('invoiceDetail.invoiceDate')}: {format(new Date(invoice.invoice_date), 'dd/MM/yyyy')}</p>
            {invoice.due_date && (
              <p className="text-sm text-gray-500">{t('invoiceDetail.dueDate')}: {format(new Date(invoice.due_date), 'dd/MM/yyyy')}</p>
            )}
          </div>
        </div>

        {/* Bill to */}
        {invoice.customers && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('invoiceDetail.billTo')}</h3>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="font-semibold text-gray-900">{invoice.customers.name}</p>
              {invoice.customers.tax_id && <p className="text-sm text-gray-500">NIF: {invoice.customers.tax_id}</p>}
              {invoice.customers.address && <p className="text-sm text-gray-500">{invoice.customers.address}</p>}
              {invoice.customers.city && <p className="text-sm text-gray-500">{invoice.customers.city}</p>}
              {invoice.customers.email && <p className="text-sm text-gray-500">{invoice.customers.email}</p>}
              {invoice.customers.phone && <p className="text-sm text-gray-500">{invoice.customers.phone}</p>}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[#0F2A3D]">
                <th className="text-left py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colDescription')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colQty')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colUnitPrice')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colDiscount')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colVat')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colTotalHt')}</th>
                <th className="text-right py-2 text-sm font-semibold text-[#0F2A3D]">{t('invoiceDetail.colTotalTtc')}</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.sales_invoice_items || []).map(item => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-3 text-sm text-gray-900">
                    {item.description}
                    {item.products && <span className="text-xs text-gray-400 ml-1">({item.products.unit_of_measure})</span>}
                  </td>
                  <td className="py-3 text-sm text-right text-gray-700">{item.quantity}</td>
                  <td className="py-3 text-sm text-right text-gray-700">{formatCurrency(item.unit_price)}</td>
                  <td className="py-3 text-sm text-right text-gray-700">{item.discount_pct}%</td>
                  <td className="py-3 text-sm text-right text-gray-700">{item.vat_rate}%</td>
                  <td className="py-3 text-sm text-right text-gray-700">{formatCurrency(item.subtotal)}</td>
                  <td className="py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals + stamp */}
        <div className="flex justify-between items-end">
          <div className="max-w-xs">
            {invoice.notes && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('invoiceDetail.notes')}</p>
                <p className="text-sm text-gray-600">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('invoiceDetail.terms')}</p>
                <p className="text-sm text-gray-600">{invoice.terms}</p>
              </div>
            )}
            {(tenant?.bank_details as Record<string, string>)?.iban && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{t('invoiceDetail.bankDetails')}</p>
                <p className="text-sm text-gray-600">IBAN: {(tenant?.bank_details as Record<string, string>).iban}</p>
              </div>
            )}
          </div>

          <div className="space-y-2 min-w-[220px]">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('invoiceDetail.subtotalHt')}</span>
              <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('invoiceDetail.discount')}</span>
                <span className="font-medium text-red-600">-{formatCurrency(invoice.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{t('invoiceDetail.vatLabel')}</span>
              <span className="font-medium">{formatCurrency(invoice.vat_amount)}</span>
            </div>
            <div className="flex justify-between font-medium text-lg border-t-2 border-[#0F2A3D] pt-2">
              <span className="text-[#0F2A3D]">{t('invoiceDetail.totalTtc')}</span>
              <span className="text-[#0057D9]">{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('invoiceDetail.paid')}</span>
                  <span className="font-medium text-green-600">{formatCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>{t('invoiceDetail.balanceDue')}</span>
                  <span className={invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'}>
                    {formatCurrency(invoice.balance_due)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Official stamp */}
        {tenant?.cachet_url && (
          <div className="mt-8 flex justify-end">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">{t('invoiceDetail.officialStamp')}</p>
              <img src={tenant.cachet_url} alt="Cachet" className="h-24 object-contain" />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          {tenant?.name} · {tenant?.legal_nif ? `NIF: ${tenant.legal_nif} · ` : ''}{tenant?.city || ''} · {tenant?.phone_prefix}
        </div>
      </div>
    </div>
  );
}
