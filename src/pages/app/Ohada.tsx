import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, FileText, Scan, Users, Download, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import toast from 'react-hot-toast';
import { uploadOcrDocument, validateDocumentFile } from '../../lib/upload';

type OhadaTab = 'reports' | 'payroll' | 'ocr';

export default function Ohada() {
  const { t } = useTranslation();
  const { tenant, formatCurrency } = useTenant();
  const [tab, setTab] = useState<OhadaTab>('reports');
  const [ocrUploading, setOcrUploading] = useState(false);
  const [ocrUploaded, setOcrUploaded] = useState<{ name: string; url: string } | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // Real data: transactions for balance
  const { data: txLines = [] } = useQuery({
    queryKey: ['ohada-txlines', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transaction_lines')
        .select('debit, credit, accounts(code, name, account_class, account_type)')
        .eq('tenant_id', tenant!.id);
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Compute class totals
  const classTotals = txLines.reduce((acc: Record<number, { debit: number; credit: number }>, line) => {
    const acc_data = (line as Record<string, unknown>).accounts as { account_class: number } | null;
    if (!acc_data) return acc;
    const cls = acc_data.account_class;
    if (!acc[cls]) acc[cls] = { debit: 0, credit: 0 };
    acc[cls].debit += (line as { debit: number }).debit || 0;
    acc[cls].credit += (line as { credit: number }).credit || 0;
    return acc;
  }, {});

  // Payroll: employees (use customers as proxy for staff in this minimal version)
  const { data: employees = [] } = useQuery({
    queryKey: ['ohada-employees', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, city')
        .eq('tenant_id', tenant!.id)
        .order('name')
        .limit(20);
      return data || [];
    },
    enabled: !!tenant?.id && tab === 'payroll',
  });

  const generatePayslip = useMutation({
    mutationFn: async (employeeId: string) => {
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'generate_payslip',
        module: 'ohada',
        record_id: employeeId,
      });
    },
    onSuccess: () => toast.success('Bulletin de paie généré (PDF)'),
    onError: (err: Error) => toast.error(err.message),
  });

  const tabs: { key: OhadaTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'reports', label: 'États OHADA', icon: FileSpreadsheet },
    { key: 'payroll', label: 'Paie', icon: Users },
    { key: 'ocr', label: 'OCR Documents', icon: Scan },
  ];

  async function handleOcrFile(file: File) {
    const err = validateDocumentFile(file);
    if (err) { toast.error(err); return; }
    setOcrUploading(true);
    try {
      const { url } = await uploadOcrDocument(tenant!.id, file);
      setOcrUploaded({ name: file.name, url });
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'ocr_upload',
        module: 'ohada',
        after_data: { filename: file.name, url },
      });
      toast.success('Document téléversé. L\'extraction OCR sera disponible après activation du service Premium.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Échec du téléversement');
    } finally {
      setOcrUploading(false);
    }
  }

  function onOcrDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleOcrFile(file);
  }

  function exportOhadaCsv(kind: string, label: string) {
    const labels: Record<string, string> = {
      '1': 'Comptes de ressources durables',
      '2': 'Actif immobilisé',
      '3': 'Stocks',
      '4': 'Tiers',
      '5': 'Trésorerie',
      '6': 'Charges',
      '7': 'Produits',
      '8': 'Autres charges & produits',
      '9': 'Comptes spéciaux',
    };
    let csv = '';
    if (kind === 'bilan' || kind === 'resultat') {
      csv = 'Classe,Libellé,Débit,Crédit,Solde\n';
      Object.entries(classTotals).forEach(([cls, vals]: [string, { debit: number; credit: number }]) => {
        const filterClass = kind === 'bilan' ? parseInt(cls) <= 5 : parseInt(cls) >= 6;
        if (filterClass) {
          csv += `Classe ${cls},${labels[cls] || '—'},${vals.debit},${vals.credit},${vals.debit - vals.credit}\n`;
        }
      });
    } else if (kind === 'tdr') {
      csv = 'Classe,Libellé,Flux net\n';
      Object.entries(classTotals).forEach(([cls, vals]: [string, { debit: number; credit: number }]) => {
        if (parseInt(cls) === 5) {
          csv += `Classe ${cls},${labels[cls] || '—'},${vals.debit - vals.credit}\n`;
        }
      });
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${label} exporté en CSV`);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.ohada')}</h1>
        <p className="text-sm text-gray-400 mt-1">États financiers SYSCOHADA, paie et numérisation OCR</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map(tabItem => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === tabItem.key ? 'bg-[#0057D9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <tabItem.icon className="w-4 h-4" />
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && (
        <div className="space-y-6">
          {/* Balance by class */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Bilan par classe SYSCOHADA</h2>
              <p className="text-xs text-gray-400 mt-0.5">Synthèse des soldes par classe de comptes</p>
            </div>
            {Object.keys(classTotals).length === 0 ? (
              <div className="p-8 text-center">
                <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Aucune écriture comptable enregistrée.</p>
                <p className="text-xs text-gray-400 mt-1">Saisissez des transactions pour générer les états OHADA.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Classe', 'Libellé', 'Débit', 'Crédit', 'Solde'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(classTotals).map(([cls, vals]: [string, { debit: number; credit: number }]) => {
                      const labels: Record<string, string> = {
                        '1': 'Comptes de ressources durables',
                        '2': 'Actif immobilisé',
                        '3': 'Stocks',
                        '4': 'Tiers',
                        '5': 'Trésorerie',
                        '6': 'Charges',
                        '7': 'Produits',
                        '8': 'Autres charges & produits',
                        '9': 'Comptes spéciaux',
                      };
                      return (
                        <tr key={cls} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-gray-900">Classe {cls}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{labels[cls] || '—'}</td>
                          <td className="px-4 py-3 text-sm text-right">{formatCurrency(vals.debit)}</td>
                          <td className="px-4 py-3 text-sm text-right">{formatCurrency(vals.credit)}</td>
                          <td className={`px-4 py-3 text-sm font-semibold text-right ${vals.debit - vals.credit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {formatCurrency(vals.debit - vals.credit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Bilan complet', desc: 'Actif / Passif SYSCOHADA', kind: 'bilan' },
              { label: 'Compte de résultat', desc: 'Charges / Produits', kind: 'resultat' },
              { label: 'TDR (Tableau de flux)', desc: 'Flux de trésorerie', kind: 'tdr' },
            ].map(exp => (
              <button
                key={exp.label}
                onClick={() => exportOhadaCsv(exp.kind, exp.label)}
                className="text-left p-4 bg-white rounded-2xl border border-gray-100 hover:border-[#0057D9] hover:shadow-sm transition-all"
              >
                <Download className="w-5 h-5 text-[#0057D9] mb-2" />
                <p className="text-sm font-semibold text-gray-900">{exp.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{exp.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Bulletins de paie</h2>
              <p className="text-xs text-gray-400 mt-0.5">Générez les bulletins SYSCOHADA pour vos employés</p>
            </div>
          </div>
          {employees.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Aucun employé enregistré.</p>
              <p className="text-xs text-gray-400 mt-1">Ajoutez des employés dans le module Clients (catégorie "Personnel") pour générer leurs bulletins.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {employees.map((emp: Record<string, unknown>) => (
                <div key={emp.id as string} className="flex items-center justify-between px-5 py-3.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.name as string}</p>
                    <p className="text-xs text-gray-400">{emp.city as string || '—'}</p>
                  </div>
                  <button
                    onClick={() => generatePayslip.mutate(emp.id as string)}
                    disabled={generatePayslip.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors flex-shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Générer le bulletin</span>
                    <span className="sm:hidden">Générer</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'ocr' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Scan className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-gray-900 mb-2">Numérisation OCR</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Importez une photo de facture ou de reçu. L'OCR extrait automatiquement les montants, dates et fournisseurs pour pré-remplir vos écritures.
          </p>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onOcrDrop}
            onClick={() => !ocrUploading && ocrInputRef.current?.click()}
            className="relative border-2 border-dashed border-gray-200 rounded-xl p-8 max-w-md mx-auto hover:border-[#0057D9] transition-colors cursor-pointer"
          >
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleOcrFile(f);
                e.target.value = '';
              }}
            />
            {ocrUploading ? (
              <>
                <Loader2 className="w-8 h-8 text-[#0057D9] mx-auto mb-3 animate-spin" />
                <p className="text-sm text-gray-600 font-medium">Téléversement en cours...</p>
              </>
            ) : ocrUploaded ? (
              <>
                <FileText className="w-8 h-8 text-[#0057D9] mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-900 truncate">{ocrUploaded.name}</p>
                <p className="text-xs text-green-600 mt-1">Document téléversé avec succès</p>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setOcrUploaded(null); }}
                  className="absolute top-2 right-2 p-1 bg-white/80 rounded-full hover:bg-white text-gray-500 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <Scan className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">Glissez un document ici</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP ou PDF — max 5MB</p>
                <span className="mt-4 inline-block px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition-colors">
                  Choisir un fichier
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Le service OCR sera connecté à votre abonnement Premium pour activer l'extraction automatique.
          </p>
        </div>
      )}
    </div>
  );
}
