import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';
import logo from '../../assets/logo.png';
import ThemeToggle from '../../components/ui/ThemeToggle';
import { usePageMeta } from '../../lib/usePageMeta';

export default function CookiePolicyPage() {
  usePageMeta('Politique de cookies', "Politique de cookies de LiBooks : quels cookies nous utilisons, pourquoi, et comment les gérer.");
  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="LiBooks" className="w-7 h-7 text-[#0057D9]" />
            <span className="text-lg text-gray-900 dark:text-white font-bold">Li</span><span className="text-[#0057D9] text-lg text-gray-900 dark:text-white font-medium">Books</span>
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex items-center gap-3 mb-3">
          <Cookie className="w-8 h-8 text-[#0057D9]" />
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Politique de cookies</h1>
        </div>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : janvier 2026</p>

        <div className="space-y-8 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Qu'est-ce qu'un cookie ?</h2>
            <p>
              Un cookie est un petit fichier texte déposé sur votre appareil lors de la visite d'un site web.
              Il permet de faire fonctionner le site, de mémoriser vos préférences ou d'analyser l'usage de la plateforme.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Les cookies que nous utilisons</h2>
            <p>LiBooks utilise exclusivement les catégories de cookies suivantes :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Cookies strictement nécessaires</strong> : session d'authentification, sécurité (protection CSRF), fonctionnement du panier d'abonnement.</li>
              <li><strong className="text-gray-900 dark:text-white">Cookies de préférence</strong> : langue choisie, thème clair/sombre.</li>
              <li><strong className="text-gray-900 dark:text-white">Cookies de mesure d'audience</strong> (optionnels, avec consentement) : statistiques d'usage agrégées et anonymisées.</li>
            </ul>
            <p className="mt-2">
              Aucun cookie publicitaire ni de tracking tiers à des fins commerciales n'est déposé sans votre consentement explicite.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Durée de conservation</h2>
            <p>
              Les cookies de session expirent à la fermeture du navigateur. Les cookies de préférence et de mesure
              d'audience sont conservés au maximum 13 mois, conformément aux recommandations en matière de protection des données.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Comment gérer vos cookies</h2>
            <p>
              Vous pouvez à tout moment configurer votre navigateur pour refuser les cookies non essentiels ou être averti
              avant leur dépôt. Le refus des cookies non essentiels n'empêche pas l'utilisation de LiBooks ; seuls les
              cookies strictement nécessaires au fonctionnement du service ne peuvent pas être désactivés.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Contact</h2>
            <p>
              Questions relatives aux cookies : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a>
            </p>
          </section>
        </div>
      </div>

      <footer className="border-t border-gray-100 dark:border-surface-3 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-gray-400">
            LiBooks est développé par <span className="font-medium text-gray-600 dark:text-gray-300">LiAfrik</span> — Dubaï & Yaoundé
          </p>
          <p className="text-xs text-gray-400 mt-1">© {new Date().getFullYear()} LiAfrik. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
