import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import logo from '../../assets/logo.png';
import ThemeToggle from '../../components/ui/ThemeToggle';
import { usePageMeta } from '../../lib/usePageMeta';

export default function PrivacyPage() {
  usePageMeta('Politique de confidentialité', "Politique de confidentialité de LiBooks : comment nous collectons, utilisons et protégeons vos données, en conformité avec le RGPD et les législations locales.");
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
          <Shield className="w-8 h-8 text-[#0057D9]" />
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Politique de confidentialité</h1>
        </div>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : janvier 2026</p>

        <div className="space-y-8 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Responsable du traitement</h2>
            <p>
              LiAfrik (Dubaï, EAU & Yaoundé, Cameroun) est responsable du traitement des données
              personnelles collectées sur la plateforme LiBooks. Pour toute question :
              <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline"> info@liafrik.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Données collectées</h2>
            <p>Nous collectons les données suivantes :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Compte utilisateur</strong> : email, mot de passe (chiffré), nom de l'entreprise.</li>
              <li><strong className="text-gray-900 dark:text-white">Données métier</strong> : factures, clients, fournisseurs, stock, transactions — saisies par l'utilisateur.</li>
              <li><strong className="text-gray-900 dark:text-white">Données techniques</strong> : adresse IP, type de navigateur, logs d'usage à des fins de sécurité.</li>
              <li><strong className="text-gray-900 dark:text-white">Préférences</strong> : langue, thème (clair/sombre), paramètres d'affichage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Finalités du traitement</h2>
            <p>Les données sont traitées pour :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Fournir le service de comptabilité et de facturation LiBooks.</li>
              <li>Permettre la gestion multi-utilisateurs et le contrôle d'accès par tenant.</li>
              <li>Générer les documents comptables (factures, rapports, PDF).</li>
              <li>Assurer le support technique et la maintenance.</li>
              <li>Améliorer la plateforme (analytics agrégés, anonymisés).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Base légale</h2>
            <p>
              Le traitement est fondé sur l'exécution du contrat (Article 6.1.b du RGPD) pour les données
              nécessaires au fonctionnement du service, et sur le consentement (Article 6.1.a) pour les
              données optionnelles (analytics, communications marketing).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Durée de conservation</h2>
            <p>
              Les données métier (factures, comptes, transactions) sont conservées pendant toute la durée
              d'utilisation du service, plus 10 ans après la clôture du compte, conformément aux obligations
              comptables OHADA. Les données techniques (logs) sont conservées 12 mois maximum.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Sécurité</h2>
            <p>
              Les données sont chiffrées au repos et en transit (TLS 1.3). L'accès aux données est protégé
              par des politiques de Row Level Security (RLS) au niveau base de données. Les mots de passe
              sont hachés avec bcrypt. Les clés API et secrets ne sont jamais exposés côté client.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">7. Conformité RGPD (Union Européenne)</h2>
            <p>
              Pour nos clients européens, LiBooks se conforme au Règlement Général sur la Protection
              des Données (RGPD — Règlement UE 2016/679). Vous disposez des droits suivants :
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Droit d'accès</strong> : obtenir une copie de vos données.</li>
              <li><strong className="text-gray-900 dark:text-white">Droit de rectification</strong> : corriger des données inexactes.</li>
              <li><strong className="text-gray-900 dark:text-white">Droit à l'effacement</strong> (« droit à l'oubli »).</li>
              <li><strong className="text-gray-900 dark:text-white">Droit à la portabilité</strong> : exporter vos données dans un format structuré.</li>
              <li><strong className="text-gray-900 dark:text-white">Droit d'opposition</strong> : vous opposer au traitement pour des raisons légitimes.</li>
            </ul>
            <p className="mt-2">
              Pour exercer ces droits : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a>.
              Vous pouvez également déposer une plainte auprès de votre CNIL nationale.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">8. Conformité aux législations locales de protection des données</h2>
            <p>
              Au-delà du RGPD, LiBooks respecte les lois de protection des données en vigueur dans les pays
              où le service est disponible, notamment :
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Cameroun</strong> : Loi n° 2023/014 du 12 juillet 2023 relative à la protection des données personnelles.</li>
              <li><strong className="text-gray-900 dark:text-white">CEMAC</strong> : Directive n° 03/19/CEMAC/CM du 21 décembre 2019.</li>
              <li><strong className="text-gray-900 dark:text-white">Nigeria</strong> : Nigeria Data Protection Act (NDPA) 2023.</li>
              <li><strong className="text-gray-900 dark:text-white">Kenya</strong> : Data Protection Act 2019.</li>
              <li><strong className="text-gray-900 dark:text-white">Afrique du Sud</strong> : Protection of Personal Information Act (POPIA).</li>
            </ul>
            <p className="mt-2">
              Pour les pays non listés, LiBooks applique des standards de protection équivalents.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">9. Transferts de données hors UE/CEE</h2>
            <p>
              Les données peuvent être traitées depuis Dubaï (EAU) dans le cadre du développement et de la
              maintenance de la plateforme. LiAfrik garantit un niveau de protection adéquat conformément
              aux garanties appropriées prévues par le RGPD (clauses contractuelles types, mesures techniques
              et organisationnelles).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">10. Cookies</h2>
            <p>
              LiBooks utilise uniquement des cookies essentiels au fonctionnement (session d'authentification,
              préférence de langue et de thème). Aucun cookie publicitaire ou de tracking tiers n'est utilisé.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">11. Contact</h2>
            <p>
              Questions relatives à la protection des données : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a><br />
              Support technique : <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>
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
