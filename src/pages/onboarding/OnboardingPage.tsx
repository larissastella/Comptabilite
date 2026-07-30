import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle, ChevronRight, ChevronLeft, ArrowLeft, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { COUNTRIES, getCountryByCode, COMMON_CURRENCIES, COMMON_TIMEZONES } from '../../lib/countryData';
import { uploadTenantAsset, validateImageFile } from '../../lib/upload';
import toast from 'react-hot-toast';

type Plan = 'starter' | 'pro' | 'premium' | 'enterprise';

interface OnboardingData {
  companyName: string;
  country: string;
  region: string;
  regionCustom: string;
  city: string;
  cityCustom: string;
  currency: string;
  currencyCustom: string;
  timezone: string;
  timezoneCustom: string;
  phonePrefix: string;
  phonePrefixCustom: string;
  vatRate: number;
  plan: Plan;
  billing: 'monthly' | 'annual';
  sector: string;
  logoUrl: string;
  cachetUrl: string;
  logoFile: File | null;
  cachetFile: File | null;
  staffCode: string;
}

const OTHER = '__other__';

const PLANS = [
  { id: 'starter' as Plan, name: 'Starter', price: 9, desc: 'Indépendants & TPE', features: ['Facturation', 'Stock de base', 'Clients & Fournisseurs', 'Rapports essentiels'] },
  { id: 'pro' as Plan, name: 'Pro', price: 19, desc: 'PME en croissance', features: ['Tout Starter', 'Banque & Mobile Money', 'WhatsApp', 'Multi-magasin'], popular: true },
  { id: 'premium' as Plan, name: 'Premium', price: 69, desc: 'Entreprises structurées', features: ['Tout Pro', 'IA Trésorerie', 'OHADA complet', 'OCR & Paie'] },
  { id: 'enterprise' as Plan, name: 'Entreprise', price: 189, desc: 'Grands groupes', features: ['Tout Premium', 'Multi-société', 'API & intégrations', 'Support dédié'] },
];

const SECTORS = [
  'Commerce & Distribution', 'Restauration & Hôtellerie', 'Services & Conseil',
  'Construction & BTP', 'Agriculture & Agroalimentaire', 'Transport & Logistique',
  'Santé & Pharmacie', 'Education & Formation', 'Technologie & Digital',
  'Industrie & Manufacture', 'Immobilier', 'Autre',
];

const STEPS = 6;

function BrandingUploader({ label, description, file, url, onFile, onUrl }: {
  label: string;
  description: string;
  file: File | null;
  url: string;
  onFile: (f: File | null) => void;
  onUrl: (u: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(url);

  function pick() { inputRef.current?.click(); }

  async function handleFile(f: File) {
    const err = validateImageFile(f);
    if (err) { toast.error(err); return; }
    onFile(f);
    setPreview(URL.createObjectURL(f));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className="border-2 border-dashed border-gray-200 dark:border-surface-3 rounded-xl p-4 hover:border-[#0057D9] transition-colors cursor-pointer"
        onClick={pick}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-100 dark:bg-surface-2 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
            {preview ? (
              <img src={preview} alt={label} className="w-full h-full object-contain" />
            ) : (
              <Upload className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {file ? file.name : preview ? 'Remplacer' : 'Choisir un fichier'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
      </div>
      <details className="mt-2">
        <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">Ou entrez une URL directement</summary>
        <input
          type="url"
          value={url}
          onChange={e => { onUrl(e.target.value); setPreview(e.target.value); }}
          className="w-full mt-2 px-3 py-2 border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
          placeholder="https://..."
        />
      </details>
    </div>
  );
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    country: '',
    region: '',
    regionCustom: '',
    city: '',
    cityCustom: '',
    currency: 'XAF',
    currencyCustom: '',
    timezone: 'Africa/Douala',
    timezoneCustom: '',
    phonePrefix: '+237',
    phonePrefixCustom: '',
    vatRate: 19.25,
    plan: 'starter',
    billing: 'monthly',
    sector: '',
    logoUrl: '',
    cachetUrl: '',
    logoFile: null,
    cachetFile: null,
    staffCode: '',
  });

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function selectCountry(code: string) {
    const info = getCountryByCode(code);
    if (!info) return;
    setData(prev => ({
      ...prev,
      country: code,
      region: '',
      city: '',
      currency: info.currency,
      timezone: info.timezone,
      phonePrefix: info.phonePrefix,
      vatRate: info.vatRate,
    }));
  }

  const countryInfo = getCountryByCode(data.country);
  const regions = countryInfo?.regions ? Object.keys(countryInfo.regions) : [];
  const cities = data.region && countryInfo?.regions?.[data.region] ? countryInfo.regions[data.region] : [];

  const effectiveRegion = data.region === OTHER ? data.regionCustom : data.region;
  const effectiveCity = data.city === OTHER ? data.cityCustom : data.city;
  const effectiveCurrency = data.currency === OTHER ? data.currencyCustom : data.currency;
  const effectiveTimezone = data.timezone === OTHER ? data.timezoneCustom : data.timezone;
  const effectivePhonePrefix = data.phonePrefix === OTHER ? data.phonePrefixCustom : data.phonePrefix;

  function canNext() {
    if (step === 1) return !!data.companyName && !!data.country;
    if (step === 2) {
      if (data.region === OTHER && !data.regionCustom.trim()) return false;
      if (data.city === OTHER && !data.cityCustom.trim()) return false;
      if (data.currency === OTHER && !data.currencyCustom.trim()) return false;
      if (data.timezone === OTHER && !data.timezoneCustom.trim()) return false;
      if (data.phonePrefix === OTHER && !data.phonePrefixCustom.trim()) return false;
      return true;
    }
    if (step === 3) return !!data.plan;
    if (step === 4) return !!data.sector;
    return true;
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const { data: tenantId, error: rpcError } = await supabase.rpc('create_tenant_with_owner', {
        p_name: data.companyName,
        p_country: data.country,
        p_region: effectiveRegion || null,
        p_city: effectiveCity || null,
        p_currency: effectiveCurrency || data.currency,
        p_timezone: effectiveTimezone || data.timezone,
        p_phone_prefix: effectivePhonePrefix || data.phonePrefix,
        p_vat_rate: data.vatRate,
        p_plan: data.plan,
        p_sector: data.sector,
        p_logo_url: data.logoUrl || null,
        p_cachet_url: data.cachetUrl || null,
        p_invoice_prefix: 'FAC',
        p_referred_by_staff_code: data.staffCode.trim() || null,
      });

      if (rpcError) throw rpcError;

      // Seed default warehouse
      await supabase.from('warehouses').insert({
        tenant_id: tenantId as string,
        name: 'Entrepôt principal',
        is_default: true,
      });

      // Seed SYSCOHADA accounts if OHADA country
      if (countryInfo?.isOhada) {
        await seedSyscohadaAccounts(tenantId as string);
      }

      // Upload logo and cachet if provided
      let logoUrl = data.logoUrl;
      let cachetUrl = data.cachetUrl;
      if (data.logoFile) {
        try {
          const r = await uploadTenantAsset(tenantId as string, 'logo', data.logoFile);
          logoUrl = r.url;
        } catch { /* non-fatal */ }
      }
      if (data.cachetFile) {
        try {
          const r = await uploadTenantAsset(tenantId as string, 'cachet', data.cachetFile);
          cachetUrl = r.url;
        } catch { /* non-fatal */ }
      }
      if (logoUrl || cachetUrl) {
        await supabase.from('tenants').update({ logo_url: logoUrl || null, cachet_url: cachetUrl || null }).eq('id', tenantId as string);
      }

      toast.success('Compte créé avec succès !');
      navigate('/app/dashboard');
      window.location.reload();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function seedSyscohadaAccounts(tenantId: string) {
    const accounts = [
      // Classe 1 — Comptes de ressources durables
      { code: '101', name: 'Capital social', name_en: 'Share capital', account_class: 1, account_type: 'equity' },
      { code: '106', name: 'Réserves', name_en: 'Reserves', account_class: 1, account_type: 'equity' },
      { code: '121', name: 'Résultat net — Bénéfice', name_en: 'Net income — Profit', account_class: 1, account_type: 'equity' },
      { code: '129', name: 'Résultat net — Perte', name_en: 'Net income — Loss', account_class: 1, account_type: 'equity' },
      { code: '161', name: 'Emprunts', name_en: 'Loans', account_class: 1, account_type: 'liability' },
      // Classe 2 — Comptes d'actif immobilisé
      { code: '211', name: 'Terrains', name_en: 'Land', account_class: 2, account_type: 'asset' },
      { code: '221', name: 'Bâtiments', name_en: 'Buildings', account_class: 2, account_type: 'asset' },
      { code: '231', name: 'Matériel et outillage', name_en: 'Equipment & tools', account_class: 2, account_type: 'asset' },
      { code: '241', name: 'Matériel de transport', name_en: 'Transport equipment', account_class: 2, account_type: 'asset' },
      { code: '244', name: 'Matériel informatique', name_en: 'Computer equipment', account_class: 2, account_type: 'asset' },
      { code: '281', name: 'Amort. bâtiments', name_en: 'Depreciation — buildings', account_class: 2, account_type: 'asset' },
      // Classe 3 — Comptes de stocks
      { code: '31', name: 'Marchandises', name_en: 'Merchandise', account_class: 3, account_type: 'asset' },
      { code: '32', name: 'Matières premières et consommables', name_en: 'Raw materials', account_class: 3, account_type: 'asset' },
      { code: '37', name: 'Stock de produits finis', name_en: 'Finished goods', account_class: 3, account_type: 'asset' },
      // Classe 4 — Comptes de tiers
      { code: '401', name: 'Fournisseurs', name_en: 'Suppliers', account_class: 4, account_type: 'liability' },
      { code: '411', name: 'Clients', name_en: 'Customers', account_class: 4, account_type: 'asset' },
      { code: '421', name: 'Personnel — Rémunérations dues', name_en: 'Staff payroll', account_class: 4, account_type: 'liability' },
      { code: '441', name: 'État — Impôts et taxes', name_en: 'Tax authorities', account_class: 4, account_type: 'liability' },
      { code: '4431', name: 'TVA facturée', name_en: 'Output VAT', account_class: 4, account_type: 'liability' },
      { code: '4432', name: 'TVA récupérable', name_en: 'Input VAT', account_class: 4, account_type: 'asset' },
      { code: '4611', name: 'Associés — Comptes courants', name_en: 'Shareholders accounts', account_class: 4, account_type: 'liability' },
      // Classe 5 — Comptes de trésorerie
      { code: '521', name: 'Banques', name_en: 'Banks', account_class: 5, account_type: 'asset' },
      { code: '5711', name: 'Caisse siège', name_en: 'Head office cash', account_class: 5, account_type: 'asset' },
      { code: '585', name: 'Mobile Money', name_en: 'Mobile Money', account_class: 5, account_type: 'asset' },
      // Classe 6 — Comptes de charges
      { code: '601', name: 'Achats de marchandises', name_en: 'Merchandise purchases', account_class: 6, account_type: 'expense' },
      { code: '602', name: 'Achats de matières premières', name_en: 'Raw material purchases', account_class: 6, account_type: 'expense' },
      { code: '604', name: 'Achats de prestation de services', name_en: 'Service purchases', account_class: 6, account_type: 'expense' },
      { code: '621', name: 'Frais de transport', name_en: 'Transport costs', account_class: 6, account_type: 'expense' },
      { code: '622', name: 'Frais de communication', name_en: 'Communication costs', account_class: 6, account_type: 'expense' },
      { code: '631', name: 'Rémunérations du personnel', name_en: 'Staff salaries', account_class: 6, account_type: 'expense' },
      { code: '641', name: 'Impôts et taxes', name_en: 'Taxes & duties', account_class: 6, account_type: 'expense' },
      { code: '661', name: 'Intérêts des emprunts', name_en: 'Loan interest', account_class: 6, account_type: 'expense' },
      { code: '681', name: 'Dotations aux amortissements', name_en: 'Depreciation charges', account_class: 6, account_type: 'expense' },
      // Classe 7 — Comptes de produits
      { code: '701', name: 'Ventes de marchandises', name_en: 'Merchandise sales', account_class: 7, account_type: 'revenue' },
      { code: '702', name: 'Ventes de produits finis', name_en: 'Finished goods sales', account_class: 7, account_type: 'revenue' },
      { code: '706', name: 'Prestations de services', name_en: 'Services revenue', account_class: 7, account_type: 'revenue' },
      { code: '707', name: 'Rabais, remises et ristournes accordés', name_en: 'Sales discounts', account_class: 7, account_type: 'revenue' },
      { code: '761', name: 'Revenus des participations', name_en: 'Investment income', account_class: 7, account_type: 'revenue' },
    ];

    await supabase.from('accounts').insert(
      accounts.map(a => ({ ...a, tenant_id: tenantId, is_system: true }))
    );
  }

  const stepTitles = [
    'Votre entreprise',
    'Localisation & Devise',
    'Votre forfait',
    'Secteur d\'activité',
    'Votre marque',
    'Récapitulatif',
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-0 flex flex-col">
      {/* Header */}
      <header className="bg-[#0F2A3D] px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <BookOpen className="w-7 h-7 text-[#0057D9] flex-shrink-0" />
          <span className="text-white font-medium">Li<span className="text-[#0057D9]">Books</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('auth.backToHome')}</span>
          </Link>
          <span className="text-slate-300 text-sm">{t('onboarding.step', { current: step, total: STEPS })}</span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-surface-3">
        <div
          className="h-full bg-[#0057D9] transition-all duration-500"
          style={{ width: `${(step / STEPS) * 100}%` }}
        />
      </div>

      <div className="flex-1 flex items-start justify-center py-6 sm:py-10 px-4">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 mb-2">
              <span>Étape {step}/{STEPS}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-[#0057D9] font-medium">{stepTitles[step - 1]}</span>
            </div>
            <h2 className="text-2xl font-medium text-gray-900 dark:text-white">{stepTitles[step - 1]}</h2>
          </div>

          <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-sm border border-gray-100 dark:border-surface-3 p-5 sm:p-8">
            {/* Step 1: Company name + country */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t('onboarding.companyName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={data.companyName}
                    onChange={e => set('companyName', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent"
                    placeholder="SARL MonEntreprise"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t('onboarding.country')} <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {COUNTRIES.map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => selectCountry(c.code)}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                          data.country === c.code
                            ? 'border-[#0057D9] bg-[#0057D9]/10 text-[#0057D9]'
                            : 'border-gray-200 dark:border-surface-3 dark:text-gray-300 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <span className="text-xs font-medium truncate w-full">{c.nameFr}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{c.currency}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Code commercial <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={data.staffCode}
                    onChange={e => set('staffCode', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent"
                    placeholder="Si vous avez été référé par un commercial LiBooks"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Laissez vide si vous n'avez pas de code.</p>
                </div>
              </div>
            )}

            {/* Step 2: Region, city, currency */}
            {step === 2 && (
              <div className="space-y-6">
                {/* Region */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('onboarding.region')}</label>
                  {regions.length > 0 ? (
                    <>
                      <select
                        value={data.region}
                        onChange={e => { set('region', e.target.value); set('city', ''); set('regionCustom', ''); }}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      >
                        <option value="">{t('onboarding.selectRegion')}</option>
                        {regions.map(r => <option key={r} value={r}>{r}</option>)}
                        <option value={OTHER}>Autre — précisez</option>
                      </select>
                      {data.region === OTHER && (
                        <input
                          type="text"
                          value={data.regionCustom}
                          onChange={e => set('regionCustom', e.target.value)}
                          className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                          placeholder="Saisissez votre région"
                        />
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={data.regionCustom}
                      onChange={e => { set('regionCustom', e.target.value); set('region', OTHER); }}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      placeholder="Saisissez votre région"
                    />
                  )}
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('onboarding.city')}</label>
                  {cities.length > 0 ? (
                    <>
                      <select
                        value={data.city}
                        onChange={e => { set('city', e.target.value); set('cityCustom', ''); }}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      >
                        <option value="">{t('onboarding.selectCity')}</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value={OTHER}>Autre — précisez</option>
                      </select>
                      {data.city === OTHER && (
                        <input
                          type="text"
                          value={data.cityCustom}
                          onChange={e => set('cityCustom', e.target.value)}
                          className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                          placeholder="Saisissez votre ville"
                        />
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={data.cityCustom}
                      onChange={e => { set('cityCustom', e.target.value); set('city', OTHER); }}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      placeholder="Saisissez votre ville"
                    />
                  )}
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Devise</label>
                  <select
                    value={data.currency}
                    onChange={e => { set('currency', e.target.value); set('currencyCustom', ''); }}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                  >
                    {COMMON_CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                    <option value={OTHER}>Autre — précisez</option>
                  </select>
                  {data.currency === OTHER && (
                    <input
                      type="text"
                      value={data.currencyCustom}
                      onChange={e => set('currencyCustom', e.target.value)}
                      className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      placeholder="Code devise (ex: CHF)"
                    />
                  )}
                </div>

                {/* Phone prefix */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Préfixe téléphonique</label>
                  <input
                    type="text"
                    value={data.phonePrefix === OTHER ? data.phonePrefixCustom : data.phonePrefix}
                    onChange={e => {
                      const val = e.target.value;
                      const countryInfo2 = getCountryByCode(data.country);
                      if (countryInfo2 && countryInfo2.phonePrefix === val) {
                        set('phonePrefix', val);
                        set('phonePrefixCustom', '');
                      } else {
                        set('phonePrefix', OTHER);
                        set('phonePrefixCustom', val);
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                    placeholder="+xxx"
                  />
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Fuseau horaire</label>
                  <select
                    value={data.timezone}
                    onChange={e => { set('timezone', e.target.value); set('timezoneCustom', ''); }}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                    <option value={OTHER}>Autre — précisez</option>
                  </select>
                  {data.timezone === OTHER && (
                    <input
                      type="text"
                      value={data.timezoneCustom}
                      onChange={e => set('timezoneCustom', e.target.value)}
                      className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                      placeholder="ex: Africa/Porto-Novo"
                    />
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-surface-2 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuration</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Devise</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{effectiveCurrency || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Préfixe tel.</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{effectivePhonePrefix || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Fuseau horaire</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{effectiveTimezone || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">TVA par défaut</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{data.vatRate}%</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Taux de TVA (%)</label>
                  <input
                    type="number"
                    value={data.vatRate}
                    onChange={e => set('vatRate', parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Plan */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Mensuel</span>
                  <button
                    type="button"
                    onClick={() => set('billing', data.billing === 'monthly' ? 'annual' : 'monthly')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${data.billing === 'annual' ? 'bg-[#0057D9]' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${data.billing === 'annual' ? 'translate-x-6' : ''}`} />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Annuel</span>
                  <span className="text-xs bg-[#0057D9]/10 text-[#0057D9] px-2 py-0.5 rounded-full font-medium">-20%</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLANS.map(plan => {
                    const price = data.billing === 'annual' ? Math.round(plan.price * 0.8) : plan.price;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => set('plan', plan.id)}
                        className={`relative flex flex-col items-start p-5 rounded-xl border-2 text-left transition-all ${
                          data.plan === plan.id
                            ? 'border-[#0057D9] bg-[#0057D9]/5'
                            : 'border-gray-200 dark:border-surface-3 dark:hover:border-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {plan.popular && (
                          <span className="absolute -top-2.5 left-4 text-xs bg-[#0057D9] text-white px-2 py-0.5 rounded-full">Populaire</span>
                        )}
                        {data.plan === plan.id && (
                          <CheckCircle className="absolute top-3 right-3 w-5 h-5 text-[#0057D9]" />
                        )}
                        <span className="text-base font-medium text-gray-900 dark:text-white">{plan.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 mb-2">{plan.desc}</span>
                        <span className="text-2xl font-medium text-[#0F2A3D] dark:text-white">${price}<span className="text-sm font-normal text-gray-400 dark:text-gray-500">/mois</span></span>
                        <ul className="mt-3 space-y-1">
                          {plan.features.map(f => (
                            <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                              <CheckCircle className="w-3.5 h-3.5 text-[#0057D9]" />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs text-[#0057D9] font-medium">7 jours d'essai gratuit</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: Sector */}
            {step === 4 && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Sélectionnez le secteur d'activité de votre entreprise</p>
                <div className="grid grid-cols-2 gap-2">
                  {SECTORS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('sector', s)}
                      className={`px-4 py-3 rounded-xl border text-sm text-left transition-all ${
                        data.sector === s
                          ? 'border-[#0057D9] bg-[#0057D9]/10 text-[#0057D9] font-medium'
                          : 'border-gray-200 dark:border-surface-3 dark:text-gray-300 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Branding */}
            {step === 5 && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Votre logo et cachet apparaîtront automatiquement sur toutes vos factures, devis et reçus.
                </p>

                <BrandingUploader
                  label="Logo de l'entreprise"
                  description="PNG, JPG ou SVG — max 2 MB"
                  file={data.logoFile}
                  url={data.logoUrl}
                  onFile={f => set('logoFile', f)}
                  onUrl={u => set('logoUrl', u)}
                />

                <BrandingUploader
                  label="Cachet / Tampon officiel"
                  description="PNG transparent recommandé — max 2 MB"
                  file={data.cachetFile}
                  url={data.cachetUrl}
                  onFile={f => set('cachetFile', f)}
                  onUrl={u => set('cachetUrl', u)}
                />

                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Ces éléments peuvent être modifiés plus tard dans Paramètres → Entreprise.
                </p>
              </div>
            )}

            {/* Step 6: Summary */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="bg-[#0057D9]/5 border border-[#0057D9]/20 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Récapitulatif</h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Entreprise', value: data.companyName },
                      { label: 'Pays', value: getCountryByCode(data.country)?.nameFr || data.country },
                      { label: 'Région', value: effectiveRegion || '-' },
                      { label: 'Ville', value: effectiveCity || '-' },
                      { label: 'Devise', value: effectiveCurrency || data.currency },
                      { label: 'TVA', value: `${data.vatRate}%` },
                      { label: 'Forfait', value: `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} (${data.billing === 'annual' ? 'annuel' : 'mensuel'})` },
                      { label: 'Secteur', value: data.sector },
                      { label: 'Code commercial', value: data.staffCode || '—' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">{item.label}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-amber-500 text-lg">🎁</span>
                  <p className="text-sm text-amber-800">
                    <strong>7 jours d'essai gratuit</strong> — aucune carte bancaire requise.
                    Vous passerez en mode lecture seule à la fin de l'essai.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-surface-3 dark:text-gray-300 dark:hover:bg-surface-2 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common.back')}
            </button>

            {step < STEPS ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
              >
                {t('common.next')}
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white rounded-xl disabled:opacity-60 text-sm font-semibold transition-colors"
              >
                {loading ? 'Création...' : 'Créer mon entreprise'}
                {!loading && <CheckCircle className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
