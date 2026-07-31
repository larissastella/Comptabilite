import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, BookOpen, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-surface-0 dark:via-surface-1 dark:to-surface-2 px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <BookOpen className="w-8 h-8 text-[#0057D9]" />
          <div className="flex items-baseline gap-0.5">
            <span className="text-slate-800 dark:text-white font-medium text-xl leading-none">LiBooks</span>
            <span className="text-[#0057D9] font-medium text-xl leading-none"> Books</span>
          </div>
        </div>

        <p className="text-[7rem] sm:text-[9rem] font-medium leading-none tracking-tight bg-gradient-to-br from-[#0057D9] to-emerald-700 bg-clip-text text-transparent">
          404
        </p>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-4">
          {t('common.pageNotFound', 'Page introuvable')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto">
          {t('common.pageNotFoundDesc', "La page que vous recherchez n'existe pas ou a été déplacée.")}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mt-8 justify-center">
          <Link
            to="/"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Home className="w-4 h-4" />
            {t('common.backHome', 'Accueil')}
          </Link>
          <Link
            to="/app/dashboard"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-surface-1 border border-gray-200 dark:border-surface-3 dark:text-gray-300 dark:hover:border-gray-600 hover:border-gray-300 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('nav.dashboard', 'Tableau de bord')}
          </Link>
        </div>
      </div>
    </div>
  );
}
