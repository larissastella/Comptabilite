import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, Copy, Check, Key, Zap, ShieldCheck, RotateCw } from 'lucide-react';
import logo from '../assets/logo.png';
import ThemeToggle from '../components/ui/ThemeToggle';

const BLUE = '#0057D9';

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden my-4 group">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0A1F30] border-b border-white/10">
        <span className="text-xs text-gray-400 font-mono">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Copier"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="bg-[#0F2A3D] text-gray-100 text-sm p-4 overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

function Endpoint({ method, path, scope, children }: { method: string; path: string; scope?: string; children: React.ReactNode }) {
  const methodColor = method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300';
  return (
    <div className="mb-10 scroll-mt-24" id={`${method.toLowerCase()}-${path.replace(/[/:]/g, '-')}`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${methodColor}`}>{method}</span>
        <code className="text-sm font-mono text-gray-800 dark:text-gray-200">{path}</code>
        {scope && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">scope: {scope}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="LiBooks" className="w-7 h-7" />
            <span className="text-lg text-gray-900 dark:text-white font-bold">Li</span><span className="text-lg text-[#0057D9] font-medium">Books</span>
            <span className="hidden sm:inline text-sm text-gray-400 ml-1">/ Developers</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="subtle" />
            <Link to="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Accueil</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-[200px_1fr] gap-12">
        {/* Sidebar nav */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-1 text-sm">
            {[
              ['#getting-started', 'Démarrage'],
              ['#authentication', 'Authentification'],
              ['#rate-limits', 'Limites de débit'],
              ['#idempotency', 'Idempotence'],
              ['#errors', 'Erreurs'],
              ['#get-invoices', 'GET /invoices'],
              ['#get-invoices-id', 'GET /invoices/:id'],
              ['#get-balance', 'GET /balance'],
              ['#post-transactions', 'POST /transactions'],
              ['#changelog', 'Changelog'],
            ].map(([href, label]) => (
              <a key={href} href={href} className="block px-3 py-1.5 rounded-lg text-gray-500 hover:text-[#0057D9] hover:bg-blue-50 dark:text-gray-400 dark:hover:bg-surface-2 transition-colors">
                {label}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          <div className="mb-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-3" style={{ background: `${BLUE}15`, color: BLUE }}>
              Forfait Entreprise
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">API LiBooks</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
              Une API REST volontairement restreinte à un petit nombre d'endpoints stables — pensée pour rester
              compatible dans le temps plutôt que d'exposer tout le schéma interne. Lis tes factures, ton solde
              comptable, et écris des écritures de journal depuis ton propre système.
            </p>
          </div>

          <section id="getting-started" className="mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Key className="w-5 h-5" style={{ color: BLUE }} /> Démarrage
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Génère une clé API depuis <strong>Paramètres → API</strong> (visible uniquement sur le forfait Entreprise).
              Chaque clé a un scope <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">read</code> ou{' '}
              <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">write</code>, et n'est affichée
              qu'une seule fois à sa création — conserve-la comme un mot de passe.
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Base URL : <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">https://[ton-projet].supabase.co/functions/v1/public-api</code>
            </p>
          </section>

          <section id="authentication" className="mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" style={{ color: BLUE }} /> Authentification
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Chaque requête doit inclure ta clé en en-tête <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">Authorization</code> :
            </p>
            <CodeBlock code={`Authorization: Bearer lbk_xxxxxxxxxxxxxxxxxxxx`} />
            <p className="text-gray-600 dark:text-gray-400">
              Une clé révoquée ou invalide renvoie <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">401</code>.
              Une clé <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">read</code> qui tente un
              endpoint d'écriture reçoit <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">403</code>.
            </p>
          </section>

          <section id="rate-limits" className="mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5" style={{ color: BLUE }} /> Limites de débit
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              <strong>100 requêtes/minute</strong> par clé API (pas par tenant — chaque clé a son propre budget).
              Au-delà, l'API renvoie <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">429</code>.
              Réessaie après une minute.
            </p>
          </section>

          <section id="idempotency" className="mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <RotateCw className="w-5 h-5" style={{ color: BLUE }} /> Idempotence
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Sur <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">POST /transactions</code>,
              envoie un en-tête <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">Idempotency-Key</code> unique.
              Si ta requête timeout ou échoue côté réseau, renvoie-la avec la <strong>même</strong> clé : tu recevras la
              réponse d'origine au lieu de créer une deuxième écriture.
            </p>
            <CodeBlock code={`Idempotency-Key: mon-id-unique-du-cote-client-123`} />
          </section>

          <section id="errors" className="mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Erreurs</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Toutes les erreurs renvoient <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">{'{ "error": "message" }'}</code>.
              Les erreurs serveur (500) ne renvoient jamais de détail interne — seulement un message générique ; contacte le support avec l'heure approximative si ça persiste.
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-surface-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-surface-2">
                  <tr><th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Code</th><th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Signification</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-surface-3">
                  {[
                    ['400', 'Requête invalide (champ manquant, écriture déséquilibrée...)'],
                    ['401', 'Clé API manquante, invalide ou révoquée'],
                    ['403', "Scope insuffisant (clé read sur un endpoint d'écriture)"],
                    ['404', "Endpoint ou ressource introuvable"],
                    ['429', 'Limite de débit dépassée (100/min)'],
                    ['500', 'Erreur interne — contacte le support'],
                  ].map(([code, meaning]) => (
                    <tr key={code}><td className="px-4 py-2 font-mono text-gray-800 dark:text-gray-200">{code}</td><td className="px-4 py-2 text-gray-600 dark:text-gray-400">{meaning}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-gray-100 dark:border-surface-3 my-10" />

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Référence des endpoints</h2>

          <Endpoint method="GET" path="/invoices">
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Liste les factures de vente du tenant, paginée. Paramètres de requête optionnels :{' '}
              <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">limit</code> (défaut 50, max 200) et{' '}
              <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">offset</code>.
            </p>
            <CodeBlock code={`curl https://[ton-projet].supabase.co/functions/v1/public-api/invoices?limit=20 \\
  -H "Authorization: Bearer lbk_xxxxxxxxxxxx"`} />
            <CodeBlock lang="json" code={`{
  "data": [
    {
      "id": "8f3e...",
      "invoice_number": "FAC-2026-0142",
      "invoice_date": "2026-08-01",
      "due_date": "2026-08-31",
      "status": "sent",
      "currency": "XOF",
      "subtotal": 150000,
      "vat_amount": 27000,
      "total": 177000,
      "customer_id": "1a2b..."
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "total": 142 }
}`} />
          </Endpoint>

          <Endpoint method="GET" path="/invoices/:id">
            <p className="text-gray-600 dark:text-gray-400 mb-2">Une facture précise, avec ses lignes.</p>
            <CodeBlock code={`curl https://[ton-projet].supabase.co/functions/v1/public-api/invoices/8f3e... \\
  -H "Authorization: Bearer lbk_xxxxxxxxxxxx"`} />
            <CodeBlock lang="json" code={`{
  "data": {
    "id": "8f3e...",
    "invoice_number": "FAC-2026-0142",
    "...": "...tous les champs de la facture",
    "items": [
      { "id": "...", "description": "Prestation conseil", "quantity": 1, "unit_price": 150000, "total": 150000 }
    ]
  }
}`} />
          </Endpoint>

          <Endpoint method="GET" path="/balance">
            <p className="text-gray-600 dark:text-gray-400 mb-2">Solde agrégé par compte comptable (débit − crédit).</p>
            <CodeBlock code={`curl https://[ton-projet].supabase.co/functions/v1/public-api/balance \\
  -H "Authorization: Bearer lbk_xxxxxxxxxxxx"`} />
            <CodeBlock lang="json" code={`{
  "data": [
    { "code": "512000", "name": "Banque", "balance": 4520000 },
    { "code": "411000", "name": "Clients", "balance": 890000 }
  ]
}`} />
          </Endpoint>

          <Endpoint method="POST" path="/transactions" scope="write">
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Crée une écriture de journal. <code className="text-sm bg-gray-100 dark:bg-surface-2 px-1.5 py-0.5 rounded">lines</code> doit
              contenir au moins 2 lignes, et le total des débits doit égaler le total des crédits (partie double stricte).
            </p>
            <CodeBlock code={`curl -X POST https://[ton-projet].supabase.co/functions/v1/public-api/transactions \\
  -H "Authorization: Bearer lbk_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: sync-run-2026-08-24-001" \\
  -d '{
    "description": "Vente au comptant",
    "transaction_date": "2026-08-24",
    "lines": [
      { "account_id": "acc_caisse_id", "debit": 50000 },
      { "account_id": "acc_ventes_id", "credit": 50000 }
    ]
  }'`} />
            <CodeBlock lang="json" code={`{ "data": { "id": "9c1d...", "status": "created" } }`} />
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Les écritures créées via l'API arrivent non postées (<code className="text-xs bg-gray-100 dark:bg-surface-2 px-1 py-0.5 rounded">is_posted: false</code>) —
              elles doivent être validées dans LiBooks avant d'affecter les rapports officiels.
            </p>
          </Endpoint>

          <hr className="border-gray-100 dark:border-surface-3 my-10" />

          <section id="changelog" className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Changelog</h2>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li><strong className="text-gray-900 dark:text-white">2026-08-24</strong> — Rate limiting (100/min), support de <code className="text-xs bg-gray-100 dark:bg-surface-2 px-1 py-0.5 rounded">Idempotency-Key</code> sur POST /transactions, préfixe <code className="text-xs bg-gray-100 dark:bg-surface-2 px-1 py-0.5 rounded">/v1/</code> optionnel.</li>
              <li><strong className="text-gray-900 dark:text-white">2026-07-28</strong> — Lancement de l'API publique (Entreprise).</li>
            </ul>
          </section>

          <div className="mt-16 p-6 rounded-2xl bg-gray-50 dark:bg-surface-1 border border-gray-100 dark:border-surface-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Besoin d'un endpoint qui n'existe pas encore, ou d'aide pour intégrer ?{' '}
              <a href="mailto:support@liafrik.com" className="font-medium" style={{ color: BLUE }}>support@liafrik.com</a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
