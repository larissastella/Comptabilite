import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, Users, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const INVITE_STORAGE_KEY = 'pending_invite_token';

export default function AcceptInvitePage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invitation_preview', { p_token: token });
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('INVITE_NOT_FOUND');
      return data[0] as { tenant_name: string; role: string; email: string; status: string; expires_at: string };
    },
    enabled: !!token,
    retry: false,
  });

  const acceptInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('accept_tenant_invitation', { p_token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      localStorage.removeItem(INVITE_STORAGE_KEY);
      setAccepted(true);
      toast.success(t('invite.welcome'));
      setTimeout(() => navigate('/app/dashboard'), 1200);
    },
    onError: (err: Error) => {
      const map: Record<string, string> = {
        INVITE_NOT_FOUND: t('invite.errNotFound'),
        INVITE_ALREADY_USED: t('invite.errAlreadyUsed'),
        INVITE_EXPIRED: t('invite.errExpired'),
        SEAT_LIMIT_REACHED: t('invite.errSeatLimit'),
      };
      const key = Object.keys(map).find(k => err.message.includes(k));
      toast.error(key ? map[key] : err.message);
    },
  });

  // Not logged in: stash the token and send them to sign up/log in first.
  if (!user) {
    localStorage.setItem(INVITE_STORAGE_KEY, token || '');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-2 mb-8">
        <BookOpen className="w-7 h-7 text-[#0057D9]" />
        <span className="text-xl font-medium text-gray-900">Li<span className="text-[#0057D9]">Books</span></span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm w-full max-w-md p-6 sm:p-8 text-center">
        {isLoading ? (
          <div className="py-8">
            <Loader2 className="w-8 h-8 text-gray-300 animate-spin mx-auto" />
          </div>
        ) : error || !preview ? (
          <div className="py-4">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">{t('invite.notFound')}</h1>
            <p className="text-sm text-gray-500 mb-6">{t('invite.notFoundDesc')}</p>
            <Link to="/" className="text-sm text-[#0057D9] font-medium hover:underline">{t('invite.backHome')}</Link>
          </div>
        ) : accepted ? (
          <div className="py-4">
            <CheckCircle className="w-12 h-12 text-[#0057D9] mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">{t('invite.accepted')}</h1>
            <p className="text-sm text-gray-500">{t('invite.redirecting')}</p>
          </div>
        ) : preview.status !== 'pending' ? (
          <div className="py-4">
            <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">{t('invite.alreadyUsed')}</h1>
            <p className="text-sm text-gray-500">{t('invite.alreadyUsedDesc')}</p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 bg-[#0057D9]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-[#0057D9]" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">{t('invite.joinTitle')} {preview.tenant_name}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {t('invite.invitedTo')} <strong>{preview.tenant_name}</strong> {t('invite.withRole')} <strong>{preview.role}</strong>.
            </p>

            {!user ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-2">{t('invite.needAccount')} <strong>{preview.email}</strong> {t('invite.toAccept')}</p>
                <Link to="/signup" className="block w-full px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold hover:bg-[#003F9E]">
                  {t('invite.createAccount')}
                </Link>
                <Link to="/login" className="block w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  {t('invite.alreadyHaveAccount')}
                </Link>
              </div>
            ) : user.email?.toLowerCase() !== preview.email.toLowerCase() ? (
              <div className="py-2">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t('invite.emailMismatch')} <strong>{preview.email}</strong>, {t('invite.butConnected')} <strong>{user.email}</strong>. {t('invite.switchAccount')}
                </p>
              </div>
            ) : (
              <button
                onClick={() => acceptInvite.mutate()}
                disabled={acceptInvite.isPending}
                className="w-full px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold hover:bg-[#003F9E] disabled:opacity-60"
              >
                {acceptInvite.isPending ? t('invite.joining') : t('invite.joinTeam')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { INVITE_STORAGE_KEY };
