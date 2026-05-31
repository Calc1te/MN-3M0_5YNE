import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import DirectorySelector from "@/components/directory-selector";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import { getStoredApiKey, saveStoredApiKey } from "@/lib/api-key";
import { cn } from "@/lib/utils";

export default function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const selectValue = language === "zh-CN" ? "zh-CN" : "en";
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);

  useEffect(() => {
    void getStoredApiKey()
      .then(setApiKey)
      .catch((error: unknown) => {
        console.error("Failed to load API key:", error);
      });
  }, []);

  const handleSaveApiKey = async () => {
    try {
      const saved = await saveStoredApiKey(apiKey);
      setApiKey(saved);
      setApiKeyStatus(
        saved.trim() ? t("ui.apiKeySaved") : t("ui.apiKeyCleared"),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save API key";
      setApiKeyStatus(message);
    }
  };

  return (
    <main className={cn("container flex flex-col gap-6 ", isZh && "font-ui-cn")}>
      <div className="flex items-center justify-between w-full">
        <h1 className="text-lg font-semibold pl-6">{t("menu.settings")}</h1>
        <Button font="normal" onClick={() => navigate("/bartender-main")}>
          {t("ui.back")}
        </Button>
      </div>

      <div className="flex flex-col gap-6 pl-6 w-full">
        <section className="flex flex-col gap-6 max-w-xs">
          <span className="text-sm">{t("ui.language")}</span>
          <Select value={selectValue} onValueChange={(value) => void i18n.changeLanguage(value)}>
            <SelectTrigger font="normal">
              <SelectValue placeholder={t("ui.language")} font="normal" />
            </SelectTrigger>
            <SelectContent font="normal">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-CN">中文</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="flex w-full max-w-xl flex-col gap-3">
          <span className="text-sm">{t("ui.apiKey")}</span>
          <div className="flex w-full items-center gap-3">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setApiKeyStatus(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSaveApiKey();
                }
              }}
              placeholder={t("ui.apiKeyPlaceholder")}
              font="normal"
              className="min-w-0 flex-1 bg-foreground text-background placeholder:text-background/60"
            />
            <Button
              onClick={() => void handleSaveApiKey()}
              font="normal"
              className="h-9 shrink-0 px-4 text-background"
            >
              {t("ui.apiKeySave")}
            </Button>
          </div>
          {apiKeyStatus && (
            <div className="text-xs text-foreground/70">{apiKeyStatus}</div>
          )}
        </section>

        <DirectorySelector />
      </div>
    </main>
  );
}
