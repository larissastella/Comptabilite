import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Building2, BookOpen, Package, Warehouse, FileText,
  ShoppingCart, ArrowLeftRight, BookMarked, BarChart3, CreditCard,
  Smartphone, Bot, FileSpreadsheet, Settings, Users, Shield,
  LogOut, X, ChevronDown, ChevronRight, Globe, Lock,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { PLAN_LIMITS } from '../../lib/countryData';

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
  const { tenant, isTrialActive } = useTenant();
  const navigate = useNavigate();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const plan = tenant?.plan || 'starter';
  const allowed = PLAN_LIMITS[plan] || [];

  // During an active trial, all premium modules are unlocked.
  const isAllowed = (mod: string) => !mod || isTrialActive || allowed.includes(mod as never);

  // Super admins and internal staff without a tenant see a simplified nav
  const isPlatformUser = isSuperAdmin || staffInfo.isStaff;
  const hasTenant = !!tenant;

  const groups: NavGroup[] = isPlatformUser && !hasTenant
    ? [
        {
          label: 'Plateforme',
          items: [
            { key: 'super-admin', label: 'Super Admin', icon: Shield, to: '/app/super-admin' },
          ],
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
            { key: 'sales-invoices', label: t('nav.salesInvoices'), icon: FileText, to: '/app/sales-invoices', module: 'sales_invoices' },
            { key: 'purchase-invoices', label: t('nav.purchaseInvoices'), icon: ShoppingCart, to: '/app/purchase-invoices', module: 'purchase_invoices' },
            { key: 'transactions', label: t('nav.transactions'), icon: ArrowLeftRight, to: '/app/transactions', module: 'transactions' },
            { key: 'ledger', label: t('nav.ledger'), icon: BookMarked, to: '/app/ledger', module: 'ledger' },
            { key: 'reports', label: t('nav.reports'), icon: BarChart3, to: '/app/reports', module: 'reports' },
          ],
        },
        {
          label: t('nav.premium'),
          items: [
            { key: 'banking', label: t('nav.banking'), icon: CreditCard, to: '/app/banking', module: 'banking' },
            { key: 'whatsapp', label: t('nav.whatsapp'), icon: Smartphone, to: '/app/whatsapp', module: 'whatsapp' },
            { key: 'ai-cashflow', label: t('nav.aiCashflow'), icon: Bot, to: '/app/ai-cashflow', module: 'ai_cashflow' },
            { key: 'ohada', label: t('nav.ohada'), icon: FileSpreadsheet, to: '/app/ohada', module: 'ohada' },
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
        ? 'bg-[#10B981] text-white shadow-sm'
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
            <BookOpen className="w-7 h-7 text-[#10B981] flex-shrink-0" />
            <div className="flex items-baseline gap-0.5">
              <span className="text-white font-bold text-[17px] leading-none">LiAfrik</span>
              <span className="text-[#10B981] font-bold text-[17px] leading-none"> Books</span>
            </div>
          </NavLink>
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tenant name / Platform user badge */}
        {tenant ? (
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
          </div>
        ) : isPlatformUser ? (
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Plateforme</p>
            <p className="text-white text-sm font-medium truncate">LIYAH GROUP</p>
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
    </>
  );
}
