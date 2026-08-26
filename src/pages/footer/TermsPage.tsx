import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logo from '../../assets/logo.png';
import ThemeToggle from '../../components/ui/ThemeToggle';
import { usePageMeta } from '../../lib/usePageMeta';

export default function TermsPage() {
  usePageMeta("Conditions générales d'utilisation", "Conditions générales d'utilisation de LiBooks.");
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
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Conditions d'utilisation & CGV</h1>
        <p className="text-sm text-gray-400 mb-10">Dernière mise à jour : janvier 2026</p>

        <div className="space-y-8 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Objet</h2>
            <p>
              Les présentes Conditions Générales d'Utilisation (CGU) et Conditions Générales de Vente (CGV)
              régissent l'utilisation de la plateforme LiBooks, éditée par LiAfrik (Dubaï, EAU &
              Yaoundé, Cameroun). En créant un compte, vous acceptez sans réserve les présentes conditions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Définitions</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Plateforme</strong> : l'application LiBooks accessible via le web.</li>
              <li><strong className="text-gray-900 dark:text-white">Utilisateur</strong> : toute personne physique ou morale ayant créé un compte.</li>
              <li><strong className="text-gray-900 dark:text-white">Forfait</strong> : l'abonnement souscrit (Starter, Pro, Premium, Entreprise).</li>
              <li><strong className="text-gray-900 dark:text-white">Essai gratuit</strong> : période d'essai de 7 jours sans carte bancaire.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Compte utilisateur</h2>
            <p>
              La création de compte nécessite une adresse email valide et un mot de passe. L'utilisateur est
              responsable de la confidentialité de ses identifiants. LiAfrik se réserve le droit de
              suspendre un compte en cas d'usage frauduleux ou contraire aux présentes conditions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Forfaits et tarifs</h2>
            <p>LiBooks propose 4 forfaits d'abonnement :</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li><strong className="text-gray-900 dark:text-white">Starter</strong> — 9 $/mois : facturation, stock de base, 2 utilisateurs.</li>
              <li><strong className="text-gray-900 dark:text-white">Pro</strong> — 19 $/mois : banque & Mobile Money, WhatsApp, multi-magasin, 5 utilisateurs.</li>
              <li><strong className="text-gray-900 dark:text-white">Premium</strong> — 69 $/mois : IA trésorerie, OHADA complet, OCR, utilisateurs illimités.</li>
              <li><strong className="text-gray-900 dark:text-white">Entreprise</strong> — 189 $/mois : multi-société, API, support dédié 24/7.</li>
            </ul>
            <p className="mt-2">
              Une réduction de 20 % est appliquée pour la facturation annuelle. Les prix sont indiqués en
              dollars américains (USD) et sont susceptibles d'être révisés avec un préavis de 30 jours.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Essai gratuit</h2>
            <p>
              Tout nouvel utilisateur bénéficie d'un essai gratuit de 7 jours, donnant accès à l'ensemble des
              fonctionnalités du forfait sélectionné. Aucune carte bancaire n'est requise pour s'inscrire.
              À l'expiration de l'essai, le compte passe en mode lecture seule : les données restent
              accessibles en consultation, mais la création et la modification sont suspendues jusqu'à la
              souscription d'un abonnement payant.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Souscription et paiement</h2>
            <p>
              Le paiement de l'abonnement s'effectue via Stripe, prestataire de paiement sécurisé. Les
              moyens de paiement acceptés sont les cartes bancaires (Visa, Mastercard, Amex) et, selon la
              région, le Mobile Money. Le paiement est prélevé mensuellement ou annuellement selon le cycle
              choisi. La facture est disponible dans l'espace utilisateur.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">7. Résiliation</h2>
            <p>
              L'utilisateur peut résilier son abonnement à tout moment depuis l'espace Paramètres → Facturation.
              La résiliation prend effet à la fin de la période de facturation en cours. Aucun remboursement
              n'est accordé pour les périodes déjà facturées. Après résiliation, les données restent
              accessibles pendant 90 jours, puis sont définitivement supprimées, sauf demande contraire.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">8. Responsabilités de l'utilisateur</h2>
            <ul className="space-y-1 list-disc list-inside">
              <li>L'utilisateur s'engage à saisir des données comptables exactes et conformes à la législation applicable.</li>
              <li>L'utilisateur est responsable de la sauvegarde de ses données (LiBooks fournit un export complet).</li>
              <li>L'utilisateur s'interdit de tenter de compromettre la sécurité de la plateforme.</li>
              <li>L'utilisation à des fins illégales (blanchiment, fraude fiscale) entraîne la suspension immédiate du compte.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">9. Responsabilités de LiAfrik</h2>
            <p>
              LiAfrik s'engage à fournir un service disponible à 99,9 % (hors maintenance planifiée).
              En cas de panne, le support est joignable à <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>.
              LiAfrik ne saurait être tenu responsable des décisions comptables ou fiscales prises sur
              la base des informations fournies par la plateforme. Celles-ci sont fournies à titre indicatif.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">10. Propriété intellectuelle</h2>
            <p>
              La plateforme, son code, son design et le plan comptable SYSCOHADA intégré sont la propriété
              de LiAfrik. Les données saisies par l'utilisateur restent sa propriété exclusive.
              L'utilisateur conserve un droit d'export permanent de ses données.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">11. Confidentialité</h2>
            <p>
              Le traitement des données personnelles est décrit dans notre
              <Link to="/privacy" className="text-[#0057D9] hover:underline"> Politique de confidentialité</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">12. Modification des conditions</h2>
            <p>
              LiAfrik se réserve le droit de modifier les présentes conditions. Les utilisateurs seront
              notifiés par email au moins 30 jours avant l'entrée en vigueur des modifications substantielles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">13. Droit applicable</h2>
            <p>
              Les présentes conditions sont régies par le droit camerounais. En cas de litige, les parties
              s'efforceront de trouver une solution amiable. À défaut, les tribunaux de Yaoundé (Cameroun)
              seront seuls compétents.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">14. Contact</h2>
            <p>
              Informations générales : <a href="mailto:info@liafrik.com" className="text-[#0057D9] hover:underline">info@liafrik.com</a><br />
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
