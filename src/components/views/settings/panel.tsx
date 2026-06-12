import { useEffect, useRef, useState } from "react";
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
import { Slider } from "@/components/ui/8bit/slider";
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
import {
  readAudioVolumesFromConfig,
  setRuntimeAudioVolumes,
} from "@/lib/audio-settings";
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
  const hasLoadedConfigRef = useRef(false);
  const isAutoSavingRef = useRef(false);
  const lastPersistedConfigRef = useRef("");

  useEffect(() => {
    void getAppConfig()
      .then((loadedConfig) => {
        setConfig(loadedConfig);
        setRuntimeAudioVolumes(readAudioVolumesFromConfig(loadedConfig));
        lastPersistedConfigRef.current = JSON.stringify(loadedConfig);
        hasLoadedConfigRef.current = true;
      })
      .catch((error: unknown) => {
        console.error("Failed to load app config:", error);
      });
  }, []);

  const persistConfig = async (
    nextConfig: AppConfig,
    successMessage?: string,
  ) => {
    try {
      const saved = await saveAppConfig(nextConfig);
      setConfig(saved);
      setRuntimeAudioVolumes(readAudioVolumesFromConfig(saved));
      lastPersistedConfigRef.current = JSON.stringify(saved);
      if (successMessage) {
        setConfigStatus(successMessage);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save configuration";
      setConfigStatus(message);
    }
  };

  const handleSaveConfig = async () => {
    await persistConfig(config, t("ui.configSaved") || "Configuration saved");
  };

  const updateConfig = (patch: Partial<AppConfig>) => {
    setConfig((current) => {
      const nextConfig = { ...current, ...patch };
      setRuntimeAudioVolumes(readAudioVolumesFromConfig(nextConfig));
      return nextConfig;
    });
    setConfigStatus(null);
    setExitStatus(null);
  };

  useEffect(() => {
    if (!hasLoadedConfigRef.current || isExiting) {
      return;
    }

    const serializedConfig = JSON.stringify(config);
    if (serializedConfig === lastPersistedConfigRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (isAutoSavingRef.current) {
        return;
      }

      isAutoSavingRef.current = true;
      void persistConfig(config).finally(() => {
        isAutoSavingRef.current = false;
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [config, isExiting]);

  const handleExit = async () => {
    setIsExiting(true);
    setExitStatus(null);

    try {
      const savedConfig = await saveAppConfig(config);
      setConfig(savedConfig);
      setRuntimeAudioVolumes(readAudioVolumesFromConfig(savedConfig));

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
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">{t("menu.settings")}</CardTitle>
            <span className="text-xs text-white/70">
              {t("ui.autoSaveHint")}
            </span>
          </div>
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
            <div className="text-xs text-white/70">{exitStatus}</div>
          )}
        </section>

        <section className="flex w-full max-w-xl flex-col gap-3">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={config.Always_On_Top}
              onCheckedChange={(checked) => {
                const nextValue = checked === true;
                updateConfig({ Always_On_Top: nextValue });
                void invoke("set_always_on_top", {
                  always_on_top: nextValue,
                }).catch((error: unknown) => {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Failed to update always-on-top";
                  setConfigStatus(message);
                });
              }}
              disabled={isExiting}
              font="normal"
            />
            <span>{t("ui.alwaysOnTop")}</span>
          </label>
        </section>

        <section className="flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span>{t("ui.idleAutoMixMinutes")}</span>
            <span className="text-xs text-white/70">
              {config.Idle_Auto_Mix_Minutes === 0
                ? t("ui.off")
                : t("ui.minuteValue", {
                    count: config.Idle_Auto_Mix_Minutes,
                  })}
            </span>
          </div>
          <Slider
            min={0}
            max={120}
            step={1}
            value={[config.Idle_Auto_Mix_Minutes]}
            onValueChange={([value]) =>
              updateConfig({ Idle_Auto_Mix_Minutes: value ?? 0 })
            }
            disabled={isExiting}
            aria-label={t("ui.idleAutoMixMinutes")}
            className="max-w-md"
          />
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

        <section className="flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span>{isZh ? "音效音量" : "SE Volume"}</span>
            <span className="text-xs text-white/70">
              {Math.round(config.Audio_Volume_SE * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round(config.Audio_Volume_SE * 100)]}
            onValueChange={([value]) =>
              updateConfig({ Audio_Volume_SE: (value ?? 0) / 100 })
            }
            disabled={isExiting}
            aria-label={isZh ? "音效音量" : "SE Volume"}
            className="max-w-md"
          />
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
                <div className="text-xs text-white/70">
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
