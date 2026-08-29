import { COUNTRIES } from '../../lib/countryData';

// National flags aren't subject to the same copyright/trademark
// concerns as company logos — this purely illustrates the real,
// verified country coverage (62 countries in COUNTRIES), nothing
// fabricated. Duplicated once so the CSS animation loop is seamless.
const CODES = COUNTRIES.map(c => c.code.toLowerCase());
const LOOP = [...CODES, ...CODES];

export default function FlagScrollBanner() {
  return (
    <div className="relative overflow-hidden py-6 bg-gray-50 dark:bg-surface-1 border-y border-gray-100 dark:border-surface-3">
      <div className="absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-gray-50 dark:from-surface-1 to-transparent pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-gray-50 dark:from-surface-1 to-transparent pointer-events-none" />
      <div className="flex w-max animate-flag-scroll gap-5">
        {LOOP.map((code, i) => (
          <img
            key={`${code}-${i}`}
            src={`https://flagcdn.com/w40/${code}.png`}
            srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
            alt=""
            loading="lazy"
            className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-black/5 dark:ring-white/10"
          />
        ))}
      </div>
    </div>
  );
}
