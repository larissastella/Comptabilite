import gourmet1004 from '../../assets/partners/1004-gourmet.png';
import booktopia from '../../assets/partners/booktopia.png';
import boyaStudio from '../../assets/partners/boya-studio.png';
import cogeicom from '../../assets/partners/cogeicom.png';
import crispyChicken from '../../assets/partners/crispy-chicken.png';
import kutubna from '../../assets/partners/kutubna.png';
import liyahGroup from '../../assets/partners/liyah-group.png';
import maxzi from '../../assets/partners/maxzi.png';
import naijaBuka from '../../assets/partners/naija-buka.png';
import oeilDeLynx from '../../assets/partners/oeil-de-lynx.png';
import sgpme from '../../assets/partners/sgpme.png';

// Real partner-uploaded logo files only — never fabricated, never a
// widely-recognized trademark whose use here could imply an
// unauthorized/unverifiable endorsement (large multinational brands were
// deliberately excluded from this set).
const LOGOS = [
  { src: gourmet1004, alt: '1004 Gourmet' },
  { src: booktopia, alt: 'Booktopia' },
  { src: boyaStudio, alt: 'Boya Studio Creative Pro' },
  { src: cogeicom, alt: 'Cogeicom Sarl' },
  { src: crispyChicken, alt: 'Crispy Chicken' },
  { src: kutubna, alt: 'Kutubna Cultural Center' },
  { src: liyahGroup, alt: 'LiYah Group' },
  { src: maxzi, alt: 'Maxzi — The Good Food Shop' },
  { src: naijaBuka, alt: 'Naija Buka' },
  { src: oeilDeLynx, alt: "L'Œil de Lynx Production" },
  { src: sgpme, alt: 'SGPME' },
];
const LOOP = [...LOGOS, ...LOGOS];

export default function PartnerLogoBanner() {
  return (
    <div className="relative overflow-hidden py-8 bg-white dark:bg-surface-0">
      <p className="text-center text-xs font-medium uppercase tracking-wider text-gray-400 mb-5">
        Ils utilisent LiBooks
      </p>
      <div className="absolute inset-y-0 left-0 w-20 z-10 bg-gradient-to-r from-white dark:from-surface-0 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-20 z-10 bg-gradient-to-l from-white dark:from-surface-0 to-transparent pointer-events-none" />
      <div className="flex w-max animate-flag-scroll gap-12 items-center" style={{ animationDuration: '40s' }}>
        {LOOP.map((logo, i) => (
          <img
            key={`${logo.alt}-${i}`}
            src={logo.src}
            alt={logo.alt}
            loading="lazy"
            className="h-9 sm:h-11 w-auto object-contain flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
          />
        ))}
      </div>
    </div>
  );
}
