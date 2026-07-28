import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, CheckCircle2, Landmark, Link2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface AccountOption { id: string; code: string; name: string }
interface StatementLine {
  id: string;
  statement_date: string;
  description: string;
  amount: number;
  reference: string | null;
  status: 'unmatched' | 'matched' | 'ignored';
}
interface LedgerLine {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  transactions: { date: string; reference: string | null } | null;
}

// Parses a simple CSV: date,description,amount,reference (comma or semicolon separated, header row optional)
function parseCsv(text: string): { date: string; description: string; amount: number; reference: string }[] {
  const rows = text.trim().split(/\r?\n/);
  const sep = rows[0].includes(';') ? ';' : ',';
  const out: { date: string; description: string; amount: number; reference: string }[] = [];
  for (const row of rows) {
    const cols = row.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    const amount = Number(cols[2].replace(/\s/g, '').replace(',', '.'));
    if (Number.isNaN(amount) || /date/i.test(cols[0])) continue; // skip header row
    out.push({ date: cols[0], description: cols[1], amount, reference: cols[3] || '' });
  }
  return out;
}

export default function BankReconciliation() {
  const { tenant, formatCurrency } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [matchingLine, setMatchingLine] = useState<StatementLine | null>(null);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['accounts-class5', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('accounts').select('id, code, name').eq('tenant_id', tenant!.id).eq('account_class', 5).eq('is_active', true).order('code');
      return (data || []) as AccountOption[];
    },
    enabled: !!tenant?.id,
  });

  const { data: statementLines = [] } = useQuery({
    queryKey: ['bank-statement-lines', tenant?.id, selectedAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_statement_lines')
        .select('id, statement_date, description, amount, reference, status')
        .eq('tenant_id', tenant!.id)
        .eq('account_id', selectedAccountId)
        .order('statement_date', { ascending: false });
      if (error) throw error;
      return data as StatementLine[];
    },
    enabled: !!tenant?.id && !!selectedAccountId,
  });

  const { data: candidateLines = [] } = useQuery({
    queryKey: ['unreconciled-ledger-lines', tenant?.id, selectedAccountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_lines')
        .select('id, debit, credit, description, transactions(date, reference)')
        .eq('tenant_id', tenant!.id)
        .eq('account_id', selectedAccountId)
        .eq('reconciled', false);
      if (error) throw error;
      return data as unknown as LedgerLine[];
    },
    enabled: !!tenant?.id && !!selectedAccountId && !!matchingLine,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error('Aucune ligne valide trouvée dans le fichier (attendu: date,description,montant,reference)');
      const payload = rows.map(r => ({
        tenant_id: tenant!.id,
        account_id: selectedAccountId,
        statement_date: r.date,
        description: r.description,
        amount: r.amount,
        reference: r.reference || null,
        imported_by: user?.id,
      }));
      const { error } = await supabase.from('bank_statement_lines').insert(payload);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['bank-statement-lines'] });
      toast.success(`${count} ligne(s) importée(s)`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matchMutation = useMutation({
    mutationFn: async ({ statementLineId, transactionLineId }: { statementLineId: string; transactionLineId: string }) => {
      const { error } = await supabase.rpc('match_bank_statement_line', {
        p_statement_line_id: statementLineId,
        p_transaction_line_id: transactionLineId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-statement-lines'] });
      qc.invalidateQueries({ queryKey: ['unreconciled-ledger-lines'] });
      toast.success('Ligne rapprochée');
      setMatchingLine(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Le montant ne correspond pas exactement'),
  });

  const unmatchedCount = statementLines.filter(l => l.status === 'unmatched').length;
  const suggestedMatches = matchingLine
    ? candidateLines.filter(l => Math.round((l.debit - l.credit) * 100) === Math.round(matchingLine.amount * 100))
    : [];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Rapprochement bancaire</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Importez votre relevé bancaire et faites correspondre chaque ligne à une écriture comptable</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={selectedAccountId}
          onChange={e => setSelectedAccountId(e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 dark:border-surface-3 dark:bg-surface-1 dark:text-white rounded-xl"
        >
          <option value="">Choisir un compte de trésorerie (classe 5)...</option>
          {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>

        {selectedAccountId && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && importMutation.mutate(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-surface-2 hover:bg-gray-200 dark:hover:bg-surface-3 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importMutation.isPending ? 'Import...' : 'Importer un relevé CSV'}
            </button>
            <span className="text-xs text-gray-400">Format : date,description,montant,référence</span>
          </>
        )}
      </div>

      {selectedAccountId && (
        <>
          <div className="flex items-center gap-2 mb-3 text-sm">
            <Landmark className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500 dark:text-gray-400">{unmatchedCount} ligne(s) non rapprochée(s) sur {statementLines.length}</span>
          </div>

          <div className="bg-white dark:bg-surface-1 rounded-2xl border border-gray-200 dark:border-surface-3 overflow-hidden">
            {statementLines.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">Aucune ligne de relevé importée pour ce compte</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-surface-2 text-gray-500 dark:text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Description</th>
                      <th className="text-right px-4 py-3">Montant</th>
                      <th className="text-left px-4 py-3">Statut</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-surface-3">
                    {statementLines.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-surface-2">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-500">{format(new Date(l.statement_date), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white">{l.description}</td>
                        <td className={`px-4 py-3 text-right font-medium ${l.amount >= 0 ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                          {formatCurrency(l.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {l.status === 'matched' ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Rapproché</span>
                          ) : (
                            <span className="text-xs text-gray-400">Non rapproché</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.status === 'unmatched' && (
                            <button
                              onClick={() => setMatchingLine(l)}
                              className="inline-flex items-center gap-1 text-xs text-[#0057D9] font-medium hover:underline"
                            >
                              <Link2 className="w-3.5 h-3.5" /> Rapprocher
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {matchingLine && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMatchingLine(null)}>
          <div className="bg-white dark:bg-surface-1 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-5 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rapprocher</h2>
              <button onClick={() => setMatchingLine(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{matchingLine.description}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-4">{formatCurrency(matchingLine.amount)}</p>

            {suggestedMatches.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune écriture non rapprochée avec exactement ce montant sur ce compte.</p>
            ) : (
              <div className="space-y-2">
                {suggestedMatches.map(l => (
                  <button
                    key={l.id}
                    onClick={() => matchMutation.mutate({ statementLineId: matchingLine.id, transactionLineId: l.id })}
                    disabled={matchMutation.isPending}
                    className="w-full text-left p-3 border border-gray-200 dark:border-surface-3 rounded-xl hover:border-[#0057D9] transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm text-gray-900 dark:text-white">{l.description || l.transactions?.reference || '—'}</p>
                    <p className="text-xs text-gray-400">{l.transactions?.date && format(new Date(l.transactions.date), 'dd/MM/yyyy')} · {formatCurrency(l.debit - l.credit)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
