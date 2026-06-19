export type AppLanguage = "en" | "zh-CN" | "jp";

export function resolveAppLanguage(language?: string | null): AppLanguage {
  if (language === "zh-CN" || language?.startsWith("zh")) {
    return "zh-CN";
  }
  if (language === "jp" || language?.startsWith("ja")) {
    return "jp";
  }
  return "en";
}

export function isZhLanguage(language?: string | null): boolean {
  return resolveAppLanguage(language) === "zh-CN";
}

export function isJpLanguage(language?: string | null): boolean {
  return resolveAppLanguage(language) === "jp";
}

export function usesPixelUiFont(language?: string | null): boolean {
  const resolved = resolveAppLanguage(language);
  return resolved === "zh-CN" || resolved === "jp";
}

export function getUIFontClass(language?: string | null): string {
  const resolved = resolveAppLanguage(language);
  if (resolved === "zh-CN") {
    return "font-ui-cn";
  }
  if (resolved === "jp") {
    return "font-ui-jp";
  }
  return "font-ui-en";
}

export function getChatFontClass(language?: string | null): string {
  const resolved = resolveAppLanguage(language);
  if (resolved === "zh-CN") {
    return "font-chat-cn";
  }
  if (resolved === "jp") {
    return "font-chat-jp";
  }
  return "font-chat-en";
}
