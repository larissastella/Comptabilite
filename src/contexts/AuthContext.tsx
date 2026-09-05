import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface StaffInfo {
  isStaff: boolean;
  staffCode?: string;
  roleId?: string;
  roleName?: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isSuperAdmin: boolean;
  staffInfo: StaffInfo;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [staffInfo, setStaffInfo] = useState<StaffInfo>({ isStaff: false });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        checkSuperAdmin(data.session.user.id);
        checkStaff(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        (async () => {
          await checkSuperAdmin(sess.user.id);
          await checkStaff(sess.user.id);
        })();
      } else {
        setIsSuperAdmin(false);
        setStaffInfo({ isStaff: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkSuperAdmin(userId: string) {
    // Self-heals a whitelist/signup-timing gap: someone added to
    // super_admin_emails AFTER their account already existed never gets
    // the grant from the signup trigger alone (see migration 038). This
    // is a no-op for anyone not on the whitelist, and for anyone already
    // granted — safe to call on every login.
    try {
      await supabase.rpc('sync_own_super_admin_status');
    } catch {
      // Non-fatal — worst case the whitelist resync migration/backfill
      // already covered this account, or it'll self-heal next login.
    }
    const { data } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsSuperAdmin(!!data);
  }

  async function checkStaff(userId: string) {
    const { data } = await supabase
      .from('internal_staff_users')
      .select('id, staff_code, role_id, role:internal_staff_roles(name)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (data) {
      const roleData = data.role as unknown as { name: string } | null;
      setStaffInfo({
        isStaff: true,
        staffCode: data.staff_code ?? undefined,
        roleId: (data as Record<string, unknown>).role_id as string | undefined,
        roleName: roleData?.name,
      });
    } else {
      setStaffInfo({ isStaff: false });
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        throw new Error('EMAIL_NOT_CONFIRMED');
      }
      throw error;
    }
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('already been registered') || error.message.toLowerCase().includes('already registered')) {
        throw new Error('EMAIL_EXISTS');
      }
      throw error;
    }
    const needsConfirmation = !data.session && !!data.user;
    return { needsConfirmation };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function resetPasswordForEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isSuperAdmin, staffInfo, signIn, signUp, signOut, resetPasswordForEmail, updatePassword, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
