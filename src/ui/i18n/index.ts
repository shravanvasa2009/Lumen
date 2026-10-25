import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import es from './es.json';

const resources = { en: { translation: en }, es: { translation: es } };

// es-MX reads as es. The own-key check keeps "toString" from counting as a language.
function resolveLanguage(languageTag: string | null | undefined): keyof typeof resources {
  const language = languageTag?.split('-')[0]?.toLowerCase() ?? '';
  return Object.prototype.hasOwnProperty.call(resources, language)
    ? (language as keyof typeof resources)
    : 'en';
}

// Flat dotted keys, so "." nesting is off. Bundled resources make init synchronous. A rejection is left
// unhandled on purpose: nothing can recover from missing strings.
void i18next.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getLocales()[0]?.languageTag),
  fallbackLng: 'en',
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
});
