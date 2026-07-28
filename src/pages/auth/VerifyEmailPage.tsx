import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { resendConfirmation } = useAuth();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email || '';
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    if (!email) return;
    setLoading(true);
    try {
      await resendConfirmation(email);
      toast.success(t('auth.confirmationResent'));
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
          <BookOpen className="w-8 h-8 text-[#10B981]" />
          <span className="text-2xl font-bold text-white">Li<span className="text-[#10B981]">Books</span></span>
        </Link>

        <div className="bg-white dark:bg-surface-1 rounded-2xl shadow-xl p-6 sm:p-8 text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-[#10B981]" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('auth.verifyEmail')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {t('auth.verifyEmailDesc', { email: email || 'votre email' })}
          </p>

          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={loading || !email}
              className="w-full py-3 bg-[#10B981] hover:bg-[#0d9e6e] text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {loading ? 'Envoi...' : t('auth.resendConfirmation')}
            </button>

            <Link
              to="/login"
              className="block w-full py-3 border border-gray-300 dark:border-surface-3 dark:hover:bg-surface-2 dark:text-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl transition-colors text-sm"
            >
              {t('auth.backToLogin')}
            </Link>
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-left">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Tip:</strong> Une fois votre email confirmé, vous pourrez vous connecter et configurer votre entreprise.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
