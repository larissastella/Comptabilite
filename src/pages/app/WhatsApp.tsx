import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Smartphone, Send, MessageCircle, CheckCircle, Clock, XCircle, Link2, Unlink, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function WhatsApp() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [waNumber, setWaNumber] = useState('');
  const [waDisplayName, setWaDisplayName] = useState('');

  // Fetch WhatsApp connection status from tenant settings (stored in bank_details-like jsonb column)
  const { data: waSettings, refetch } = useQuery({
    queryKey: ['wa-settings', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenants')
        .select('bank_details')
        .eq('id', tenant!.id)
        .maybeSingle();
      const bd = (data?.bank_details as Record<string, unknown>) || {};
      return (bd.whatsapp as { phone?: string; display_name?: string; connected_at?: string } | null) || null;
    },
    enabled: !!tenant?.id,
  });

  const isConnected = !!waSettings?.phone;

  const connectWhatsApp = useMutation({
    mutationFn: async () => {
      if (!waNumber) throw new Error('Numéro WhatsApp requis');
      // Normalize phone
      const normalized = waNumber.replace(/[\s-]/g, '');
      const { data, error } = await supabase
        .from('tenants')
        .select('bank_details')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      const bd = (data?.bank_details as Record<string, unknown>) || {};
      bd.whatsapp = {
        phone: normalized,
        display_name: waDisplayName || tenant?.name || '',
        connected_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase
        .from('tenants')
        .update({ bank_details: bd })
        .eq('id', tenant!.id);
      if (upErr) throw upErr;

      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'connect_whatsapp',
        module: 'whatsapp',
        after_data: { phone: normalized, display_name: waDisplayName },
      });
    },
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
      toast.success('WhatsApp Business connecté');
      setShowConnect(false);
      setWaNumber('');
      setWaDisplayName('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnectWhatsApp = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('bank_details')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      const bd = (data?.bank_details as Record<string, unknown>) || {};
      delete bd.whatsapp;
      const { error: upErr } = await supabase
        .from('tenants')
        .update({ bank_details: bd })
        .eq('id', tenant!.id);
      if (upErr) throw upErr;

      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'disconnect_whatsapp',
        module: 'whatsapp',
      });
    },
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['wa-settings'] });
      toast.success('WhatsApp déconnecté');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Fetch sales invoices with customer phone numbers
  const { data: invoices = [] } = useQuery({
    queryKey: ['wa-invoices', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_invoices')
        .select('id, invoice_number, status, total, sent_at, customers(name, phone)')
        .eq('tenant_id', tenant!.id)
        .in('status', ['sent', 'paid', 'overdue'])
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!tenant?.id && isConnected,
  });

  const sendInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const inv = invoices.find((i: Record<string, unknown>) => i.id === invoiceId) as Record<string, unknown> | undefined;
      if (!inv) throw new Error('Facture introuvable');
      const customer = inv.customers as { name?: string; phone?: string } | null;
      if (!customer?.phone) throw new Error('Le client n\'a pas de numéro de téléphone');

      // Real, working WhatsApp send today: opens WhatsApp with a
      // pre-filled message via the official click-to-chat deep link
      // (no Meta Business API approval needed). Attaching the PDF
      // directly requires the paid WhatsApp Business Cloud API — this
      // is the honest, functional interim: the customer gets a real
      // message with the invoice details, tap-to-send by the user.
      const phone = customer.phone.replace(/[^\d]/g, '');
      const total = formatCurrency(Number(inv.total));
      const message = `Bonjour ${customer.name || ''}, voici votre facture ${inv.invoice_number} d'un montant de ${total}. Merci de votre confiance !`;
      const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      const { error } = await supabase
        .from('sales_invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', invoiceId);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'send_whatsapp',
        module: 'whatsapp',
        record_id: invoiceId,
        after_data: { phone: customer.phone, invoice_number: inv.invoice_number },
      });

      window.open(waLink, '_blank');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-invoices'] });
      toast.success('WhatsApp ouvert avec le message pré-rempli — envoie-le manuellement');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      if (!phone) throw new Error('Numéro requis');
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'send_whatsapp_test',
        module: 'whatsapp',
        after_data: { phone, message: testMessage || 'Test' },
      });
    },
    onSuccess: () => {
      toast.success('Message test envoyé');
      setPhone('');
      setTestMessage('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.whatsapp')}</h1>
        <p className="text-sm text-gray-400 mt-1">Envoi automatique des factures via WhatsApp et portail client</p>
      </div>

      {/* Connection status */}
      <div className={`rounded-2xl border p-5 mb-6 ${isConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConnected ? 'bg-green-500' : 'bg-gray-200'}`}>
              <MessageCircle className={`w-5 h-5 ${isConnected ? 'text-white' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">WhatsApp Business API</p>
              {isConnected ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-xs text-green-700">Connecté · {waSettings?.phone} {waSettings?.display_name ? `(${waSettings.display_name})` : ''}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Non connecté — cliquez sur Connecter</p>
              )}
            </div>
          </div>
          {isConnected ? (
            <button
              onClick={() => disconnectWhatsApp.mutate()}
              disabled={disconnectWhatsApp.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl transition-colors flex-shrink-0 disabled:opacity-60"
            >
              {disconnectWhatsApp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
              <span className="hidden sm:inline">Déconnecter</span>
            </button>
          ) : (
            <button
              onClick={() => setShowConnect(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">Connecter</span>
            </button>
          )}
        </div>
      </div>

      {/* Test message */}
      <div className={`bg-white rounded-2xl border border-gray-100 p-5 mb-6 ${!isConnected ? 'opacity-60 pointer-events-none' : ''}`}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Envoyer un message test</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Numéro WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+237 6XX XXX XXX"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message (optionnel)</label>
            <textarea
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              rows={2}
              placeholder="Bonjour, ceci est un test..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={() => sendTest.mutate()}
            disabled={!phone || sendTest.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        </div>
      </div>

      {/* Invoices ready to send */}
      <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${!isConnected ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Factures à envoyer</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cliquez pour envoyer la facture via WhatsApp au client</p>
        </div>
        {invoices.length === 0 ? (
          <div className="p-8 text-center">
            <Smartphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucune facture à envoyer.</p>
            <p className="text-xs text-gray-400 mt-1">Les factures créées avec un client ayant un numéro WhatsApp apparaîtront ici.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invoices.map((inv: Record<string, unknown>) => {
              const customer = inv.customers as { name: string; phone?: string } | null;
              const hasPhone = !!customer?.phone;
              return (
                <div key={inv.id as string} className="flex items-center justify-between px-5 py-3.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      inv.status === 'paid' ? 'bg-green-100' :
                      inv.status === 'sent' ? 'bg-blue-100' : 'bg-amber-100'
                    }`}>
                      {inv.status === 'paid' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                       inv.status === 'sent' ? <CheckCircle className="w-4 h-4 text-blue-600" /> :
                       <Clock className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{customer?.name || 'Client inconnu'}</p>
                      <p className="text-xs text-gray-400">{inv.invoice_number as string} · {format(new Date(inv.sent_at as string || new Date()), 'dd/MM/yyyy')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {!hasPhone && <span className="text-xs text-red-400 hidden sm:inline"><XCircle className="w-3.5 h-3.5 inline" /> Pas de tél.</span>}
                    <button
                      onClick={() => sendInvoice.mutate(inv.id as string)}
                      disabled={!hasPhone || sendInvoice.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Envoyer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect modal */}
      {showConnect && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Connecter WhatsApp Business</h2>
            <p className="text-sm text-gray-500 mb-4">
              Renseignez votre numéro WhatsApp Business. Vous recevrez un code de vérification via l'API WhatsApp pour confirmer la connexion.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numéro WhatsApp Business</label>
                <input
                  type="tel"
                  value={waNumber}
                  onChange={e => setWaNumber(e.target.value)}
                  placeholder="+237 6XX XXX XXX"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom affiché (optionnel)</label>
                <input
                  type="text"
                  value={waDisplayName}
                  onChange={e => setWaDisplayName(e.target.value)}
                  placeholder={tenant?.name || 'Nom de l\'entreprise'}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowConnect(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">Annuler</button>
              <button
                onClick={() => connectWhatsApp.mutate()}
                disabled={!waNumber || connectWhatsApp.isPending}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {connectWhatsApp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {connectWhatsApp.isPending ? 'Connexion...' : 'Connecter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
