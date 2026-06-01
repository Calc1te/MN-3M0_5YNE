import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { createMemoryVector, summarizeExitMemory } from "@/api_caller";
import DirectorySelector from "@/components/directory-selector";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/8bit/button";
import { Checkbox } from "@/components/ui/8bit/checkbox";
import { Input } from "@/components/ui/8bit/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import {
  buildDefaultAppConfig,
  getAppConfig,
  isFriendMode,
  saveAppConfig,
  type AppConfig,
} from "@/lib/app-config";
import { getBartenderHistory } from "@/lib/bartender-history";
import { cn } from "@/lib/utils";

export default function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const selectValue = language === "zh-CN" ? "zh-CN" : "en";
  const [config, setConfig] = useState<AppConfig>(() => buildDefaultAppConfig());
  const [configStatus, setConfigStatus] = useState<string | null>(null);
  const [exitStatus, setExitStatus] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    void getAppConfig()
      .then(setConfig)
      .catch((error: unknown) => {
        console.error("Failed to load app config:", error);
      });
  }, []);

  const handleSaveConfig = async () => {
    try {
      const saved = await saveAppConfig(config);
      setConfig(saved);
      setConfigStatus(t("ui.configSaved") || "Configuration saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save configuration";
      setConfigStatus(message);
    }
  };

  const updateConfig = (patch: Partial<AppConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setConfigStatus(null);
    setExitStatus(null);
  };

  const handleExit = async () => {
    setIsExiting(true);
    setExitStatus(null);

    try {
      const savedConfig = await saveAppConfig(config);
      setConfig(savedConfig);

      if (savedConfig.Remember_On_Exit) {
        setExitStatus(t("ui.exitMemorySaving"));
        const summary = await summarizeExitMemory({
          language,
          baseDir: savedConfig.Base_Dir,
          barRootParent: savedConfig.Bar_Root_Parent,
          history: getBartenderHistory(),
        });
        const memory = await createMemoryVector(summary, summary);
        await invoke("add_memory", {
          text: summary,
          vector: Array.from(memory.vector),
          tags: ["exit", "session_summary"],
        });
      }

      await invoke("quit_app");
    } catch (error) {
      setExitStatus(
        error instanceof Error ? error.message : "Failed to exit cleanly",
      );
      setIsExiting(false);
    }
  };

  return (
    <main className={cn("container flex flex-col gap-6", isZh && "font-ui-cn")}>
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-lg">{t("menu.settings")}</CardTitle>
          <CardAction className="flex items-center gap-3">
            <Button
              font="normal"
              onClick={() => navigate("/bartender-main")}
              disabled={isExiting}
            >
              {t("ui.back")}
            </Button>
            <Button
              font="normal"
              onClick={() => void handleExit()}
              disabled={isExiting}
            >
              {t("ui.exit")}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex w-full flex-col gap-6">
        <section className="flex w-full max-w-xl flex-col gap-3">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={config.Remember_On_Exit}
              onCheckedChange={(checked) =>
                updateConfig({ Remember_On_Exit: checked === true })
              }
              disabled={isExiting}
              font="normal"
            />
            <span>{t("ui.rememberOnExit")}</span>
          </label>
          {exitStatus && (
            <div className="text-xs text-foreground/70">{exitStatus}</div>
          )}
        </section>

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

        {!isFriendMode && (
          <section className="flex w-full max-w-xl flex-col gap-3">
            <span className="text-sm">{t("ui.apiConfig")}</span>
            <Input
              type="password"
              value={config.API_Key}
              onChange={(event) => updateConfig({ API_Key: event.target.value })}
              placeholder={t("ui.apiKeyPlaceholder")}
              font="normal"
            />
            <Input
              value={config.Chat_Base_URL}
              onChange={(event) =>
                updateConfig({ Chat_Base_URL: event.target.value })
              }
              placeholder={t("ui.chatBaseUrlPlaceholder")}
              font="normal"
            />
            <Input
              value={config.Chat_Model}
              onChange={(event) =>
                updateConfig({ Chat_Model: event.target.value })
              }
              placeholder={t("ui.chatModelPlaceholder")}
              font="normal"
            />
            <Input
              value={config.Embedding_Base_URL}
              onChange={(event) =>
                updateConfig({ Embedding_Base_URL: event.target.value })
              }
              placeholder={t("ui.embeddingBaseUrlPlaceholder")}
              font="normal"
            />
            <Input
              value={config.Embedding_Model}
              onChange={(event) =>
                updateConfig({ Embedding_Model: event.target.value })
              }
              placeholder={t("ui.embeddingModelPlaceholder")}
              font="normal"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={() => void handleSaveConfig()}
                font="normal"
                className="h-9 shrink-0 px-4"
              >
                {t("ui.configSave")}
              </Button>
              {configStatus && (
                <div className="text-xs text-foreground/70">
                  {configStatus}
                </div>
              )}
            </div>
          </section>
        )}

        <DirectorySelector />
        </CardContent>
      </Card>
    </main>
  );
}
