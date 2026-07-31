import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useTenant } from './contexts/TenantContext';
import AppLayout from './components/layout/AppLayout';
import PremiumGate from './components/ui/PremiumGate';
import { INVITE_STORAGE_KEY } from './pages/auth/AcceptInvitePage';

// Every page is loaded on demand (route-based code splitting) instead of
// all being bundled into one giant chunk downloaded on first visit --
// this is the single biggest lever for initial load speed. AppLayout,
// PremiumGate and the INVITE_STORAGE_KEY constant stay eager since
// they're small and needed immediately for routing/layout decisions.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const AcceptInvitePage = lazy(() => import('./pages/auth/AcceptInvitePage'));
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const ChartOfAccounts = lazy(() => import('./pages/app/ChartOfAccounts'));
const Inventory = lazy(() => import('./pages/app/Inventory'));
const Warehouses = lazy(() => import('./pages/app/Warehouses'));
const Customers = lazy(() => import('./pages/app/Customers'));
const Suppliers = lazy(() => import('./pages/app/Suppliers'));
const SalesInvoices = lazy(() => import('./pages/app/SalesInvoices'));
const InvoiceDetail = lazy(() => import('./pages/app/InvoiceDetail'));
const PurchaseInvoices = lazy(() => import('./pages/app/PurchaseInvoices'));
const Transactions = lazy(() => import('./pages/app/Transactions'));
const Reports = lazy(() => import('./pages/app/Reports'));
const Ledger = lazy(() => import('./pages/app/Ledger'));
const BankReconciliation = lazy(() => import('./pages/app/BankReconciliation'));
const CreditNotes = lazy(() => import('./pages/app/CreditNotes'));
const FixedAssets = lazy(() => import('./pages/app/FixedAssets'));
const Settings = lazy(() => import('./pages/app/Settings'));
const UsersRoles = lazy(() => import('./pages/app/UsersRoles'));
const Billing = lazy(() => import('./pages/app/Billing'));
const Banking = lazy(() => import('./pages/app/Banking'));
const WhatsApp = lazy(() => import('./pages/app/WhatsApp'));
const AICashflow = lazy(() => import('./pages/app/AICashflow'));
const Ohada = lazy(() => import('./pages/app/Ohada'));
const SuperAdmin = lazy(() => import('./pages/app/SuperAdmin'));
const PlanSelectionGate = lazy(() => import('./pages/app/PlanSelectionGate'));
const AboutPage = lazy(() => import('./pages/footer/AboutPage'));
const ContactPage = lazy(() => import('./pages/footer/ContactPage'));
const LegalPage = lazy(() => import('./pages/footer/LegalPage'));
const PrivacyPage = lazy(() => import('./pages/footer/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/footer/TermsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#0057D9] border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-500 text-sm">Chargement...</span>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin, staffInfo } = useAuth();
  const { tenant, loading: tenantLoading, isPlanLocked } = useTenant();

  if (loading || tenantLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;

  const isPlatformUser = isSuperAdmin || staffInfo.isStaff;
  if (!tenant && !isPlatformUser) return <Navigate to="/onboarding" replace />;
  if (!tenant && isPlatformUser) {
    const path = window.location.pathname;
    if (path === '/app' || path === '/app/dashboard') {
      return <Navigate to="/app/super-admin" replace />;
    }
  }

  if (isPlanLocked && !isSuperAdmin && !staffInfo.isStaff) {
    const path = window.location.pathname;
    if (path !== '/app/billing') {
      return <PlanSelectionGate />;
    }
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin } = useAuth();
  const { loading: tenantLoading } = useTenant();

  if (loading || tenantLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/app/dashboard" replace />;

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin, staffInfo } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  if (loading || tenantLoading) return <Spinner />;
  if (user && (tenant || isSuperAdmin || staffInfo.isStaff)) return <Navigate to="/app/dashboard" replace />;
  if (user && !tenant) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

function OnboardingRoute() {
  const { user, loading, isSuperAdmin, staffInfo } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  if (loading || tenantLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (tenant || isSuperAdmin || staffInfo.isStaff) return <Navigate to="/app/dashboard" replace />;

  const pendingInvite = localStorage.getItem(INVITE_STORAGE_KEY);
  if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;

  return <OnboardingPage />;
}

function PremiumPlaceholder({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-center gap-4 px-4">
      <span className="text-5xl">{icon}</span>
      <div>
        <p className="text-xl font-medium text-gray-800">{title}</p>
        <p className="text-sm text-gray-500 mt-2 max-w-sm">{desc}</p>
      </div>
      <Link to="/app/billing" className="mt-2 px-6 py-2.5 bg-[#0057D9] text-white text-sm font-semibold rounded-xl hover:bg-[#003F9E] transition-colors">
        Voir les forfaits
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />

        <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="sales-invoices" element={<SalesInvoices />} />
          <Route path="sales-invoices/:id" element={<InvoiceDetail />} />
          <Route path="purchase-invoices" element={<PurchaseInvoices />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="credit-notes" element={<CreditNotes />} />
          <Route path="bank-reconciliation" element={<PremiumGate module="bank_reconciliation"><BankReconciliation /></PremiumGate>} />
          <Route path="fixed-assets" element={<PremiumGate module="fixed_assets"><FixedAssets /></PremiumGate>} />
          <Route path="companies" element={<PremiumPlaceholder icon="🏢" title="Multi-société" desc="Gérez plusieurs sociétés depuis un seul compte. Disponible en forfait Entreprise." />} />
          <Route path="banking" element={<PremiumGate module="banking"><Banking /></PremiumGate>} />
          <Route path="whatsapp" element={<PremiumGate module="whatsapp"><WhatsApp /></PremiumGate>} />
          <Route path="ai-cashflow" element={<PremiumGate module="ai_cashflow"><AICashflow /></PremiumGate>} />
          <Route path="ohada" element={<PremiumGate module="ohada"><Ohada /></PremiumGate>} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<UsersRoles />} />
          <Route path="billing" element={<Billing />} />
          <Route path="super-admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
