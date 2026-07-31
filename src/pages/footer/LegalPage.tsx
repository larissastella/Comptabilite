import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft } from 'lucide-react';
import ThemeToggle from '../../components/ui/ThemeToggle';

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-[#0057D9]" />
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
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Mentions légales</h1>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : janvier 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-gray-600 dark:text-gray-400">
          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Éditeur de la plateforme</h2>
            <p>La plateforme LiBooks est éditée par :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">LiAfrik</strong></li>
              <li>Dubaï, Émirats Arabes Unis</li>
              <li>Yaoundé, Cameroun</li>
              <li>Email : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Directeur de la publication</h2>
            <p>Le directeur de la publication est le représentant légal de LiAfrik.</p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Hébergement</h2>
            <p>
              La plateforme est hébergée sur des infrastructures cloud sécurisées. Les données sont stockées
              au sein de l'Union Européenne avec réplication sécurisée. L'hébergeur garantit la disponibilité
              et la sécurité des données conformément aux standards de l'industrie.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Propriété intellectuelle</h2>
            <p>
              L'ensemble des contenus présents sur la plateforme LiBooks (textes, logos, graphismes,
              logiciels, interfaces, plan comptable SYSCOHADA intégré) est la propriété exclusive de LiAfrik,
              sauf mention contraire. Toute reproduction, représentation, modification ou exploitation,
              totale ou partielle, sans autorisation écrite préalable est interdite.
            </p>
            <p className="mt-2">
              Les noms commerciaux, marques et logos LiAfrik et LiBooks sont protégés.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Responsabilité</h2>
            <p>
              LiAfrik s'efforce de fournir une plateforme accessible et fonctionnelle 24h/24, mais ne
              saurait être tenue responsable des interruptions de service dues à des événements de force
              majeure, des pannes de réseau ou des opérations de maintenance.
            </p>
            <p className="mt-2">
              Les informations comptables et fiscales fournies par la plateforme le sont à titre indicatif
              et ne remplacent pas l'expertise d'un comptable ou commissaire aux comptes agréé.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Liens hypertextes</h2>
            <p>
              La plateforme peut contenir des liens vers des sites tiers. LiAfrik n'exerce aucun contrôle
              sur ces sites et décline toute responsabilité quant à leur contenu.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">7. Contact</h2>
            <p>
              Pour toute question relative aux mentions légales : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a>
            </p>
            <p className="mt-1">
              Pour le support technique : <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>
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
