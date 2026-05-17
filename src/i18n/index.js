/**
 * @module i18n
 * @description Internationalization system for Project Genesis.
 * Supports Italian (default) and English with runtime switching.
 * Uses nested JSON files and dot-notation key access.
 */

import itStrings from './it.json';
import enStrings from './en.json';

/** @type {Object<string, Object>} Available locale data keyed by language code */
const LOCALES = {
  it: itStrings,
  en: enStrings
};

/** @type {string} Currently active locale code */
let currentLocale = 'it';

/** @type {Set<Function>} Listeners notified when locale changes */
const listeners = new Set();

/**
 * Retrieves a translated string by dot-notation key path.
 * Falls back to Italian, then to the raw key if not found.
 * @param {string} key - Dot-notation path, e.g. 'control_panel.title'
 * @param {Object} [replacements] - Key/value pairs for placeholder substitution {{key}}
 * @returns {string} The translated string
 */
export function t(key, replacements = {}) {
  let value = resolveKey(LOCALES[currentLocale], key);

  if (value === undefined) {
    value = resolveKey(LOCALES['it'], key);
  }

  if (value === undefined) {
    console.warn(`[i18n] Missing translation key: "${key}" for locale "${currentLocale}"`);
    return key;
  }

  // Apply replacements: {{name}} → value
  if (typeof value === 'string' && replacements) {
    for (const [rKey, rVal] of Object.entries(replacements)) {
      value = value.replace(new RegExp(`\\{\\{${rKey}\\}\\}`, 'g'), String(rVal));
    }
  }

  return value;
}

/**
 * Resolves a dot-notation key path against a nested object.
 * @param {Object} obj - The locale data object
 * @param {string} key - Dot-notation path
 * @returns {string|undefined}
 */
function resolveKey(obj, key) {
  if (!obj || typeof key !== 'string') return undefined;
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Gets the current locale code.
 * @returns {string} Current locale code ('it' or 'en')
 */
export function getLocale() {
  return currentLocale;
}

/**
 * Sets the active locale and notifies all listeners.
 * @param {string} locale - The locale code to switch to
 */
export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`[i18n] Unknown locale: "${locale}", available: ${Object.keys(LOCALES).join(', ')}`);
    return;
  }
  if (locale === currentLocale) return;
  currentLocale = locale;
  localStorage.setItem('genesis_locale', locale);
  listeners.forEach(fn => {
    try { fn(locale); } catch (e) { console.error('[i18n] Listener error:', e); }
  });
}

/**
 * Subscribes a listener to locale changes.
 * @param {Function} fn - Callback receiving the new locale code
 * @returns {Function} Unsubscribe function
 */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Returns the list of available locale codes.
 * @returns {string[]}
 */
export function getAvailableLocales() {
  return Object.keys(LOCALES);
}

/**
 * Initializes the i18n system, restoring saved preference.
 */
export function initI18n() {
  const saved = localStorage.getItem('genesis_locale');
  if (saved && LOCALES[saved]) {
    currentLocale = saved;
  }
}
