import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BookOpen, Users, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const INVITE_STORAGE_KEY = 'pending_invite_token';

export default function AcceptInvitePage() {
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
      toast.success('Bienvenue dans l\'équipe !');
      setTimeout(() => navigate('/app/dashboard'), 1200);
    },
    onError: (err: Error) => {
      const map: Record<string, string> = {
        INVITE_NOT_FOUND: "Cette invitation n'existe pas.",
        INVITE_ALREADY_USED: 'Cette invitation a déjà été utilisée ou annulée.',
        INVITE_EXPIRED: 'Cette invitation a expiré. Demande à un administrateur de t\'en envoyer une nouvelle.',
        SEAT_LIMIT_REACHED: "L'entreprise a atteint la limite d'utilisateurs de son forfait.",
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
        <BookOpen className="w-7 h-7 text-[#10B981]" />
        <span className="text-xl font-bold text-gray-900">Comptabilite</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm w-full max-w-md p-6 sm:p-8 text-center">
        {isLoading ? (
          <div className="py-8">
            <Loader2 className="w-8 h-8 text-gray-300 animate-spin mx-auto" />
          </div>
        ) : error || !preview ? (
          <div className="py-4">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">Invitation introuvable</h1>
            <p className="text-sm text-gray-500 mb-6">Ce lien d'invitation n'est plus valide.</p>
            <Link to="/" className="text-sm text-[#10B981] font-medium hover:underline">Retour à l'accueil</Link>
          </div>
        ) : accepted ? (
          <div className="py-4">
            <CheckCircle className="w-12 h-12 text-[#10B981] mx-auto mb-3" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">C'est fait !</h1>
            <p className="text-sm text-gray-500">Redirection vers le tableau de bord...</p>
          </div>
        ) : preview.status !== 'pending' ? (
          <div className="py-4">
            <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-gray-900 mb-2">Invitation déjà traitée</h1>
            <p className="text-sm text-gray-500">Cette invitation a déjà été utilisée ou annulée.</p>
          </div>
        ) : (
          <>
            <div className="w-14 h-14 bg-[#10B981]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-[#10B981]" />
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-1">Rejoindre {preview.tenant_name}</h1>
            <p className="text-sm text-gray-500 mb-6">
              Tu es invité(e) à rejoindre <strong>{preview.tenant_name}</strong> avec le rôle <strong>{preview.role}</strong>.
            </p>

            {!user ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-2">Connecte-toi ou crée un compte avec l'adresse <strong>{preview.email}</strong> pour accepter.</p>
                <Link to="/signup" className="block w-full px-4 py-2.5 bg-[#10B981] text-white rounded-xl text-sm font-semibold hover:bg-[#0d9e6e]">
                  Créer un compte
                </Link>
                <Link to="/login" className="block w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  J'ai déjà un compte
                </Link>
              </div>
            ) : user.email?.toLowerCase() !== preview.email.toLowerCase() ? (
              <div className="py-2">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Cette invitation a été envoyée à <strong>{preview.email}</strong>, mais tu es connecté(e) avec <strong>{user.email}</strong>. Déconnecte-toi et reconnecte-toi avec le bon compte.
                </p>
              </div>
            ) : (
              <button
                onClick={() => acceptInvite.mutate()}
                disabled={acceptInvite.isPending}
                className="w-full px-4 py-2.5 bg-[#10B981] text-white rounded-xl text-sm font-semibold hover:bg-[#0d9e6e] disabled:opacity-60"
              >
                {acceptInvite.isPending ? 'Ajout en cours...' : "Rejoindre l'équipe"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { INVITE_STORAGE_KEY };
