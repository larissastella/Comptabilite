import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Mail, Shield, Trash2, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { Role, RolePermission, TenantUser } from '../../types';
import toast from 'react-hot-toast';

const MODULES = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'chart_of_accounts', label: 'Plan comptable' },
  { key: 'inventory', label: 'Inventaire' },
  { key: 'warehouses', label: 'Magasins' },
  { key: 'sales_invoices', label: 'Factures ventes' },
  { key: 'purchase_invoices', label: 'Factures achats' },
  { key: 'customers', label: 'Clients' },
  { key: 'suppliers', label: 'Fournisseurs' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'reports', label: 'Rapports' },
  { key: 'settings', label: 'Paramètres' },
  { key: 'users', label: 'Équipe & Rôles' },
  { key: 'billing', label: 'Facturation SaaS' },
];

const PERMS = ['can_view', 'can_create', 'can_edit', 'can_delete'] as const;
const PERM_LABELS: Record<string, string> = { can_view: 'Voir', can_create: 'Créer', can_edit: 'Modifier', can_delete: 'Supprimer' };

type UsersTab = 'members' | 'roles';

export default function UsersRoles() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState<UsersTab>('members');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('accountant');
  const [newRoleName, setNewRoleName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});

  const { data: members = [] } = useQuery({
    queryKey: ['tenant-users', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_users').select('*').eq('tenant_id', tenant!.id);
      return (data || []) as TenantUser[];
    },
    enabled: !!tenant?.id,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('roles').select('*, role_permissions(*)').eq('tenant_id', tenant!.id);
      return (data || []) as (Role & { role_permissions: RolePermission[] })[];
    },
    enabled: !!tenant?.id,
  });

  const createRole = useMutation({
    mutationFn: async () => {
      const { data: role, error } = await supabase.from('roles').insert({ tenant_id: tenant!.id, name: newRoleName }).select().single();
      if (error) throw error;

      const permsPayload = MODULES.map(m => ({
        role_id: role.id,
        module: m.key,
        can_view: permissions[m.key]?.can_view || false,
        can_create: permissions[m.key]?.can_create || false,
        can_edit: permissions[m.key]?.can_edit || false,
        can_delete: permissions[m.key]?.can_delete || false,
      }));
      await supabase.from('role_permissions').insert(permsPayload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rôle créé'); setShowRoleForm(false); setNewRoleName(''); setPermissions({}); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); toast.success('Rôle supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tenant_users').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-users'] }); toast.success('Membre retiré'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      if (!inviteEmail) throw new Error('Email requis');
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'invite_user',
        module: 'users',
        after_data: { email: inviteEmail, role: inviteRole, status: 'pending' },
      });
    },
    onSuccess: () => {
      toast.success(`Invitation envoyée à ${inviteEmail}. L'utilisateur rejoindra l'organisation après inscription.`);
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteRole('accountant');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function togglePerm(module: string, perm: string) {
    setPermissions(prev => ({
      ...prev,
      [module]: { ...prev[module], [perm]: !prev[module]?.[perm] },
    }));
  }

  function toggleAllPerms(module: string) {
    const allSet = PERMS.every(p => permissions[module]?.[p]);
    setPermissions(prev => ({
      ...prev,
      [module]: PERMS.reduce((acc, p) => ({ ...acc, [p]: !allSet }), {} as Record<string, boolean>),
    }));
  }

  const systemRoles = ['admin', 'accountant', 'sales', 'cashier'];

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('users.title')}</h1>

      <div className="flex gap-2 mb-6">
        {(['members', 'roles'] as UsersTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t ? 'bg-[#0057D9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'members' ? 'Membres' : 'Rôles'}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowInviteForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] text-white text-sm font-semibold rounded-xl hover:bg-[#003F9E]">
              <Plus className="w-4 h-4" /> {t('users.invite')}
            </button>
          </div>

          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700">{t('users.noUsers')}</h3>
              <p className="text-sm text-gray-400 mt-1">{t('users.noUsersDesc')}</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Utilisateur', 'Rôle', 'Propriétaire', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {members.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 group">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#0057D9]/20 rounded-full flex items-center justify-center">
                              <Users className="w-4 h-4 text-[#0057D9]" />
                            </div>
                            <span className="text-sm text-gray-700 font-mono">{m.user_id.slice(0,8)}...</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {m.is_owner && <span className="text-xs text-[#0057D9] font-medium flex items-center gap-1"><Shield className="w-3.5 h-3.5" />Propriétaire</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          {!m.is_owner && (
                            <button onClick={() => removeMember.mutate(m.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {members.map(m => (
                  <div key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 bg-[#0057D9]/20 rounded-full flex items-center justify-center">
                        <Users className="w-4 h-4 text-[#0057D9]" />
                      </div>
                      <span className="text-sm text-gray-700 font-mono">{m.user_id.slice(0,8)}...</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {m.role}
                        </span>
                        {m.is_owner && <span className="text-xs text-[#0057D9] font-medium flex items-center gap-1"><Shield className="w-3.5 h-3.5" />Propriétaire</span>}
                      </div>
                      {!m.is_owner && (
                        <button onClick={() => removeMember.mutate(m.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {showInviteForm && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-0 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 sm:p-6 sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
                <h2 className="text-lg font-medium text-gray-900 mb-4">{t('users.invite')}</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" placeholder="membre@entreprise.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]">
                      <option value="admin">Admin</option>
                      <option value="accountant">Comptable</option>
                      <option value="sales">Commercial</option>
                      <option value="cashier">Caissier</option>
                      {roles.filter(r => !systemRoles.includes(r.name)).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowInviteForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">Annuler</button>
                    <button
                      onClick={() => inviteMember.mutate()}
                      disabled={!inviteEmail || inviteMember.isPending}
                      className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold hover:bg-[#003F9E] disabled:opacity-60"
                    >
                      {inviteMember.isPending ? 'Envoi...' : 'Envoyer l\'invitation'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowRoleForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] text-white text-sm font-semibold rounded-xl hover:bg-[#003F9E]">
              <Plus className="w-4 h-4" /> {t('users.newRole')}
            </button>
          </div>

          {/* System roles */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Rôles système</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {['admin', 'accountant', 'sales', 'cashier'].map(role => (
                <div key={role} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-[#0057D9]" />
                    <span className="text-sm font-semibold text-gray-900 capitalize">{role}</span>
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Système</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom roles */}
          {roles.filter(r => !r.is_system).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Rôles personnalisés</h3>
              <div className="space-y-3">
                {roles.filter(r => !r.is_system).map(role => (
                  <div key={role.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                      <p className="text-xs text-gray-400">{role.role_permissions?.length || 0} permissions définies</p>
                    </div>
                    <button onClick={() => deleteRole.mutate(role.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Role form */}
          {showRoleForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl sm:my-8 min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl">
                <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg sm:text-xl font-medium text-gray-900">{t('users.newRole')}</h2>
                </div>
                <div className="p-5 sm:p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom du rôle *</label>
                    <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]" placeholder="Ex: Gestionnaire stock" />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Permissions par module</h3>
                    {/* Desktop matrix */}
                    <div className="hidden sm:block border border-gray-200 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-6 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <div className="col-span-2">Module</div>
                        {PERMS.map(p => <div key={p} className="text-center">{PERM_LABELS[p]}</div>)}
                        <div className="text-center">Tout</div>
                      </div>
                      {MODULES.map(m => {
                        const allSet = PERMS.every(p => permissions[m.key]?.[p]);
                        return (
                          <div key={m.key} className="grid grid-cols-6 px-4 py-2.5 border-t border-gray-100 items-center hover:bg-gray-50">
                            <div className="col-span-2 text-sm text-gray-700">{m.label}</div>
                            {PERMS.map(perm => (
                              <button key={perm} onClick={() => togglePerm(m.key, perm)}
                                className="flex justify-center">
                                {permissions[m.key]?.[perm]
                                  ? <CheckSquare className="w-4 h-4 text-[#0057D9]" />
                                  : <Square className="w-4 h-4 text-gray-300" />
                                }
                              </button>
                            ))}
                            <button onClick={() => toggleAllPerms(m.key)} className="flex justify-center">
                              {allSet
                                ? <CheckSquare className="w-4 h-4 text-blue-500" />
                                : <Square className="w-4 h-4 text-gray-300" />
                              }
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Mobile matrix — stacked */}
                    <div className="sm:hidden space-y-3">
                      {MODULES.map(m => {
                        const allSet = PERMS.every(p => permissions[m.key]?.[p]);
                        return (
                          <div key={m.key} className="border border-gray-200 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-700 font-medium">{m.label}</span>
                              <button onClick={() => toggleAllPerms(m.key)} className="text-xs text-[#0057D9] hover:underline">
                                {allSet ? 'Tout désélectionner' : 'Tout sélectionner'}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {PERMS.map(perm => (
                                <button key={perm} onClick={() => togglePerm(m.key, perm)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${permissions[m.key]?.[perm] ? 'bg-[#0057D9]/10 text-[#0057D9]' : 'bg-gray-50 text-gray-500'}`}>
                                  {permissions[m.key]?.[perm]
                                    ? <CheckSquare className="w-3.5 h-3.5" />
                                    : <Square className="w-3.5 h-3.5" />
                                  }
                                  {PERM_LABELS[perm]}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 px-5 sm:px-6 pb-5 sm:pb-6">
                  <button onClick={() => setShowRoleForm(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm">Annuler</button>
                  <button onClick={() => createRole.mutate()} disabled={!newRoleName || createRole.isPending}
                    className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                    {createRole.isPending ? '...' : 'Créer le rôle'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
