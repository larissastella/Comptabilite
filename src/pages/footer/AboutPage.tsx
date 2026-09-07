import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Target, Sparkles, Globe2, Heart, ArrowLeft, CheckCircle } from 'lucide-react';
import logo from '../../assets/logo.png';
import ThemeToggle from '../../components/ui/ThemeToggle';
import { usePageMeta } from '../../lib/usePageMeta';

const VALUES_FR = [
  { title: 'Mobile-first', desc: "Beaucoup de nos marchés avancent au smartphone avant le desktop. Notre interface est pensée pour les écrans tactiles et les connexions limitées." },
  { title: 'Offline-first', desc: 'Pas de réseau ? Vos factures et ventes sont enregistrées localement et synchronisées dès le retour de la connexion.' },
  { title: 'Conformité OHADA', desc: 'Plan comptable SYSCOHADA intégré, formats de factures conformes, états financiers prêts pour le commissariat aux comptes.' },
  { title: 'Souveraineté des données', desc: 'Vos données restent les vôtres. Hébergement sécurisé, export complet à tout moment, aucune revente.' },
];
const VALUES_EN = [
  { title: 'Mobile-first', desc: "Many of our markets move on smartphones before desktops. Our interface is built for touchscreens and limited connectivity." },
  { title: 'Offline-first', desc: 'No network? Your invoices and sales are saved locally and synced the moment your connection comes back.' },
  { title: 'OHADA compliance', desc: 'Built-in SYSCOHADA chart of accounts, compliant invoice formats, financial statements ready for statutory audit.' },
  { title: 'Data sovereignty', desc: 'Your data stays yours. Secure hosting, a full export available at any time, never resold.' },
];
const STATS_FR = [
  { value: '97', label: 'Pays supportés' },
  { value: '70', label: 'Devises supportées' },
  { value: '100%', label: 'Offline-first' },
  { value: 'SYSCOHADA', label: 'Conformité OHADA' },
];
const STATS_EN = [
  { value: '97', label: 'Countries supported' },
  { value: '70', label: 'Currencies supported' },
  { value: '100%', label: 'Offline-first' },
  { value: 'SYSCOHADA', label: 'OHADA compliance' },
];

export default function AboutPage() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  usePageMeta(
    isEn ? 'About' : 'À propos',
    isEn
      ? "LiBooks is built by LiAfrik, a technology group with a dual Dubai and Africa presence. Discover our story and our mission."
      : "LiBooks est développé par LiAfrik, un groupe technologique à double présence Dubaï et Afrique. Découvrez notre histoire et notre mission."
  );
  const values = isEn ? VALUES_EN : VALUES_FR;
  const stats = isEn ? STATS_EN : STATS_FR;
  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={isEn ? '/en' : '/'} className="flex items-center gap-2">
            <img src={logo} alt="LiBooks" className="w-7 h-7 text-[#0057D9]" />
            <span className="text-lg text-gray-900 dark:text-white font-bold">Li</span><span className="text-[#0057D9] text-lg text-gray-900 dark:text-white font-medium">Books</span>
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#0057D9]/10 dark:bg-[#0057D9]/20 rounded-full text-sm text-[#0057D9] font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            {isEn ? 'Our story' : 'Notre histoire'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {isEn ? 'Accounting, without borders.' : 'La comptabilité, sans frontières.'}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            {isEn
              ? "LiBooks was born from a simple observation: entrepreneurs, wherever they are, deserve digital tools as powerful as those used anywhere else in the world — built for their realities, their constraints and their ambitions."
              : "LiBooks est né d'un constat simple : les entrepreneurs, où qu'ils soient, méritent des outils numériques aussi performants que ceux utilisés partout ailleurs dans le monde — pensés pour leurs réalités, leurs contraintes et leurs ambitions."}
          </p>
        </div>

        {/* Mission */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#0057D9]/10 dark:bg-[#0057D9]/20 rounded-xl flex items-center justify-center">
              <Target className="w-5 h-5 text-[#0057D9]" />
            </div>
            <h2 className="text-xl font-medium text-gray-900 dark:text-white">{isEn ? 'Our mission' : 'Notre mission'}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            {isEn
              ? "Make accounting accessible to every business, from the smallest to the largest. We believe financial management shouldn't be an obstacle to growth — it's a lever. LiBooks combines SYSCOHADA invoicing, multi-store inventory management, an offline-first point of sale, and OHADA reporting in a single platform, accessible from a smartphone."
              : "Rendre la comptabilité accessible à toutes les entreprises, de la micro-entreprise au grand groupe. Nous croyons que la gestion financière ne devrait pas être un obstacle à la croissance — c'est un levier. LiBooks combine facturation SYSCOHADA, gestion de stock multi-magasin, point de vente offline-first et reporting OHADA dans une seule plateforme, accessible depuis un smartphone."}
          </p>
        </section>

        {/* Values */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#0057D9]/10 dark:bg-[#0057D9]/20 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-[#0057D9]" />
            </div>
            <h2 className="text-xl font-medium text-gray-900 dark:text-white">{isEn ? 'Our values' : 'Nos valeurs'}</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {values.map(v => (
              <div key={v.title} className="p-4 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle className="w-4 h-4 text-[#0057D9] flex-shrink-0" />
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{v.title}</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* LiAfrik */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#0057D9]/10 dark:bg-[#0057D9]/20 rounded-xl flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-[#0057D9]" />
            </div>
            <h2 className="text-xl font-medium text-gray-900 dark:text-white">{isEn ? 'LiAfrik — the publisher' : "LiAfrik — l'éditeur"}</h2>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-surface-1 dark:to-surface-2 rounded-2xl p-6 border border-gray-100 dark:border-surface-3">
            {isEn ? (
              <>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                  LiBooks is published by <strong className="text-gray-900 dark:text-white">LiAfrik</strong>,
                  a technology group with a dual presence in <strong className="text-gray-900 dark:text-white">Dubai (UAE)</strong> and
                  <strong className="text-gray-900 dark:text-white"> Africa</strong>. That dual anchor
                  is no accident — it's our identity.
                </p>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                  From Dubai, we draw on the global innovation ecosystem: cutting-edge technical standards,
                  cloud-native architecture, bank-grade security practices. From Africa, we stay deeply
                  connected to on-the-ground realities: power cuts, unstable connections, specific tax
                  compliance needs, and the massive use of Mobile Money and WhatsApp.
                </p>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  This bridge between international innovation and African roots shows up in every line of
                  LiBooks' code. We're proud to build a world-class product from Africa — and even prouder
                  that it now serves entrepreneurs everywhere.
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                  LiBooks est édité par <strong className="text-gray-900 dark:text-white">LiAfrik</strong>,
                  un groupe technologique à la double présence <strong className="text-gray-900 dark:text-white">Dubaï (EAU)</strong> et
                  <strong className="text-gray-900 dark:text-white"> Afrique</strong>. Cette double ancrage
                  n'est pas un hasard — c'est notre identité.
                </p>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                  De Dubaï, nous puisons dans l'écosystème d'innovation mondiale : standards techniques de pointe,
                  architectures cloud-native, pratiques de sécurité de niveau bancaire. D'Afrique, nous restons
                  profondément connectés aux réalités du terrain : coupures de courant, connexions
                  instables, besoins spécifiques de conformité fiscale, usage massif du Mobile Money et de WhatsApp.
                </p>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Ce pont entre l'innovation internationale et l'ancrage africain se reflète dans chaque ligne de
                  code de LiBooks. Nous sommes fiers de construire, depuis l'Afrique, un produit de classe
                  internationale — et encore plus fiers qu'il serve aujourd'hui des entrepreneurs partout dans le monde.
                </p>
              </>
            )}
          </div>
        </section>

        {/* Stats */}
        <section className="mb-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="text-center p-4 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3">
                <p className="text-2xl font-medium text-[#0057D9]">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0057D9] hover:bg-[#003F9E] text-white font-semibold rounded-xl transition-colors"
          >
            {isEn ? 'Start for free' : 'Commencer gratuitement'}
          </Link>
          <p className="text-xs text-gray-400 mt-3">{isEn ? '7-day free trial, no card required.' : "7 jours d'essai gratuit, sans carte bancaire."}</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-surface-3 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-gray-400">
            LiBooks {isEn ? 'is built by' : 'est développé par'} <span className="font-medium text-gray-600 dark:text-gray-300">LiAfrik</span> — Dubai & Yaoundé
          </p>
          <p className="text-xs text-gray-400 mt-1">© {new Date().getFullYear()} LiAfrik. {isEn ? 'All rights reserved.' : 'Tous droits réservés.'}</p>
        </div>
      </footer>
    </div>
  );
}
