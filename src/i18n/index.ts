import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr';
import en from './en';
import ar from './ar';
import pt from './pt';
import es from './es';
import sw from './sw';
import zh from './zh';
import de from './de';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    // ar/pt/es/sw/zh/de: content is currently a straight copy of fr.ts
    // (see the comment in each file) — registered now so the language
    // selector is functional immediately, translated for real one
    // language at a time in follow-up work without ever touching this
    // registration again.
    ar: { translation: ar },
    pt: { translation: pt },
    es: { translation: es },
    sw: { translation: sw },
    zh: { translation: zh },
    de: { translation: de },
  },
  lng: localStorage.getItem('liafrik_lang') || 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('liafrik_lang', lng);
});

export default i18n;
