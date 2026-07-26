import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface MfaFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export default function TwoFactorSettings() {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');

  const { data: factors = [], isLoading } = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return [...data.totp] as MfaFactor[];
    },
  });

  const verifiedFactor = factors.find(f => f.status === 'verified');

  const startEnroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolling(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyEnroll = useMutation({
    mutationFn: async () => {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      toast.success('Authentification à deux facteurs activée');
      setEnrolling(false);
      setCode('');
    },
    onError: () => toast.error('Code invalide, réessayez'),
  });

  const removeFactor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      toast.success('Authentification à deux facteurs désactivée');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Clean up an abandoned unverified enrollment if the user navigates away mid-flow
  useEffect(() => {
    return () => {
      if (enrolling && factorId) {
        supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <div className="text-sm text-gray-400">Chargement...</div>;

  return (
    <div className="border-t border-gray-100 dark:border-surface-3 pt-6 mt-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Authentification à deux facteurs (2FA)</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Ajoutez une couche de sécurité supplémentaire avec une application comme Google Authenticator ou Authy.
      </p>

      {verifiedFactor ? (
        <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-500/10 rounded-xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">2FA activée</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Votre compte est protégé par un code à usage unique</p>
            </div>
          </div>
          <button
            onClick={() => removeFactor.mutate(verifiedFactor.id)}
            disabled={removeFactor.isPending}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:underline"
          >
            <Trash2 className="w-3.5 h-3.5" /> Désactiver
          </button>
        </div>
      ) : !enrolling ? (
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">2FA désactivée</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Recommandé, surtout pour les comptes administrateurs</p>
            </div>
          </div>
          <button
            onClick={() => startEnroll.mutate()}
            disabled={startEnroll.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#10B981] hover:bg-[#0d9e6e] text-white text-xs font-semibold rounded-lg"
          >
            <Smartphone className="w-3.5 h-3.5" /> Activer
          </button>
        </div>
      ) : (
        <div className="p-4 border border-gray-200 dark:border-surface-3 rounded-xl space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            1. Scannez ce QR code avec votre application d'authentification :
          </p>
          {qrCode && (
            <div
              className="w-40 h-40 bg-white p-2 rounded-lg mx-auto"
              dangerouslySetInnerHTML={{ __html: qrCode }}
            />
          )}
          <p className="text-xs text-gray-400 text-center break-all">Ou saisissez la clé manuellement : {secret}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">2. Entrez le code à 6 chiffres généré :</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg tracking-widest text-center"
            />
            <button
              onClick={() => verifyEnroll.mutate()}
              disabled={code.length !== 6 || verifyEnroll.isPending}
              className="px-4 py-2 bg-[#10B981] hover:bg-[#0d9e6e] disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              Valider
            </button>
          </div>
          <button onClick={() => setEnrolling(false)} className="text-xs text-gray-400 hover:underline">Annuler</button>
        </div>
      )}
    </div>
  );
}
