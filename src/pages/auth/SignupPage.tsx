import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';
import logo from '../../assets/logo.png';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!email) errs.email = t('auth.emailRequired');
    if (password.length < 8) errs.password = t('auth.passwordMin');
    if (password !== confirmPassword) errs.confirmPassword = t('auth.passwordMatch');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) {
        toast.success(t('auth.signupSuccess'));
        navigate('/verify-email', { state: { email } });
      } else {
        toast.success(t('auth.signupSuccessNoConfirm'));
        navigate('/onboarding');
      }
    } catch (err: unknown) {
      let message: string;
      if (err instanceof Error) {
        if (err.message === 'EMAIL_EXISTS') {
          message = t('auth.emailExists');
        } else {
          message = err.message;
        }
      } else {
        message = t('auth.signupError');
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const features = [
    'Facturation SYSCOHADA automatique',
    'Gestion de stock multi-magasin',
    'POS offline-first',
    '54 pays africains supportés',
    'Exports PDF/WhatsApp',
    '7 jours d\'essai gratuit, sans CB',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2A3D] to-[#1a3f5c] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 text-white">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="LiBooks" className="w-8 h-8 text-[#0057D9]" />
          <span className="text-2xl font-bold">Li</span><span className="text-[#0057D9] text-2xl font-medium">Books</span>
        </Link>

        <div>
          <div className="inline-block bg-[#0057D9]/20 text-[#0057D9] text-sm font-medium px-4 py-1.5 rounded-full mb-4">
            {t('auth.trialBadge')}
          </div>
          <h2 className="text-4xl font-medium mb-4 leading-tight">
            Commencez gratuitement,<br />
            <span className="text-[#0057D9]">sans carte bancaire.</span>
          </h2>
          <p className="text-slate-300 mb-8">
            Accès complet pendant 7 jours. Aucune configuration complexe.
          </p>

          <div className="space-y-3">
            {features.map(f => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#0057D9] flex-shrink-0" />
                <span className="text-slate-200 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-400 text-sm">© {new Date().getFullYear()} LiBooks. Tous droits réservés.</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-surface-0 relative">
        <Link
          to="/"
          className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('auth.backToHome')}
        </Link>

        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden justify-center">
            <img src={logo} alt="LiBooks" className="w-7 h-7 text-[#0057D9]" />
            <span className="text-xl text-[#0F2A3D] dark:text-white font-bold">Li</span><span className="text-[#0057D9] text-xl text-[#0F2A3D] dark:text-white font-medium">Books</span>
          </Link>

          <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.signup')}</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('auth.signupSubtitle')}</p>
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
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent transition dark:bg-surface-2 dark:text-white ${errors.email ? 'border-red-300' : 'border-gray-300 dark:border-surface-3'}`}
                    placeholder="nom@entreprise.com"
                  />
                </div>
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('auth.password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`w-full pl-10 pr-12 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent transition dark:bg-surface-2 dark:text-white ${errors.password ? 'border-red-300' : 'border-gray-300 dark:border-surface-3'}`}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('auth.confirmPassword')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9] focus:border-transparent transition dark:bg-surface-2 dark:text-white ${errors.confirmPassword ? 'border-red-300' : 'border-gray-300 dark:border-surface-3'}`}
                    placeholder="••••••••"
                  />
                </div>
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#0057D9] hover:bg-[#003F9E] text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {loading ? 'Création du compte...' : 'Créer mon compte gratuit'}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
              En vous inscrivant, vous acceptez nos{' '}
              <Link to="/terms" className="text-[#0057D9] hover:underline">CGU</Link>{' '}
              et notre{' '}
              <Link to="/privacy" className="text-[#0057D9] hover:underline">politique de confidentialité</Link>.
            </p>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              {t('auth.hasAccount')}{' '}
              <Link to="/login" className="text-[#0057D9] font-medium hover:underline">
                {t('auth.login')}
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
