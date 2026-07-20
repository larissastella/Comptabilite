import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr';
import en from './en';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: localStorage.getItem('liafrik_lang') || 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('liafrik_lang', lng);
});

export default i18n;
