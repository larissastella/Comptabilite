import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPasswordForEmail(email);
      setSent(true);
      toast.success(t('auth.resetEmailSent'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.loginError');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2A3D] to-[#1a3f5c] flex items-center justify-center p-6 relative">
      <Link
        to="/"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('auth.backToHome')}
      </Link>

      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <BookOpen className="w-8 h-8 text-[#0057D9]" />
          <span className="text-2xl font-bold text-white">Li<span className="text-[#0057D9]">Books</span></span>
        </Link>

        <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-[#0057D9]" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('auth.checkYourEmail')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {t('auth.resetEmailSent')} <strong>{email}</strong>
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.forgotPassword')}</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  Saisissez votre email pour recevoir un lien de réinitialisation.
                </p>
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#0057D9] hover:bg-[#003F9E] text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
                >
                  {loading ? 'Envoi...' : t('auth.sendResetLink')}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
                <Link to="/login" className="text-[#0057D9] font-medium hover:underline">
                  {t('auth.backToLogin')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
