import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Package, X, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import Badge from '../../components/ui/Badge';
import toast from 'react-hot-toast';

interface FixedAsset {
  id: string;
  name: string;
  acquisition_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  accumulated_depreciation: number;
  status: 'active' | 'fully_depreciated' | 'disposed';
  asset_account_id: string;
  depreciation_account_id: string;
  expense_account_id: string;
  accounts_asset: { code: string; name: string } | null;
}

interface AccountOption { id: string; code: string; name: string; account_class: number }

function statusBadge(status: string, t: (key: string) => string) {
  const map: Record<string, { variant: 'gray' | 'success' | 'danger'; label: string }> = {
    active: { variant: 'success', label: t('fixedAssets.statusActive') },
    fully_depreciated: { variant: 'gray', label: t('fixedAssets.statusFullyDepreciated') },
    disposed: { variant: 'danger', label: t('fixedAssets.statusDisposed') },
  };
  const s = map[status] || { variant: 'gray' as const, label: status };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export default function FixedAssets() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    asset_account_id: '',
    depreciation_account_id: '',
    expense_account_id: '',
    acquisition_date: format(new Date(), 'yyyy-MM-dd'),
    acquisition_cost: 0,
    residual_value: 0,
    useful_life_months: 36,
  });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['fixed-assets', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select('*, accounts_asset:accounts!fixed_assets_asset_account_id_fkey(code, name)')
        .eq('tenant_id', tenant!.id)
        .order('acquisition_date', { ascending: false });
      if (error) throw error;
      return data as unknown as FixedAsset[];
    },
    enabled: !!tenant?.id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-for-fa', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name, account_class').eq('tenant_id', tenant!.id).eq('is_active', true).order('code');
      return (data || []) as AccountOption[];
    },
    enabled: !!tenant?.id,
  });

  const assetAccounts = accounts.filter(a => a.account_class === 2);
  const expenseAccounts = accounts.filter(a => a.account_class === 6);

  const resetForm = () => setForm({
    name: '', asset_account_id: '', depreciation_account_id: '', expense_account_id: '',
    acquisition_date: format(new Date(), 'yyyy-MM-dd'), acquisition_cost: 0, residual_value: 0, useful_life_months: 36,
  });

  const createAsset = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.asset_account_id || !form.depreciation_account_id || !form.expense_account_id) {
        throw new Error(t('fixedAssets.fillAllFields'));
      }
      const { error } = await supabase.from('fixed_assets').insert({
        tenant_id: tenant!.id,
        name: form.name,
        asset_account_id: form.asset_account_id,
        depreciation_account_id: form.depreciation_account_id,
        expense_account_id: form.expense_account_id,
        acquisition_date: form.acquisition_date,
        acquisition_cost: form.acquisition_cost,
        residual_value: form.residual_value,
        useful_life_months: form.useful_life_months,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      toast.success(t('fixedAssets.created'));
      setShowForm(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runDepreciation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), 'yyyy-MM-01');
      const { data, error } = await supabase.rpc('run_monthly_depreciation', { p_tenant_id: tenant!.id, p_period: today });
      if (error) throw error;
      return data as { fixed_asset_id: string; amount: number }[];
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      if (!data || data.length === 0) {
        toast(t('fixedAssets.noDepreciationThisMonth'), { icon: 'ℹ️' });
      } else {
        toast.success(`${data.length} ${t('fixedAssets.depreciationPosted')}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const monthlyAmount = (a: FixedAsset) => (a.acquisition_cost - a.residual_value) / a.useful_life_months;
  const progressPct = (a: FixedAsset) => Math.min(100, Math.round((a.accumulated_depreciation / (a.acquisition_cost - a.residual_value || 1)) * 100));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('fixedAssets.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('fixedAssets.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => runDepreciation.mutate()}
            disabled={runDepreciation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-surface-2 hover:bg-gray-200 dark:hover:bg-surface-3 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            <PlayCircle className="w-4 h-4" />
            {runDepreciation.isPending ? t('fixedAssets.calculating') : t('fixedAssets.runDepreciation')}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> {t('fixedAssets.newAsset')}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-200 dark:border-surface-3 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-sm">{t('fixedAssets.loading')}</div>
        ) : assets.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('fixedAssets.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-surface-2 text-gray-500 dark:text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">{t('fixedAssets.colAsset')}</th>
                  <th className="text-left px-4 py-3">{t('fixedAssets.colAccount')}</th>
                  <th className="text-right px-4 py-3">{t('fixedAssets.colOriginalValue')}</th>
                  <th className="text-right px-4 py-3">{t('fixedAssets.colMonthlyDepreciation')}</th>
                  <th className="text-left px-4 py-3">{t('fixedAssets.colProgress')}</th>
                  <th className="text-left px-4 py-3">{t('fixedAssets.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-surface-3">
                {assets.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {a.name}
                      <div className="text-xs text-gray-400">{t('fixedAssets.acquiredOn')} {format(new Date(a.acquisition_date), 'dd/MM/yyyy')}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-500">{a.accounts_asset?.code} {a.accounts_asset?.name}</td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{formatCurrency(a.acquisition_cost)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-500">{formatCurrency(monthlyAmount(a))}</td>
                    <td className="px-4 py-3">
                      <div className="w-24 h-1.5 bg-gray-100 dark:bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-[#0057D9]" style={{ width: `${progressPct(a)}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{progressPct(a)}%</span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(a.status, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-surface-1 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('fixedAssets.newAssetModalTitle')}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.name')}</label>
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('fixedAssets.namePlaceholder')}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.assetAccount')}</label>
                <select
                  value={form.asset_account_id}
                  onChange={e => setForm(prev => ({ ...prev, asset_account_id: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                >
                  <option value="">{t('fixedAssets.select')}</option>
                  {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.depreciationAccount')}</label>
                <select
                  value={form.depreciation_account_id}
                  onChange={e => setForm(prev => ({ ...prev, depreciation_account_id: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                >
                  <option value="">{t('fixedAssets.select')}</option>
                  {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.expenseAccount')}</label>
                <select
                  value={form.expense_account_id}
                  onChange={e => setForm(prev => ({ ...prev, expense_account_id: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                >
                  <option value="">{t('fixedAssets.select')}</option>
                  {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.purchaseDate')}</label>
                  <input
                    type="date"
                    value={form.acquisition_date}
                    onChange={e => setForm(prev => ({ ...prev, acquisition_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.usefulLifeMonths')}</label>
                  <input
                    type="number"
                    value={form.useful_life_months}
                    onChange={e => setForm(prev => ({ ...prev, useful_life_months: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.acquisitionCost')}</label>
                  <input
                    type="number"
                    value={form.acquisition_cost}
                    onChange={e => setForm(prev => ({ ...prev, acquisition_cost: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('fixedAssets.residualValue')}</label>
                  <input
                    type="number"
                    value={form.residual_value}
                    onChange={e => setForm(prev => ({ ...prev, residual_value: Number(e.target.value) }))}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg"
                  />
                </div>
              </div>

              {form.acquisition_cost > 0 && form.useful_life_months > 0 && (
                <p className="text-xs text-gray-400">
                  {t('fixedAssets.estimatedMonthly')} : {formatCurrency((form.acquisition_cost - form.residual_value) / form.useful_life_months)}
                </p>
              )}
            </div>

            <button
              onClick={() => createAsset.mutate()}
              disabled={createAsset.isPending}
              className="w-full mt-5 py-2.5 bg-[#0057D9] hover:bg-[#003F9E] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {createAsset.isPending ? t('fixedAssets.saving') : t('fixedAssets.saveAsset')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
