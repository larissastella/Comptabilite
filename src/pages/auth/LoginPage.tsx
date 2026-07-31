import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Mail, Lock, Eye, EyeOff, Globe, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/app/dashboard');
    } catch (err: unknown) {
      let message: string;
      if (err instanceof Error) {
        if (err.message === 'EMAIL_NOT_CONFIRMED') {
          message = t('auth.emailNotConfirmed');
        } else if (err.message === 'Invalid login credentials') {
          message = t('auth.invalidCredentials');
        } else {
          message = err.message;
        }
      } else {
        message = t('auth.loginError');
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2A3D] to-[#1a3f5c] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 text-white">
        <Link to="/" className="flex items-center gap-2.5">
          <BookOpen className="w-8 h-8 text-[#0057D9]" />
          <span className="text-2xl font-medium">Li<span className="text-[#0057D9]">Books</span></span>
        </Link>

        <div>
          <h2 className="text-4xl font-medium mb-4 leading-tight">
            La comptabilité africaine,<br />
            <span className="text-[#0057D9]">réinventée.</span>
          </h2>
          <p className="text-slate-300 text-lg leading-relaxed">
            Facturation, stock, POS — offline-first, mobile-first,
            pensé pour les entrepreneurs africains.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            {[
              { label: 'Pays supportés', value: '54+' },
              { label: 'Devises africaines', value: '15+' },
              { label: 'Offline-first', value: '100%' },
              { label: 'Plan comptable OHADA', value: 'Inclus' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-4">
                <p className="text-2xl font-medium text-[#0057D9]">{stat.value}</p>
                <p className="text-slate-300 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-400 text-sm">© {new Date().getFullYear()} LiBooks. Tous droits réservés.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-surface-0 relative">
        {/* Back to home — visible on all screens */}
        <Link
          to="/"
          className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backToHome')}
        </Link>

        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden justify-center">
            <BookOpen className="w-7 h-7 text-[#0057D9]" />
            <span className="text-xl font-medium text-[#0F2A3D] dark:text-white">Li<span className="text-[#0057D9]">Books</span></span>
          </Link>

          <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('auth.login')}</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('auth.loginSubtitle')}</p>
              </div>
              <button
                onClick={() => i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <Globe className="w-4 h-4" />
                {i18n.language === 'fr' ? 'EN' : 'FR'}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('auth.email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent transition"
                    placeholder="nom@entreprise.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('auth.password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent transition"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm text-[#0057D9] hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#0057D9] hover:bg-[#003F9E] text-white font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Connexion...' : t('auth.login')}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              {t('auth.noAccount')}{' '}
              <Link to="/signup" className="text-[#0057D9] font-medium hover:underline">
                {t('auth.signup')}
              </Link>
            </p>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
              Un produit <span className="font-semibold text-gray-500 dark:text-gray-400">LiAfrik</span> — Dubaï & Yaoundé
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
