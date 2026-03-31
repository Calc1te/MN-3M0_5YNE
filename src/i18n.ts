import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import zhCnTranslation from "./locales/zh-CN/translation.json";

const resources = {
  en: {
    translation: enTranslation,
  },
  "zh-CN": {
    translation: zhCnTranslation,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "app_language",
    },
  });

export function getCurrentLanguage(): "en" | "zh-CN" {
  return i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en";
}

export default i18n;
