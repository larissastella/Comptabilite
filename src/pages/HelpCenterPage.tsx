import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search, ChevronDown, MessageCircle, Mail, Code2, Wallet, BookOpen, Users, Package, LifeBuoy } from 'lucide-react';
import logo from '../assets/logo.png';
import ThemeToggle from '../components/ui/ThemeToggle';
import { usePageMeta } from '../lib/usePageMeta';

const BLUE = '#0057D9';

interface FaqItem {
  q: string;
  a: string;
}
interface FaqCategory {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: FaqItem[];
}

// Kept in sync with the FAQ knowledge base in supabase/functions/support-chat —
// same source facts, organized here by category with full answers instead
// of keyword-matched snippets.
const CATEGORIES_FR: FaqCategory[] = [
  {
    key: 'general',
    label: 'Général',
    icon: BookOpen,
    items: [
      {
        q: "Comment créer un compte LiBooks ?",
        a: "Clique sur \"Essai gratuit\" ou \"Commencer\" en haut de la page d'accueil. L'inscription prend moins de 2 minutes et ne nécessite aucune carte bancaire.",
      },
      {
        q: "L'essai gratuit dure combien de temps ?",
        a: "7 jours, avec accès à toutes les fonctionnalités du forfait que tu choisis. Aucune carte bancaire requise pour démarrer.",
      },
      {
        q: "LiBooks fonctionne dans quels pays ?",
        a: "97 pays sont supportés, avec une expertise particulière pour la zone OHADA (plan comptable SYSCOHADA natif). Devises, taux de TVA et régions sont pré-configurés selon ton pays.",
      },
      {
        q: "LiBooks fonctionne-t-il hors ligne ?",
        a: "Oui — tu peux créer des factures et des mouvements sans connexion. La synchronisation se fait automatiquement dès que le réseau revient.",
      },
    ],
  },
  {
    key: 'billing',
    label: 'Facturation & Paiement',
    icon: Wallet,
    items: [
      {
        q: "Quels sont les forfaits et leurs prix ?",
        a: "4 forfaits : Starter (14$/mois), Pro (29$/mois), Premium (79$/mois) et Enterprise (199$/mois), facturés en USD et affichés automatiquement dans ta devise. Chaque forfait supérieur inclut tout l'inférieur, plus des fonctionnalités avancées. Une réduction de 20% s'applique à la facturation annuelle.",
      },
      {
        q: "Comment puis-je payer ?",
        a: "Par carte bancaire ou Mobile Money, selon les moyens de paiement disponibles dans ta région — au choix, directement depuis la page Facturation de ton compte.",
      },
      {
        q: "Le renouvellement est-il automatique ?",
        a: "Si tu paies par carte, oui — ta carte est débitée automatiquement chaque cycle, avec un rappel par email 3 jours avant. Tu peux annuler le renouvellement automatique à tout moment depuis Facturation, sans perdre l'accès avant la fin de la période déjà payée.",
      },
      {
        q: "Comment annuler mon abonnement ?",
        a: "Depuis la page Facturation de ton compte, section \"Renouvellement automatique\" (bouton Annuler) ou en nous contactant directement pour toute autre demande liée à ton compte.",
      },
      {
        q: "Puis-je changer de forfait à tout moment ?",
        a: "Oui, à la hausse comme à la baisse, directement depuis la page Facturation.",
      },
    ],
  },
  {
    key: 'accounting',
    label: 'Comptabilité & Factures',
    icon: BookOpen,
    items: [
      {
        q: "LiBooks est-il conforme à SYSCOHADA/OHADA ?",
        a: "Oui — plan comptable SYSCOHADA pré-configuré pour les pays OHADA, comptabilité en partie double, et états financiers générés automatiquement (bilan, compte de résultat).",
      },
      {
        q: "Que se passe-t-il si mon pays n'est pas OHADA ?",
        a: "Tu obtiens un plan comptable générique international à l'inscription (numérotation façon QuickBooks/Xero), et le module de rapports (bilan, compte de résultat) reste disponible indépendamment de ta zone géographique.",
      },
      {
        q: "Puis-je envoyer mes factures par WhatsApp ?",
        a: "Oui, en plus de l'export PDF classique — disponible dès le forfait Starter.",
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Stocks',
    icon: Package,
    items: [
      {
        q: "La gestion de stock multi-magasin est-elle incluse ?",
        a: "Oui, dès le forfait Starter : suivi des entrées/sorties, alertes de stock bas, et valorisation automatique.",
      },
    ],
  },
  {
    key: 'team',
    label: 'Équipe & Utilisateurs',
    icon: Users,
    items: [
      {
        q: "Combien d'utilisateurs puis-je inviter ?",
        a: "2 utilisateurs en Starter, 5 en Pro, illimité en Premium/Enterprise. Chaque membre peut avoir un rôle personnalisé.",
      },
    ],
  },
  {
    key: 'developers',
    label: 'Développeurs',
    icon: Code2,
    items: [
      {
        q: "LiBooks a-t-il une API publique ?",
        a: "Oui, réservée au forfait Enterprise — génère une clé depuis Paramètres → API. Documentation complète disponible sur notre page Développeurs.",
      },
    ],
  },
];

const CATEGORIES_EN: FaqCategory[] = [
  {
    key: 'general',
    label: 'General',
    icon: BookOpen,
    items: [
      {
        q: "How do I create a LiBooks account?",
        a: "Click \"Free trial\" or \"Get started\" at the top of the homepage. Signup takes less than 2 minutes and never requires a card.",
      },
      {
        q: "How long is the free trial?",
        a: "7 days, with access to every feature of the plan you choose. No card required to start.",
      },
      {
        q: "Which countries does LiBooks support?",
        a: "97 countries are supported, with special expertise for the OHADA zone (native SYSCOHADA chart of accounts). Currencies, VAT rates and regions are pre-configured based on your country.",
      },
      {
        q: "Does LiBooks work offline?",
        a: "Yes — you can create invoices and transactions with no connection. Everything syncs automatically the moment your network comes back.",
      },
    ],
  },
  {
    key: 'billing',
    label: 'Billing & Payment',
    icon: Wallet,
    items: [
      {
        q: "What are the plans and their prices?",
        a: "4 plans: Starter ($14/mo), Pro ($29/mo), Premium ($79/mo) and Enterprise ($199/mo), billed in USD and shown automatically in your currency. Each higher plan includes everything below it, plus advanced features. A 20% discount applies to annual billing.",
      },
      {
        q: "How can I pay?",
        a: "By card or Mobile Money, depending on the payment methods available in your region — your choice, directly from your account's Billing page.",
      },
      {
        q: "Is renewal automatic?",
        a: "If you pay by card, yes — your card is charged automatically each cycle, with an email reminder 3 days before. You can cancel auto-renewal at any time from Billing, without losing access before the already-paid period ends.",
      },
      {
        q: "How do I cancel my subscription?",
        a: "From your account's Billing page, \"Auto-renewal\" section (Cancel button), or by contacting us directly for any other account-related request.",
      },
      {
        q: "Can I change plans at any time?",
        a: "Yes, upgrade or downgrade, directly from the Billing page.",
      },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting & Invoices',
    icon: BookOpen,
    items: [
      {
        q: "Is LiBooks SYSCOHADA/OHADA compliant?",
        a: "Yes — a SYSCOHADA chart of accounts pre-configured for OHADA countries, double-entry bookkeeping, and financial statements generated automatically (balance sheet, income statement).",
      },
      {
        q: "What if my country isn't an OHADA country?",
        a: "You get a generic international chart of accounts at signup (QuickBooks/Xero-style numbering), and the reporting module (balance sheet, income statement) stays available regardless of your region.",
      },
      {
        q: "Can I send my invoices via WhatsApp?",
        a: "Yes, in addition to the standard PDF export — available from the Starter plan onward.",
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Package,
    items: [
      {
        q: "Is multi-store inventory management included?",
        a: "Yes, from the Starter plan onward: stock in/out tracking, low-stock alerts, and automatic valuation.",
      },
    ],
  },
  {
    key: 'team',
    label: 'Team & Users',
    icon: Users,
    items: [
      {
        q: "How many users can I invite?",
        a: "2 users on Starter, 5 on Pro, unlimited on Premium/Enterprise. Each member can have a custom role.",
      },
    ],
  },
  {
    key: 'developers',
    label: 'Developers',
    icon: Code2,
    items: [
      {
        q: "Does LiBooks have a public API?",
        a: "Yes, available on the Enterprise plan — generate a key from Settings → API. Full documentation is available on our Developers page.",
      },
    ],
  },
];

function FaqAccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 dark:border-surface-3 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-gray-900 dark:text-white">{item.q}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.a}</p>}
    </div>
  );
}

export default function HelpCenterPage() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  usePageMeta(
    isEn ? 'Help Center' : "Centre d'aide",
    isEn
      ? "Find answers to your questions about LiBooks: billing, accounting, inventory, team and API. Need more help? Contact our support."
      : "Trouve des réponses à tes questions sur LiBooks : facturation, comptabilité, stocks, équipe et API. Besoin d'aide supplémentaire ? Contacte notre support."
  );
  const CATEGORIES = isEn ? CATEGORIES_EN : CATEGORIES_FR;
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES
      .filter(cat => !activeCategory || cat.key === activeCategory)
      .map(cat => ({
        ...cat,
        items: q ? cat.items.filter(i => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)) : cat.items,
      }))
      .filter(cat => cat.items.length > 0);
  }, [query, activeCategory, CATEGORIES]);

  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={isEn ? '/en' : '/'} className="flex items-center gap-2">
            <img src={logo} alt="LiBooks" className="w-7 h-7" />
            <span className="text-lg text-gray-900 dark:text-white font-bold">Li</span><span className="text-lg text-[#0057D9] font-medium">Books</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="subtle" />
            <Link to={isEn ? '/en' : '/'} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{isEn ? 'Home' : 'Accueil'}</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + search */}
      <div className="bg-gradient-to-b from-blue-50/70 to-white dark:from-surface-1 dark:to-surface-0 border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center" style={{ background: `${BLUE}15` }}>
            <LifeBuoy className="w-7 h-7" style={{ color: BLUE }} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">{isEn ? 'Help Center' : "Centre d'aide"}</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">{isEn ? 'Find a quick answer, or contact us directly.' : 'Trouve rapidement une réponse, ou contacte-nous directement.'}</p>
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isEn ? 'Search a question...' : 'Rechercher une question...'}
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 dark:border-surface-3 bg-white dark:bg-surface-1 text-gray-900 dark:text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0057D9]/30"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2 mb-10 justify-center">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!activeCategory ? 'text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
            style={!activeCategory ? { background: BLUE } : {}}
          >
            {isEn ? 'All categories' : 'Toutes les catégories'}
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key === activeCategory ? null : cat.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeCategory === cat.key ? 'text-white' : 'bg-gray-100 dark:bg-surface-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-3'}`}
              style={activeCategory === cat.key ? { background: BLUE } : {}}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400 mb-4">{isEn ? `No results for "${query}".` : `Aucun résultat pour "${query}".`}</p>
            <a href="mailto:support@liafrik.com" className="font-medium" style={{ color: BLUE }}>{isEn ? 'Contact support →' : 'Contacte le support →'}</a>
          </div>
        ) : (
          <div className="space-y-10">
            {filtered.map(cat => (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-2">
                  <cat.icon className="w-4 h-4 text-[#0057D9]" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{cat.label}</h2>
                </div>
                <div className="rounded-2xl border border-gray-100 dark:border-surface-3 px-5 bg-white dark:bg-surface-1">
                  {cat.items.map((item, i) => <FaqAccordionItem key={i} item={item} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact options */}
        <div className="mt-16 grid sm:grid-cols-2 gap-4">
          <a href="mailto:support@liafrik.com" className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-1 hover:border-[#0057D9]/30 transition-colors">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${BLUE}15` }}>
              <Mail className="w-5 h-5" style={{ color: BLUE }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{isEn ? 'By email' : 'Par email'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">support@liafrik.com</p>
            </div>
          </a>
          <Link to={isEn ? '/en/contact' : '/contact'} className="flex items-center gap-4 p-5 rounded-2xl border border-gray-100 dark:border-surface-3 bg-gray-50 dark:bg-surface-1 hover:border-[#0057D9]/30 transition-colors">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${BLUE}15` }}>
              <MessageCircle className="w-5 h-5" style={{ color: BLUE }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{isEn ? 'Contact form' : 'Formulaire de contact'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{isEn ? 'Reply within 24-48h' : 'Réponse sous 24-48h'}</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
