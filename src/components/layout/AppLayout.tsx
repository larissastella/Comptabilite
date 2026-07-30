import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Menu, WifiOff, RefreshCw } from 'lucide-react';
import Sidebar from './Sidebar';
import TrialBanner from '../ui/TrialBanner';
import ThemeToggle from '../ui/ThemeToggle';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { getPendingCount } from '../../lib/db';
import { useTranslation } from 'react-i18next';
import ChatWidget from '../ui/ChatWidget';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const { isReadOnly, tenant } = useTenant();
  const { isSuperAdmin } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-surface-0 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-64 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 sm:px-6 h-14 bg-white dark:bg-surface-1 border-b border-gray-200 dark:border-surface-3 flex-shrink-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex-1" />

          {/* Offline indicator */}
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-full">
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                {pendingCount > 0
                  ? t('common.pendingSync', { count: pendingCount })
                  : t('common.offline')
                }
              </span>
            </div>
          )}

          {isOnline && pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-full">
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{t('common.syncing')}</span>
            </div>
          )}

          <ThemeToggle variant="subtle" />
        </header>

        {/* Trial / expired banner — hidden for super admins */}
        {tenant && !isSuperAdmin && <TrialBanner />}

        {/* Read-only banner — hidden for super admins */}
        {isReadOnly && tenant && !isSuperAdmin && (
          <div className="px-4 sm:px-6 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 flex items-center justify-between">
            <span className="text-sm text-red-800 dark:text-red-300">{t('billing.readOnlyWarning')}</span>
            <a href="/app/billing" className="text-sm font-medium text-red-900 dark:text-red-200 underline">
              {t('billing.upgrade')}
            </a>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
