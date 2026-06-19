import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import jpTranslation from "./locales/jp/translation.json";
import zhCnTranslation from "./locales/zh-CN/translation.json";
import { resolveAppLanguage, type AppLanguage } from "@/lib/language";

const resources = {
  en: {
    translation: enTranslation,
  },
  "zh-CN": {
    translation: zhCnTranslation,
  },
  jp: {
    translation: jpTranslation,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN", "jp"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "app_language",
    },
  });

export function getCurrentLanguage(): AppLanguage {
  return resolveAppLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export default i18n;
