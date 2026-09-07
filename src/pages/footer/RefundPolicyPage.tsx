import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Receipt } from 'lucide-react';
import logo from '../../assets/logo.png';
import ThemeToggle from '../../components/ui/ThemeToggle';
import { usePageMeta } from '../../lib/usePageMeta';

export default function RefundPolicyPage() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === 'en';
  usePageMeta(
    isEn ? 'Refund Policy' : 'Politique de remboursement',
    isEn
      ? "LiBooks' refund policy: conditions, timelines and how subscription refunds work."
      : "Politique de remboursement de LiBooks : conditions, délais et modalités de remboursement des abonnements."
  );
  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
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
        <div className="flex items-center gap-3 mb-3">
          <Receipt className="w-8 h-8 text-[#0057D9]" />
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{isEn ? 'Refund Policy' : 'Politique de remboursement'}</h1>
        </div>
        <p className="text-sm text-gray-400 mb-10">{isEn ? 'Last updated: January 2026' : 'Dernière mise à jour : janvier 2026'}</p>

        {isEn ? (
          <div className="space-y-8 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. General principle</h2>
              <p>
                LiBooks is a digital subscription service granting immediate access to the platform upon
                activation. Except where mandatory local law requires otherwise, subscription periods already
                billed are non-refundable.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. When a refund applies</h2>
              <p>A full or partial refund may be granted in the following cases:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong className="text-gray-900 dark:text-white">Duplicate billing</strong> or a technical payment error caused by LiBooks.</li>
                <li><strong className="text-gray-900 dark:text-white">Extended unavailability</strong> of the service (beyond our stated uptime commitments).</li>
                <li><strong className="text-gray-900 dark:text-white">Cancellation within 14 days</strong> of the very first paid subscription, provided no significant use of the platform has occurred.</li>
                <li>Any other situation required by consumer-protection law applicable to the customer.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. How to request a refund</h2>
              <p>
                Send your request to <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>, including
                your account ID, the billing date in question, and the reason for the request. Requests are
                reviewed within 5 business days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Timeline and method</h2>
              <p>
                Where a refund is approved, it is issued to the same payment method used for the purchase,
                within 5 to 10 business days depending on your bank or payment provider.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Plan changes or downgrades</h2>
              <p>
                Changing plans mid-cycle does not trigger a prorated refund of the difference; the new rate
                applies from the following billing cycle, unless stated otherwise at the time of the change.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Contact</h2>
              <p>
                Billing and refund questions: <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-8 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Principe général</h2>
              <p>
                LiBooks est un service d'abonnement numérique donnant un accès immédiat à la plateforme dès l'activation.
                Sauf dispositions légales impératives applicables dans votre juridiction, les périodes d'abonnement
                déjà facturées ne sont pas remboursables.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Cas de remboursement</h2>
              <p>Un remboursement, total ou partiel, peut être accordé dans les cas suivants :</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li><strong className="text-gray-900 dark:text-white">Double facturation</strong> ou erreur technique de paiement imputable à LiBooks.</li>
                <li><strong className="text-gray-900 dark:text-white">Indisponibilité prolongée</strong> du service (au-delà des engagements de disponibilité communiqués).</li>
                <li><strong className="text-gray-900 dark:text-white">Résiliation dans les 14 jours</strong> suivant le tout premier abonnement payant, si aucun usage significatif de la plateforme n'a été effectué.</li>
                <li>Toute autre situation prévue par une loi de protection des consommateurs applicable au client.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Comment demander un remboursement</h2>
              <p>
                Toute demande doit être adressée à <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a> en
                précisant l'identifiant du compte, la date de facturation concernée et le motif de la demande.
                Les demandes sont examinées sous 5 jours ouvrés.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Délai et mode de remboursement</h2>
              <p>
                Lorsqu'un remboursement est accordé, il est effectué sur le même moyen de paiement utilisé lors de l'achat,
                dans un délai de 5 à 10 jours ouvrés selon l'établissement bancaire ou le prestataire de paiement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Changement ou rétrogradation de forfait</h2>
              <p>
                Un changement de forfait en cours de cycle n'entraîne pas de remboursement au prorata de la différence ;
                le nouveau tarif s'applique à compter du cycle de facturation suivant, sauf mention contraire au moment du changement.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Contact</h2>
              <p>
                Questions relatives à la facturation et aux remboursements : <a href="mailto:support@liafrik.com" className="text-[#0057D9] hover:underline">support@liafrik.com</a>
              </p>
            </section>
          </div>
        )}
      </div>

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
