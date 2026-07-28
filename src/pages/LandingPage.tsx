import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen, BarChart3, FileText, Receipt, Building2,
  Smartphone, Wifi, Globe, Shield, Zap, CheckCircle, ChevronDown,
  ArrowRight, Star, Quote, Menu, X, Sparkles,
  Package, Bell, Bot, ScanLine, Languages,
  Facebook, Twitter, Linkedin, Youtube, Mail, MapPin,
  Sun, Moon
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const NAVY = '#0F2A3D';
const GREEN = '#10B981';

const MODULES = [
  { icon: BarChart3, title: 'Tableau de bord', desc: 'KPIs en temps réel : CA, achats, créances, dettes. Graphiques mensuels.', color: 'bg-blue-500' },
  { icon: FileText, title: 'Facturation', desc: 'Factures ventes & achats avec numérotation séquentielle, TVA auto, PDF A4 & thermique 58/80mm.', color: 'bg-green-500' },
  { icon: Package, title: 'Stocks & Magasins', desc: 'Multi-magasins, mouvements, alertes rupture, valorisation au coût moyen pondéré.', color: 'bg-orange-500' },
  { icon: Building2, title: 'Comptabilité OHADA', desc: 'Plan SYSCOHADA pré-configuré, écritures double-partie, bilan, compte de résultat.', color: 'bg-purple-500' },
  { icon: Receipt, title: 'Transactions', desc: 'Journal des écritures avec équilibre débit/crédit, rapprochement bancaire.', color: 'bg-teal-500' },
  { icon: BarChart3, title: 'Rapports', desc: 'Compte de résultat, bilan, balance des comptes, déclaration TVA.', color: 'bg-indigo-500' },
  { icon: Smartphone, title: 'Banque & Mobile Money', desc: 'Intégration Orange Money, MTN MoMo, Wave, Moov Money. Relevé automatique.', color: 'bg-pink-500', premium: true },
  { icon: Bell, title: 'WhatsApp & Portail Client', desc: 'Envoi factures via WhatsApp, portail client en ligne, notifications automatiques.', color: 'bg-green-600', premium: true },
  { icon: Bot, title: 'IA Trésorerie & FX', desc: 'Prévisions de trésorerie par IA, alertes intelligentes, gestion du risque de change.', color: 'bg-violet-500', premium: true },
  { icon: ScanLine, title: 'OCR & Paie', desc: 'Numérisation factures par OCR, génération bulletins de paie, déclarations sociales.', color: 'bg-amber-500', premium: true },
];

const PLANS = [
  { id: 'starter', name: 'Starter', price: 9, features: ['Facturation illimitée', 'Gestion stocks', '2 utilisateurs', 'Support email'], color: 'border-gray-200 dark:border-surface-3' },
  { id: 'pro', name: 'Pro', price: 19, features: ['Tout Starter', 'Banque & Mobile Money', 'WhatsApp', 'Multi-magasin', '5 utilisateurs'], color: `border-[${GREEN}]`, popular: true },
  { id: 'premium', name: 'Premium', price: 69, features: ['Tout Pro', 'IA Trésorerie & FX', 'OHADA complet', 'OCR & Paie', 'Utilisateurs illimités'], color: 'border-blue-300 dark:border-blue-500/50' },
  { id: 'enterprise', name: 'Entreprise', price: 189, features: ['Tout Premium', 'Multi-société', 'API & intégrations', 'Support dédié 24/7', 'SLA 99.9%'], color: 'border-purple-300 dark:border-purple-500/50' },
];

const TESTIMONIALS = [
  { name: 'Aïssatou Diallo', role: 'Comptable, Dakar', text: 'LiBooks a transformé notre gestion. En 3 mois, nous avons divisé par 4 le temps de clôture mensuelle.', avatar: 'AD', color: 'bg-orange-500' },
  { name: 'Jean-Pierre Mbarga', role: 'Directeur, Yaoundé', text: 'Enfin un outil qui parle notre langue comptable. SYSCOHADA est natif, plus besoin de tableurs.', avatar: 'JM', color: 'bg-green-500' },
  { name: 'Fatou Ndiaye', role: 'Gérante, Abidjan', text: 'Le mode offline est un game-changer. Je facture même sans connexion, ça se synchronise tout seul.', avatar: 'FN', color: 'bg-blue-500' },
  { name: 'Kwame Mensah', role: 'CFO, Accra', text: 'L\'IA de trésorerie nous a alertés d\'un risque de rupture 3 semaines avant qu\'il arrive. Inestimable.', avatar: 'KM', color: 'bg-purple-500' },
];

const FAQS = [
  { q: 'LiBooks fonctionne-t-il hors connexion ?', a: 'Oui. L\'application est une PWA (Progressive Web App) avec mode offline-first. Vous pouvez créer factures, mouvements de stock et transactions sans connexion. Les données se synchronisent automatiquement dès le retour du réseau, avec déduplication par clés d\'idempotence.' },
  { q: 'Le plan comptable SYSCOHADA est-il inclus ?', a: 'Oui. Pour tous les pays OHADA (Cameroun, Sénégal, Côte d\'Ivoire, etc.), le plan SYSCOHADA révisé est pré-configuré automatiquement à la création du compte, avec plus de 40 comptes des classes 1 à 7.' },
  { q: 'Puis-je utiliser mon Mobile Money pour encaisser ?', a: 'Le module Banque & Mobile Money (forfait Pro et supérieur) intègre Orange Money, MTN MoMo, Wave et Moov Money. Les encaissements apparaissent automatiquement dans vos transactions.' },
  { q: 'Comment fonctionne la facturation ?', a: 'Vous bénéficiez d\'un essai gratuit de 7 jours sans carte bancaire. Ensuite, vous choisissez un forfait (Starter, Pro, Premium, Entreprise). Le paiement se fait via Stripe, en mensuel ou annuel (-20%). Vous pouvez changer de forfait à tout moment avec proration.' },
  { q: 'Mes données sont-elles sécurisées ?', a: 'Absolument. Chaque entreprise a ses données isolées par Row Level Security (RLS) PostgreSQL. Les super admins ont 2FA obligatoire. Toutes les actions sensibles sont journalisées dans un audit log. Vous pouvez exporter ou supprimer vos données à tout moment.' },
  { q: 'Puis-je gérer plusieurs sociétés ?', a: 'Le forfait Entreprise permet de gérer plusieurs sociétés depuis un seul compte, avec consolidation et tableau de bord multi-tenant.' },
];

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.unobserve(entry.target);
        }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-surface-0 transition-colors">
      {/* ===== NAVBAR ===== */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 dark:bg-surface-1/95 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className={`w-7 h-7 flex-shrink-0 text-[#10B981]`} />
            <span className={`text-lg font-bold tracking-tight ${scrolled ? 'text-[#0F2A3D] dark:text-white' : 'text-white'}`}>
              Li<span className={scrolled ? 'text-[#3B82F6]' : 'text-[#10B981]'}>Books</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#modules" className={`text-sm font-medium transition-colors hover:text-[#10B981] ${scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white/80'}`}>{t('landing.navModules')}</a>
            <a href="#pricing" className={`text-sm font-medium transition-colors hover:text-[#10B981] ${scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white/80'}`}>{t('landing.navPricing')}</a>
            <a href="#testimonials" className={`text-sm font-medium transition-colors hover:text-[#10B981] ${scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white/80'}`}>{t('landing.navTestimonials')}</a>
            <a href="#faq" className={`text-sm font-medium transition-colors hover:text-[#10B981] ${scrolled ? 'text-gray-700 dark:text-gray-300' : 'text-white/80'}`}>{t('landing.navFaq')}</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className={`p-2 rounded-lg transition-colors ${scrolled ? 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-2' : 'text-white/80 hover:bg-white/10'}`}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {/* Language selector */}
            <div className={`flex items-center rounded-lg overflow-hidden border text-xs font-semibold ${scrolled ? 'border-gray-200 dark:border-surface-3' : 'border-white/20'}`}>
              {['fr', 'en'].map(lang => (
                <button
                  key={lang}
                  onClick={() => i18n.changeLanguage(lang)}
                  className={`px-3 py-1.5 transition-all ${i18n.language === lang
                    ? 'bg-[#10B981] text-white'
                    : scrolled ? 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-2' : 'text-white/60 hover:bg-white/10'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
            <Link to="/login" className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${scrolled ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-surface-2' : 'text-white/90 hover:bg-white/10'}`}>
              {t('landing.navLogin')}
            </Link>
            <Link to="/signup" className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white shadow-lg hover:shadow-xl transition-all hover:scale-105" style={{ background: GREEN }}>
              {t('landing.navSignup')}
            </Link>
          </div>

          <button onClick={() => setMobileMenu(!mobileMenu)} className={`md:hidden p-2 ${scrolled ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenu && (
          <div className="md:hidden bg-white dark:bg-surface-1 border-t border-gray-100 dark:border-surface-3 px-4 py-4 space-y-3">
            <a href="#modules" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-200 py-2">{t('landing.navModules')}</a>
            <a href="#pricing" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-200 py-2">{t('landing.navPricing')}</a>
            <a href="#testimonials" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-200 py-2">{t('landing.navTestimonials')}</a>
            <a href="#faq" onClick={() => setMobileMenu(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-200 py-2">{t('landing.navFaq')}</a>
            <div className="flex items-center gap-2 py-2">
              <button onClick={toggleTheme} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              </button>
              <div className="flex items-center rounded-lg overflow-hidden border border-gray-200 dark:border-surface-3 text-xs font-semibold">
                {['fr', 'en'].map(lang => (
                  <button key={lang} onClick={() => { i18n.changeLanguage(lang); setMobileMenu(false); }}
                    className={`px-3 py-1.5 transition-all ${i18n.language === lang ? 'bg-[#10B981] text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <Link to="/login" className="block text-sm font-medium text-gray-700 dark:text-gray-200 py-2">{t('landing.navLogin')}</Link>
            <Link to="/signup" className="block text-center text-sm font-semibold px-5 py-2.5 rounded-xl text-white" style={{ background: GREEN }}>{t('landing.navSignup')}</Link>
          </div>
        )}
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex items-center overflow-hidden" style={{ background: NAVY }}>
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-20 blur-3xl animate-pulse" style={{ background: GREEN }} />
          <div className="absolute top-1/2 -left-40 w-96 h-96 rounded-full opacity-10 blur-3xl animate-pulse" style={{ background: '#3B82F6', animationDelay: '1s' }} />
          <div className="absolute -bottom-40 right-1/3 w-96 h-96 rounded-full opacity-10 blur-3xl animate-pulse" style={{ background: GREEN, animationDelay: '2s' }} />
        </div>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `linear-gradient(${'white'} 1px, transparent 1px), linear-gradient(90deg, ${'white'} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-0 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 mb-6 animate-fade-in">
              <Sparkles className="w-4 h-4" style={{ color: GREEN }} />
              <span className="text-sm text-white/90 font-medium">{t('landing.heroBadge')}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
              {t('landing.heroTitle')}<br />
              <span style={{ color: GREEN }}>{t('landing.heroTitleAccent')}</span>
            </h1>

            <p className="text-lg text-white/70 mb-8 max-w-lg leading-relaxed">
              {t('landing.heroSub')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link to="/signup" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-white text-base font-semibold shadow-xl hover:shadow-2xl transition-all hover:scale-105" style={{ background: GREEN }}>
                {t('landing.heroCta')}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#modules" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white text-base font-semibold hover:bg-white/15 transition-all">
                {t('landing.heroDiscover')}
              </a>
            </div>

            <div className="flex items-center gap-6 text-sm text-white/60">
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4" style={{ color: GREEN }} /> {t('landing.heroFree')}</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4" style={{ color: GREEN }} /> {t('landing.heroNoCc')}</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4" style={{ color: GREEN }} /> FR / EN</div>
            </div>
          </div>

          {/* Hero visual: Dashboard mockup */}
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl bg-white dark:bg-surface-1 shadow-2xl overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
              {/* Mock browser bar */}
              <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-50 dark:bg-surface-2 border-b border-gray-100 dark:border-surface-3">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="ml-3 text-xs text-gray-400 dark:text-gray-500 font-mono">app.liafrikbooks.com/dashboard</div>
              </div>
              {/* Mock content */}
              <div className="p-5 bg-gray-50 dark:bg-surface-0">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[['Chiffre d\'affaires', '12.4M FCFA', GREEN], ['Achats', '5.1M FCFA', '#F97316'], ['Créances', '2.3M FCFA', '#3B82F6'], ['Dettes', '1.8M FCFA', '#EF4444']].map(([label, val, c]) => (
                    <div key={label as string} className="bg-white dark:bg-surface-1 rounded-xl p-4 border border-gray-100 dark:border-surface-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                      <p className="text-lg font-bold" style={{ color: c as string }}>{val}</p>
                    </div>
                  ))}
                </div>
                {/* Mock chart */}
                <div className="bg-white dark:bg-surface-1 rounded-xl p-4 border border-gray-100 dark:border-surface-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Évolution mensuelle</p>
                  <div className="flex items-end gap-2 h-32">
                    {[40, 55, 45, 70, 60, 85, 75, 95].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t transition-all duration-700 hover:opacity-80" style={{ height: `${h}%`, background: i % 2 === 0 ? GREEN : '#3B82F6', transitionDelay: `${i * 80}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 bg-white dark:bg-surface-1 rounded-2xl shadow-xl p-4 flex items-center gap-3 animate-bounce" style={{ animationDuration: '3s' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GREEN }}>
                <Wifi className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Mode offline</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Synchronisé automatiquement</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 text-white/40" />
        </div>
      </section>

      {/* ===== STATS BAR ===== */}
      <section className="py-12 bg-white dark:bg-surface-0 border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { value: '2 500+', label: 'Entreprises' },
            { value: '54', label: 'Pays supportés' },
            { value: '1.2M+', label: 'Factures émises' },
            { value: '99.9%', label: 'Disponibilité' },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="text-center">
                <p className="text-3xl lg:text-4xl font-bold" style={{ color: NAVY }}>{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== PENSÉ POUR L'AFRIQUE ===== */}
      <section className="py-20 bg-gray-50 dark:bg-surface-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-14">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4" style={{ background: `${GREEN}15`, color: GREEN }}>
                Pensé pour l'Afrique
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Conçu sur le terrain, pas en Silicon Valley
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                Chaque fonctionnalité est née d'un besoin réel d'entrepreneurs africains.
                De Dakar à Nairobi, d'Abidjan à Accra.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Globe, title: '29 pays, 54 supportés', desc: 'Cameroun, Sénégal, Côte d\'Ivoire, Nigeria, Kenya, Ghana, et plus. Régions, villes, devises, taux de TVA — tout est pré-configuré.' },
              { icon: Wifi, title: 'Offline-first', desc: 'Connexion instable ? Aucun problème. Créez factures et mouvements hors ligne. La synchronisation est automatique au retour du réseau.' },
              { icon: Smartphone, title: 'Mobile Money natif', desc: 'Orange Money, MTN MoMo, Wave, Moov Money. Encaissez, suivez, rapprochez — sans quitter l\'application.' },
              { icon: Shield, title: 'OHADA natif', desc: 'Plan SYSCOHADA révisé pré-configuré. Bilan, compte de résultat, déclarations — conformes aux normes africaines.' },
              { icon: Languages, title: 'Bilingue FR / EN', desc: 'Interface, emails, PDFs — tout en français et en anglais. Basculez en un clic, pour toute l\'équipe.' },
              { icon: Zap, title: 'Rapide & léger', desc: 'PWA installable, moins de 3MB. Fonctionne sur smartphone, tablette, ordinateur. Même sur un Samsung A10.' },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 100}>
                <div className="bg-white dark:bg-surface-1 rounded-2xl p-6 border border-gray-100 dark:border-surface-3 hover:shadow-lg transition-all hover:-translate-y-1 group h-full">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ background: `${GREEN}15` }}>
                    <f.icon className="w-6 h-6" style={{ color: GREEN }} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MODULES ===== */}
      <section id="modules" className="py-20 bg-white dark:bg-surface-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-14">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4" style={{ background: `${NAVY}10`, color: NAVY }}>
                Modules
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Tout ce dont votre entreprise a besoin
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                De la facturation à l'IA trésorerie, un seul abonnement, une seule interface.
              </p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m, i) => (
              <Reveal key={m.title} delay={(i % 3) * 100}>
                <div className="bg-white dark:bg-surface-1 rounded-2xl p-6 border border-gray-100 dark:border-surface-3 hover:shadow-xl transition-all hover:-translate-y-1 h-full relative">
                  {m.premium && (
                    <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${GREEN}15`, color: GREEN }}>
                      Premium
                    </span>
                  )}
                  <div className={`w-12 h-12 ${m.color} rounded-xl flex items-center justify-center mb-4`}>
                    <m.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{m.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{m.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-20 bg-gray-50 dark:bg-surface-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4" style={{ background: `${GREEN}15`, color: GREEN }}>
                Tarifs
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Des forfaits pour chaque taille
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-8">
                7 jours d'essai gratuit. Sans carte bancaire. Changez de forfait à tout moment.
              </p>

              {/* Billing toggle */}
              <div className="inline-flex items-center gap-3 p-1.5 bg-white dark:bg-surface-1 rounded-xl border border-gray-200 dark:border-surface-3">
                <button onClick={() => setAnnual(false)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${!annual ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} style={!annual ? { background: GREEN } : {}}>
                  {t('landing.monthly')}
                </button>
                <button onClick={() => setAnnual(true)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${annual ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} style={annual ? { background: GREEN } : {}}>
                  {t('landing.annual')}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${annual ? 'bg-white/20' : 'bg-green-100 text-green-700'}`}>-20%</span>
                </button>
              </div>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan, i) => {
              const price = annual ? Math.round(plan.price * 12 * 0.8) : plan.price;
              return (
                <Reveal key={plan.id} delay={i * 100}>
                  <div className={`relative bg-white dark:bg-surface-1 rounded-2xl border-2 p-6 h-full flex flex-col ${plan.popular ? 'shadow-xl scale-105' : 'shadow-sm'} ${plan.color}`}>
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-4 py-1 rounded-full text-white" style={{ background: GREEN }}>
                        Populaire
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
                    <div className="mb-4">
                      <span className="text-4xl font-bold" style={{ color: NAVY }}>${price}</span>
                      <span className="text-sm text-gray-400">/{annual ? t('onboarding.perYear').replace('/', '') : t('onboarding.perMonth').replace('/', '')}</span>
                    </div>
                    <ul className="space-y-2.5 mb-6 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: GREEN }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link to="/signup" className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all ${plan.popular ? 'text-white hover:opacity-90' : 'border-2 hover:bg-gray-50 dark:hover:bg-surface-2'}`} style={plan.popular ? { background: GREEN } : { borderColor: NAVY, color: NAVY }}>
                      {t('landing.choosePlan')} {plan.name}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-6">
            Facturation annuelle avec 20% de réduction. Paiement sécurisé via Stripe.
          </p>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-20 bg-white dark:bg-surface-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-14">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4" style={{ background: `${NAVY}10`, color: NAVY }}>
                Témoignages
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Ils gèrent leur entreprise avec LiBooks
              </h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6">
            {TESTIMONIALS.map((tm, i) => (
              <Reveal key={tm.name} delay={(i % 2) * 100}>
                <div className="bg-gray-50 dark:bg-surface-2 rounded-2xl p-7 h-full border border-gray-100 dark:border-surface-3 hover:shadow-lg transition-all">
                  <Quote className="w-8 h-8 mb-4 opacity-20" style={{ color: NAVY }} />
                  <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-6 italic">"{tm.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 ${tm.color} rounded-full flex items-center justify-center text-white font-bold`}>
                      {tm.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{tm.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{tm.role}</p>
                    </div>
                    <div className="ml-auto flex gap-0.5">
                      {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-current" style={{ color: GREEN }} />)}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-20 bg-gray-50 dark:bg-surface-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <Reveal>
            <div className="text-center mb-12">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4" style={{ background: `${GREEN}15`, color: GREEN }}>
                FAQ
              </span>
              <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                Questions fréquentes
              </h2>
            </div>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 50}>
                <div className="bg-white dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3 overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96' : 'max-h-0'}`}>
                    <p className="px-5 pb-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-20" style={{ background: NAVY }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Reveal>
            <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
              {t('landing.ctaTitle')}
            </h2>
            <p className="text-lg text-white/70 mb-8 max-w-xl mx-auto">
              {t('landing.ctaSub')}
            </p>
            <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white text-lg font-semibold shadow-xl hover:shadow-2xl transition-all hover:scale-105" style={{ background: GREEN }}>
              {t('landing.ctaButton')}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <p className="text-sm text-white/50 mt-4">{t('landing.ctaNote')}</p>
          </Reveal>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-gray-900 dark:bg-surface-0 text-white pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <BookOpen className="w-7 h-7 text-[#10B981]" />
                <span className="text-lg font-bold">Li<span className="text-[#10B981]">Books</span></span>
              </Link>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                {t('landing.footerTagline')}
              </p>
              <div className="flex gap-3">
                {[Facebook, Twitter, Linkedin, Youtube].map((Icon, i) => (
                  <a key={i} href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                    <Icon className="w-4 h-4 text-gray-400" />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-4 text-white">{t('landing.footerProduct')}</h4>
              <ul className="space-y-2.5">
                {['Facturation', 'Stocks & Magasins', 'Comptabilité OHADA', 'Mobile Money', 'IA Trésorerie'].map(l => (
                  <li key={l}><a href="#modules" className="text-sm text-gray-400 hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-4 text-white">{t('landing.footerResources')}</h4>
              <ul className="space-y-2.5">
                <li><Link to="/about" className="text-sm text-gray-400 hover:text-white transition-colors">À propos</Link></li>
                <li><Link to="/contact" className="text-sm text-gray-400 hover:text-white transition-colors">Contact & Support</Link></li>
                <li><Link to="/legal" className="text-sm text-gray-400 hover:text-white transition-colors">Mentions légales</Link></li>
                <li><Link to="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">Politique de confidentialité</Link></li>
                <li><Link to="/terms" className="text-sm text-gray-400 hover:text-white transition-colors">Conditions d'utilisation</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-4 text-white">{t('landing.footerContact')}</h4>
              <ul className="space-y-2.5">
                <li className="flex items-center gap-2 text-sm text-gray-400"><Mail className="w-4 h-4" /> info@liafrik.com</li>
                <li className="flex items-center gap-2 text-sm text-gray-400"><Mail className="w-4 h-4" /> support@liafrik.com</li>
                <li className="flex items-center gap-2 text-sm text-gray-400"><MapPin className="w-4 h-4" /> Dubaï, EAU & Yaoundé, Cameroun</li>
              </ul>
            </div>
          </div>

          {/* LIYAH GROUP identity banner */}
          <div className="py-6 border-t border-white/10">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-300 font-medium">
                LiBooks est développé par <span className="text-white font-bold">LIYAH GROUP</span> — Dubaï 🇦🇪 & Yaoundé 🇨🇲
              </p>
              <p className="text-xs text-gray-500">
                Un pont entre l'innovation internationale et l'ancrage africain.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">{t('landing.footerRights')}</p>
            <div className="flex items-center gap-6">
              <Link to="/privacy" className="text-sm text-gray-500 hover:text-white transition-colors">{t('landing.footerPrivacy')}</Link>
              <Link to="/terms" className="text-sm text-gray-500 hover:text-white transition-colors">{t('landing.footerTerms')}</Link>
              <div className="flex items-center gap-1 rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
                {['fr', 'en'].map(lang => (
                  <button key={lang} onClick={() => i18n.changeLanguage(lang)}
                    className={`px-3 py-1.5 transition-all ${i18n.language === lang ? 'bg-[#10B981] text-white' : 'text-gray-500 hover:text-white'}`}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
