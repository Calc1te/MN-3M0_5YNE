import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import jpTranslation from "./locales/jp/translation.json";
import zhCnTranslation from "./locales/zh-CN/translation.json";
import enPrompts from "./prompts/en.json";
import jpPrompts from "./prompts/jp.json";
import zhCnPrompts from "./prompts/zh-CN.json";
import { resolveAppLanguage, type AppLanguage } from "@/lib/language";

const resources = {
  en: {
    translation: { ...enTranslation, prompts: enPrompts },
  },
  "zh-CN": {
    translation: { ...zhCnTranslation, prompts: zhCnPrompts },
  },
  jp: {
    translation: { ...jpTranslation, prompts: jpPrompts },
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
