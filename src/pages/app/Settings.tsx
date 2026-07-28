import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Building2, Scale, CreditCard, Shield, Globe, ChevronRight, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { AuditLog } from '../../types';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import ImageUploader from '../../components/ui/ImageUploader';
import TwoFactorSettings from '../../components/ui/TwoFactorSettings';

type SettingsTab = 'company' | 'legal' | 'banking' | 'taxes' | 'security' | 'language';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { tenant, refreshTenant } = useTenant();
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [form, setForm] = useState({
    name: '', vat_rate: 0, legal_rccm: '', legal_nif: '', legal_regime: '',
    bank_iban: '', bank_name: '', bank_swift: '', bank_account: '',
    invoice_prefix: 'FAC',
    logo_url: '', cachet_url: '',
  });

  useEffect(() => {
    if (tenant) {
      const bd = (tenant.bank_details as Record<string, string>) || {};
      setForm({
        name: tenant.name,
        vat_rate: tenant.vat_rate,
        legal_rccm: tenant.legal_rccm || '',
        legal_nif: tenant.legal_nif || '',
        legal_regime: tenant.legal_regime || '',
        bank_iban: bd.iban || '',
        bank_name: bd.bank_name || '',
        bank_swift: bd.swift || '',
        bank_account: bd.account || '',
        invoice_prefix: tenant.invoice_prefix,
        logo_url: tenant.logo_url || '',
        cachet_url: tenant.cachet_url || '',
      });
    }
  }, [tenant]);

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('audit_logs').select('*').eq('tenant_id', tenant!.id).order('created_at', { ascending: false }).limit(50);
      return (data || []) as AuditLog[];
    },
    enabled: !!tenant?.id && activeTab === 'security',
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        vat_rate: form.vat_rate,
        legal_rccm: form.legal_rccm,
        legal_nif: form.legal_nif,
        legal_regime: form.legal_regime,
        invoice_prefix: form.invoice_prefix,
        bank_details: {
          iban: form.bank_iban,
          bank_name: form.bank_name,
          swift: form.bank_swift,
          account: form.bank_account,
        },
        logo_url: form.logo_url || null,
        cachet_url: form.cachet_url || null,
      };
      const { error } = await supabase.from('tenants').update(payload).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => { refreshTenant(); toast.success('Paramètres enregistrés'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveLogo = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.from('tenants').update({ logo_url: url || null }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => { refreshTenant(); toast.success('Logo enregistré'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveCachet = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase.from('tenants').update({ cachet_url: url || null }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => { refreshTenant(); toast.success('Cachet enregistré'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const tabs: { key: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'company', label: t('settings.company'), icon: Building2 },
    { key: 'legal', label: t('settings.legal'), icon: Scale },
    { key: 'banking', label: t('settings.banking'), icon: CreditCard },
    { key: 'taxes', label: t('settings.taxes'), icon: SettingsIcon },
    { key: 'security', label: t('settings.security'), icon: Shield },
    { key: 'language', label: t('settings.language'), icon: Globe },
  ];

  return (
    <div className="p-4 sm:p-6 dark:bg-surface-0">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('settings.title')}</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar — horizontal on mobile, vertical on desktop */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 overflow-hidden flex lg:flex-col gap-1 lg:gap-0 overflow-x-auto p-2 lg:p-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center justify-between w-full px-4 py-3.5 text-sm transition-colors border-b border-gray-50 dark:border-surface-2 last:border-0 whitespace-nowrap flex-shrink-0 lg:flex-shrink ${
                  activeTab === tab.key ? 'bg-[#10B981]/10 dark:bg-[#10B981]/20 text-[#10B981] font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center gap-3">
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-40 hidden lg:block" />
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-6">
            {(activeTab === 'company' || activeTab === 'legal' || activeTab === 'banking' || activeTab === 'taxes') && (
              <div className="space-y-5">
                {activeTab === 'company' && (
                  <>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.companyInfo')}</h2>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'entreprise</label>
                      <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Préfixe des factures</label>
                      <input value={form.invoice_prefix} onChange={e => setForm(p => ({ ...p, invoice_prefix: e.target.value }))}
                        className="w-full max-w-32 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                      <p className="text-xs text-gray-400 mt-1">Ex: FAC-2026-00001</p>
                    </div>

                    {tenant && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ImageUploader
                          tenantId={tenant.id}
                          kind="logo"
                          label="Logo de l'entreprise"
                          description="PNG, JPG ou SVG — max 2 MB"
                          currentUrl={tenant.logo_url || undefined}
                          onUploaded={url => { setForm(p => ({ ...p, logo_url: url })); saveLogo.mutate(url); }}
                        />
                        <ImageUploader
                          tenantId={tenant.id}
                          kind="cachet"
                          label="Cachet / Tampon"
                          description="PNG transparent recommandé"
                          currentUrl={tenant.cachet_url || undefined}
                          onUploaded={url => { setForm(p => ({ ...p, cachet_url: url })); saveCachet.mutate(url); }}
                        />
                      </div>
                    )}

                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-blue-700"><strong>Devise:</strong> {tenant?.currency} — <span className="text-blue-500">Immuable</span></p>
                      <p className="text-xs text-blue-500 mt-1">La devise est verrouillée lors de la création du compte.</p>
                    </div>
                  </>
                )}

                {activeTab === 'legal' && (
                  <>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.legal')}</h2>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NIF / Numéro d'identification fiscale</label>
                      <input value={form.legal_nif} onChange={e => setForm(p => ({ ...p, legal_nif: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RCCM</label>
                      <input value={form.legal_rccm} onChange={e => setForm(p => ({ ...p, legal_rccm: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Régime fiscal</label>
                      <select value={form.legal_regime} onChange={e => setForm(p => ({ ...p, legal_regime: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]">
                        <option value="">Sélectionner</option>
                        <option value="rsi">RSI — Régime Simplifié d'Imposition</option>
                        <option value="reel">Réel — Régime du Réel</option>
                        <option value="forfait">Forfaitaire</option>
                        <option value="micro">Micro-entreprise</option>
                      </select>
                    </div>
                  </>
                )}

                {activeTab === 'banking' && (
                  <>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.banking')}</h2>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Banque</label>
                      <input value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" placeholder="Afriland First Bank" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de compte</label>
                      <input value={form.bank_account} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                      <input value={form.bank_iban} onChange={e => setForm(p => ({ ...p, bank_iban: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" placeholder="CM21..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Code SWIFT/BIC</label>
                      <input value={form.bank_swift} onChange={e => setForm(p => ({ ...p, bank_swift: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                    </div>
                  </>
                )}

                {activeTab === 'taxes' && (
                  <>
                    <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.taxes')}</h2>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Taux de TVA par défaut (%)</label>
                      <input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => setForm(p => ({ ...p, vat_rate: parseFloat(e.target.value) || 0 }))}
                        className="w-full max-w-32 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
                      <p className="text-xs text-gray-400 mt-1">Ce taux s'applique par défaut aux nouvelles factures et produits.</p>
                    </div>
                  </>
                )}

                <button onClick={() => save.mutate()} disabled={save.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#10B981] hover:bg-[#0d9e6e] text-white font-semibold rounded-xl text-sm disabled:opacity-60 mt-4">
                  <Save className="w-4 h-4" />
                  {save.isPending ? 'Enregistrement...' : t('common.save')}
                </button>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-8">
                <TwoFactorSettings />

                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.auditLogs')}</h2>
                  {auditLogs.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Aucun journal d'audit disponible</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between py-2.5 border-b border-gray-50">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            log.action === 'create' ? 'bg-green-100 text-green-700' :
                            log.action === 'update' ? 'bg-blue-100 text-blue-700' :
                            log.action === 'delete' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {log.action[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm text-gray-900">{log.action} · {log.module}</p>
                            <p className="text-xs text-gray-400">{log.record_id}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</p>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>
            )}

            {activeTab === 'language' && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-gray-900 mb-4">{t('settings.language')}</h2>
                <div className="flex gap-3">
                  {[
                    { code: 'fr', label: 'Français', flag: '🇫🇷' },
                    { code: 'en', label: 'English', flag: '🇬🇧' },
                  ].map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className={`flex items-center gap-3 px-5 py-4 rounded-xl border-2 transition-all ${i18n.language === lang.code ? 'border-[#10B981] bg-[#10B981]/5' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <span className="text-2xl">{lang.flag}</span>
                      <span className={`font-medium text-sm ${i18n.language === lang.code ? 'text-[#10B981]' : 'text-gray-700'}`}>{lang.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">La langue s'applique à toute l'interface, aux emails et aux PDF générés.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
