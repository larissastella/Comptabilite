import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Building2, BookOpen, Package, Warehouse, FileText,
  ShoppingCart, ArrowLeftRight, BookMarked, BarChart3, CreditCard,
  Smartphone, Bot, FileSpreadsheet, Settings, Users, Shield,
  LogOut, X, ChevronDown, ChevronRight, Globe, Lock, Landmark, Boxes, Receipt, Plus, Truck,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { PLAN_LIMITS, getCountryByCode } from '../../lib/countryData';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.png';

interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  module?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  collapsed?: boolean;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { signOut, isSuperAdmin, staffInfo } = useAuth();
  const { tenant, isTrialActive, availableCompanies, switchCompany, canAddCompany, refreshTenant } = useTenant();
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [showAddCompany, setShowAddCompany] = useState(false);
  const navigate = useNavigate();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const plan = tenant?.plan || 'starter';
  const allowed = PLAN_LIMITS[plan] || [];
  const isOhadaCountry = tenant?.country ? getCountryByCode(tenant.country)?.isOhada ?? true : true;

  // Super admins and internal staff never pay for a plan and always have
  // full platform access — matches the DB-level bypass in RLS.
  const isAllowed = (mod: string) => !mod || isSuperAdmin || staffInfo.isStaff || isTrialActive || allowed.includes(mod as never);

  // Super admins and internal staff without a tenant see a simplified nav
  const isPlatformUser = isSuperAdmin || staffInfo.isStaff;
  const hasTenant = !!tenant;

  const groups: NavGroup[] = isPlatformUser && !hasTenant
    ? [
        {
          label: 'Plateforme',
          items: isSuperAdmin
            ? [{ key: 'super-admin', label: 'Super Admin', icon: Shield, to: '/app/super-admin' }]
            : [],
        },
      ]
    : [
        {
          label: t('nav.accounting'),
          items: [
            { key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, to: '/app/dashboard', module: 'dashboard' },
            { key: 'companies', label: t('nav.companies'), icon: Building2, to: '/app/companies', module: 'companies' },
            { key: 'chart-of-accounts', label: t('nav.chartOfAccounts'), icon: BookOpen, to: '/app/chart-of-accounts', module: 'chart_of_accounts' },
            { key: 'inventory', label: t('nav.inventory'), icon: Package, to: '/app/inventory', module: 'inventory' },
            { key: 'warehouses', label: t('nav.warehouses'), icon: Warehouse, to: '/app/warehouses', module: 'warehouses' },
            { key: 'customers', label: t('nav.customers'), icon: Users, to: '/app/customers', module: 'customers' },
            { key: 'suppliers', label: t('nav.suppliers'), icon: Truck, to: '/app/suppliers', module: 'suppliers' },
            { key: 'sales-invoices', label: t('nav.salesInvoices'), icon: FileText, to: '/app/sales-invoices', module: 'sales_invoices' },
            { key: 'purchase-invoices', label: t('nav.purchaseInvoices'), icon: ShoppingCart, to: '/app/purchase-invoices', module: 'purchase_invoices' },
            { key: 'transactions', label: t('nav.transactions'), icon: ArrowLeftRight, to: '/app/transactions', module: 'transactions' },
            { key: 'ledger', label: t('nav.ledger'), icon: BookMarked, to: '/app/ledger', module: 'ledger' },
            { key: 'credit-notes', label: 'Notes de crédit', icon: Receipt, to: '/app/credit-notes', module: 'credit_notes' },
            { key: 'reports', label: t('nav.reports'), icon: BarChart3, to: '/app/reports', module: 'reports' },
          ],
        },
        {
          label: t('nav.premium'),
          items: [
            { key: 'banking', label: t('nav.banking'), icon: CreditCard, to: '/app/banking', module: 'banking' },
            { key: 'bank-reconciliation', label: 'Rapprochement bancaire', icon: Landmark, to: '/app/bank-reconciliation', module: 'bank_reconciliation' },
            { key: 'fixed-assets', label: 'Immobilisations', icon: Boxes, to: '/app/fixed-assets', module: 'fixed_assets' },
            { key: 'whatsapp', label: t('nav.whatsapp'), icon: Smartphone, to: '/app/whatsapp', module: 'whatsapp' },
            { key: 'ai-cashflow', label: t('nav.aiCashflow'), icon: Bot, to: '/app/ai-cashflow', module: 'ai_cashflow' },
            ...(isOhadaCountry ? [{ key: 'ohada', label: t('nav.ohada'), icon: FileSpreadsheet, to: '/app/ohada', module: 'ohada' }] : []),
          ],
        },
        {
          label: t('nav.administration'),
          items: [
            { key: 'billing', label: t('nav.billing'), icon: CreditCard, to: '/app/billing', module: 'billing' },
            { key: 'settings', label: t('nav.settings'), icon: Settings, to: '/app/settings', module: 'settings' },
            { key: 'users', label: t('nav.users'), icon: Users, to: '/app/users', module: 'users' },
            ...(isSuperAdmin ? [{ key: 'super-admin', label: t('nav.superAdmin'), icon: Shield, to: '/app/super-admin' }] : []),
          ],
        },
      ];

  function toggleGroup(label: string) {
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
      isActive
        ? 'bg-[#0057D9] text-white shadow-sm'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-64 z-40 flex flex-col
        bg-[#0F2A3D] transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <NavLink to="/app/dashboard" className="flex items-center gap-2.5">
            <img src={logo} alt="LiBooks" className="w-7 h-7 flex-shrink-0" />
            <div className="flex items-baseline gap-0.5">
              <span className="text-white font-bold text-[17px] leading-none">Li</span>
              <span className="text-[#0057D9] font-medium text-[17px] leading-none">Books</span>
            </div>
          </NavLink>
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Company switcher (multi-company, Enterprise) */}
        {tenant && availableCompanies.length > 1 ? (
          <div className="px-5 py-3 border-b border-white/10 relative">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{t('common.appName')}</p>
            <button
              onClick={() => setCompanyMenuOpen(!companyMenuOpen)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="text-white text-sm font-medium truncate block">{tenant.name}</span>
                <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                  tenant.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                  tenant.plan === 'premium' ? 'bg-yellow-500/20 text-yellow-300' :
                  tenant.plan === 'pro' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-slate-500/20 text-slate-300'
                }`}>
                  {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${companyMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {companyMenuOpen && (
              <div className="absolute left-5 right-5 mt-2 bg-surface-1 border border-white/10 rounded-xl shadow-lg z-50 overflow-hidden">
                {availableCompanies.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setCompanyMenuOpen(false); if (c.id !== tenant.id) switchCompany(c.id); }}
                    className={`w-full text-left px-3 py-2.5 text-sm truncate hover:bg-white/5 flex items-center justify-between ${c.id === tenant.id ? 'text-[#0057D9] font-medium' : 'text-slate-200'}`}
                  >
                    {c.name}
                    {c.id === tenant.id && <span className="text-xs">✓</span>}
                  </button>
                ))}
                {canAddCompany && (
                  <button
                    onClick={() => { setCompanyMenuOpen(false); setShowAddCompany(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm text-[#0057D9] hover:bg-white/5 border-t border-white/10 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Ajouter une société
                  </button>
                )}
              </div>
            )}
          </div>
        ) : tenant ? (
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">{t('common.appName')}</p>
            <p className="text-white text-sm font-medium truncate">{tenant.name}</p>
            <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium ${
              tenant.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
              tenant.plan === 'premium' ? 'bg-yellow-500/20 text-yellow-300' :
              tenant.plan === 'pro' ? 'bg-blue-500/20 text-blue-300' :
              'bg-slate-500/20 text-slate-300'
            }`}>
              {tenant.plan.charAt(0).toUpperCase() + tenant.plan.slice(1)}
            </span>
            {canAddCompany && (
              <button onClick={() => setShowAddCompany(true)} className="mt-2 flex items-center gap-1.5 text-xs text-[#0057D9] hover:underline">
                <Plus className="w-3.5 h-3.5" /> Ajouter une société
              </button>
            )}
          </div>
        ) : isPlatformUser ? (
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Plateforme</p>
            <p className="text-white text-sm font-medium truncate">LiAfrik</p>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300">
              {isSuperAdmin ? 'Super Admin' : staffInfo.roleName || 'Staff'}
            </span>
          </div>
        ) : null}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {groups.map(group => (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center justify-between w-full px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span>{group.label}</span>
                {collapsedGroups[group.label]
                  ? <ChevronRight className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />
                }
              </button>

              {!collapsedGroups[group.label] && (
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const locked = item.module && !isAllowed(item.module);
                    if (locked) {
                      return (
                        <div
                          key={item.key}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 cursor-not-allowed opacity-50"
                        >
                          <item.icon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                          <Lock className="w-3.5 h-3.5 ml-auto" />
                        </div>
                      );
                    }
                    return (
                      <NavLink key={item.key} to={item.to} className={navLinkClass} onClick={onClose}>
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-3">
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <Globe className="w-4 h-4" />
            <span>{i18n.language === 'fr' ? 'English' : 'Français'}</span>
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
      {showAddCompany && <AddCompanyModal onClose={() => setShowAddCompany(false)} onCreated={refreshTenant} />}
    </>
  );
}

function AddCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('CM');
  const [currency, setCurrency] = useState('XAF');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { toast.error('Le nom de la société est requis'); return; }
    setCreating(true);
    try {
      const { error } = await supabase.rpc('create_additional_company', {
        p_name: name, p_country: country, p_currency: currency,
      });
      if (error) {
        if (error.message.includes('MULTI_COMPANY_REQUIRES_ENTERPRISE')) {
          throw new Error('Le multi-société nécessite le forfait Enterprise');
        }
        throw error;
      }
      toast.success('Société créée');
      onCreated();
      onClose();
      window.location.href = '/app/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-1">Ajouter une société</h3>
        <p className="text-sm text-gray-500 mb-4">Chaque société a sa propre comptabilité, totalement séparée des autres.</p>
        <div className="space-y-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de la société" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Pays (ex: CM)" className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
            <input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="Devise (ex: XAF)" className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm">Annuler</button>
            <button onClick={handleCreate} disabled={creating} className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60">
              {creating ? 'Création...' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
