import strings from './lockscreen.json';

type LockscreenLocale = keyof typeof strings;
type LockscreenStrings = (typeof strings)['en'];

// Visible without unlocking, so no health details. es-MX reads as es; unsupported languages fall back to
// English. The own-key check keeps "toString" from counting as a language.
export function lockscreenStrings(languageTag: string): LockscreenStrings {
  const language = languageTag.split('-')[0]?.toLowerCase() ?? '';
  return Object.prototype.hasOwnProperty.call(strings, language)
    ? strings[language as LockscreenLocale]
    : strings.en;
}
