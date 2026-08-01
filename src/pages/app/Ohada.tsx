import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const [ocrExtracting, setOcrExtracting] = useState(false);
  interface OcrExtractedData {
    vendor_name: string | null;
    invoice_number: string | null;
    date: string | null;
    subtotal: number | null;
    vat_amount: number | null;
    total: number | null;
    currency: string | null;
    line_items: { description: string; quantity: number | null; unit_price: number | null }[];
    confidence: 'high' | 'medium' | 'low';
  }
  const [ocrExtracted, setOcrExtracted] = useState<OcrExtractedData | null>(null);
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

  const tabs: { key: OhadaTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'reports', label: 'États OHADA', icon: FileSpreadsheet },
    { key: 'payroll', label: 'Paie', icon: Users },
    { key: 'ocr', label: 'OCR Documents', icon: Scan },
  ];

  async function handleOcrFile(file: File) {
    const err = validateDocumentFile(file);
    if (err) { toast.error(err); return; }
    setOcrUploading(true);
    setOcrExtracted(null);
    try {
      const { url } = await uploadOcrDocument(tenant!.id, file);
      setOcrUploaded({ name: file.name, url });
      await supabase.from('audit_logs').insert({
        tenant_id: tenant!.id,
        action: 'ocr_upload',
        module: 'ohada',
        after_data: { filename: file.name, url },
      });

      setOcrExtracting(true);
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ document_url: url, tenant_id: tenant!.id, media_type: file.type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Échec de l'extraction");
      setOcrExtracted(json.extracted);
      toast.success('Document analysé automatiquement');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Échec du téléversement');
    } finally {
      setOcrUploading(false);
      setOcrExtracting(false);
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

      {tab === 'payroll' && <PayrollPanel tenant={tenant} formatCurrency={formatCurrency} />}

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

          {ocrExtracting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyse du document en cours...
            </div>
          )}

          {ocrExtracted && (
            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Données extraites</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ocrExtracted.confidence === 'high' ? 'bg-green-100 text-green-700' :
                  ocrExtracted.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>
                  Confiance {ocrExtracted.confidence === 'high' ? 'élevée' : ocrExtracted.confidence === 'medium' ? 'moyenne' : 'faible'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-gray-400 text-xs">Fournisseur</dt><dd className="text-gray-900 font-medium">{ocrExtracted.vendor_name || '—'}</dd></div>
                <div><dt className="text-gray-400 text-xs">N° facture</dt><dd className="text-gray-900 font-medium">{ocrExtracted.invoice_number || '—'}</dd></div>
                <div><dt className="text-gray-400 text-xs">Date</dt><dd className="text-gray-900 font-medium">{ocrExtracted.date || '—'}</dd></div>
                <div><dt className="text-gray-400 text-xs">Devise</dt><dd className="text-gray-900 font-medium">{ocrExtracted.currency || '—'}</dd></div>
                <div><dt className="text-gray-400 text-xs">Sous-total</dt><dd className="text-gray-900 font-medium">{ocrExtracted.subtotal ?? '—'}</dd></div>
                <div><dt className="text-gray-400 text-xs">TVA</dt><dd className="text-gray-900 font-medium">{ocrExtracted.vat_amount ?? '—'}</dd></div>
                <div className="col-span-2"><dt className="text-gray-400 text-xs">Total</dt><dd className="text-gray-900 font-medium text-base">{ocrExtracted.total ?? '—'}</dd></div>
              </dl>
              {ocrExtracted.line_items?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Lignes détectées</p>
                  {ocrExtracted.line_items.map((li, i) => (
                    <p key={i} className="text-xs text-gray-600 py-0.5">{li.description} {li.quantity ? `× ${li.quantity}` : ''} {li.unit_price ? `@ ${li.unit_price}` : ''}</p>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">Vérifie ces données avant de créer la facture d'achat — l'IA peut se tromper.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PayrollTenant { id: string; name: string; currency: string }

function PayrollPanel({ tenant, formatCurrency }: { tenant: PayrollTenant | null; formatCurrency: (n: number) => string }) {
  const qc = useQueryClient();
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [salaryAccountId, setSalaryAccountId] = useState('');
  const [netPayableAccountId, setNetPayableAccountId] = useState('');
  const [socialPayableAccountId, setSocialPayableAccountId] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('tenant_id', tenant!.id).eq('is_active', true).order('full_name');
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-for-payroll', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name').eq('tenant_id', tenant!.id).order('code');
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const addEmployee = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('employees').insert({
        tenant_id: tenant!.id, full_name: newName, position: newPosition, gross_salary: Number(newSalary) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employé ajouté');
      setShowAddEmployee(false); setNewName(''); setNewPosition(''); setNewSalary('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generatePayslip = useMutation({
    mutationFn: async (employeeId: string) => {
      if (!salaryAccountId || !netPayableAccountId || !socialPayableAccountId) {
        throw new Error('Sélectionne les 3 comptes comptables ci-dessus avant de générer un bulletin');
      }
      const now = new Date();
      const { data, error } = await supabase.rpc('generate_payslip', {
        p_employee_id: employeeId,
        p_period_month: now.getMonth() + 1,
        p_period_year: now.getFullYear(),
        p_salary_expense_account_id: salaryAccountId,
        p_net_payable_account_id: netPayableAccountId,
        p_social_payable_account_id: socialPayableAccountId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (payslipId, employeeId) => {
      const emp = employees.find((e: Record<string, unknown>) => e.id === employeeId) as Record<string, unknown> | undefined;
      const { data: payslip } = await supabase.from('payslips').select('*').eq('id', payslipId).maybeSingle();
      if (payslip && emp) {
        const { pdf } = await import('@react-pdf/renderer');
        const { ReportPdfDocument } = await import('../../lib/reportPdf');
        const doc = (
          <ReportPdfDocument
            tenantName={tenant?.name || ''}
            title={`Bulletin de paie — ${emp.full_name}`}
            period={`${payslip.period_month}/${payslip.period_year}`}
            kpis={[
              { label: 'Salaire brut', value: formatCurrency(payslip.gross_salary) },
              { label: 'Retenues', value: formatCurrency(payslip.employee_contribution + payslip.income_tax) },
              { label: 'Net à payer', value: formatCurrency(payslip.net_salary) },
            ]}
            columns={['Élément', 'Montant']}
            rows={[
              ['Salaire brut', formatCurrency(payslip.gross_salary)],
              ['Cotisations salariales', `- ${formatCurrency(payslip.employee_contribution)}`],
              ['Impôt sur le revenu (estimation)', `- ${formatCurrency(payslip.income_tax)}`],
            ]}
            totalRow={['Net à payer', formatCurrency(payslip.net_salary)]}
            currency={tenant?.currency || 'XAF'}
          />
        );
        const blob = await pdf(doc).toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `bulletin-${emp.full_name}-${payslip.period_month}-${payslip.period_year}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Bulletin de paie généré et téléchargé');
      setRunningId(null);
    },
    onError: (err: Error) => { toast.error(err.message); setRunningId(null); },
  });

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800">
        Sélectionne les comptes comptables à utiliser pour la paie (une seule fois). Les taux de cotisation/impôt par défaut sont estimatifs — vérifie-les dans <strong>Paramètres</strong> selon la réglementation de ton pays.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select value={salaryAccountId} onChange={e => setSalaryAccountId(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
          <option value="">Compte charges de personnel (66)</option>
          {accounts.map((a: Record<string, unknown>) => <option key={a.id as string} value={a.id as string}>{a.code as string} — {a.name as string}</option>)}
        </select>
        <select value={netPayableAccountId} onChange={e => setNetPayableAccountId(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
          <option value="">Compte personnel à payer (42)</option>
          {accounts.map((a: Record<string, unknown>) => <option key={a.id as string} value={a.id as string}>{a.code as string} — {a.name as string}</option>)}
        </select>
        <select value={socialPayableAccountId} onChange={e => setSocialPayableAccountId(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
          <option value="">Compte organismes sociaux (43)</option>
          {accounts.map((a: Record<string, unknown>) => <option key={a.id as string} value={a.id as string}>{a.code as string} — {a.name as string}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Employés & bulletins de paie</h2>
            <p className="text-xs text-gray-400 mt-0.5">Générez de vrais bulletins SYSCOHADA avec écriture comptable automatique</p>
          </div>
          <button onClick={() => setShowAddEmployee(true)} className="px-3 py-1.5 bg-[#0057D9] text-white text-xs font-semibold rounded-lg hover:bg-[#003F9E]">+ Employé</button>
        </div>
        {employees.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Aucun employé enregistré.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {employees.map((emp: Record<string, unknown>) => (
              <div key={emp.id as string} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{emp.full_name as string}</p>
                  <p className="text-xs text-gray-400">{emp.position as string || '—'} · {formatCurrency(emp.gross_salary as number)}/mois</p>
                </div>
                <button
                  onClick={() => { setRunningId(emp.id as string); generatePayslip.mutate(emp.id as string); }}
                  disabled={generatePayslip.isPending && runningId === emp.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0057D9] hover:bg-[#003F9E] text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors flex-shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {generatePayslip.isPending && runningId === emp.id ? 'Génération...' : 'Générer le bulletin'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Nouvel employé</h3>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom complet" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              <input value={newPosition} onChange={e => setNewPosition(e.target.value)} placeholder="Poste" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              <input value={newSalary} onChange={e => setNewSalary(e.target.value)} type="number" placeholder="Salaire brut mensuel" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" />
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddEmployee(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm">Annuler</button>
                <button onClick={() => addEmployee.mutate()} disabled={!newName || addEmployee.isPending} className="flex-1 px-4 py-2.5 bg-[#0057D9] text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {addEmployee.isPending ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
