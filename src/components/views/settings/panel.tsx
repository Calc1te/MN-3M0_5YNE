import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

import {
  checkChatModelConnection,
  checkEmbeddingModelConnection,
  createMemoryVector,
  summarizeExitMemory,
} from "@/api_caller";
import DirectorySelector from "@/components/directory-selector";
import PDialog from "@/components/P_dialog";
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
  resolveRuntimeLlmConfig,
  saveAppConfig,
  type AppConfig,
} from "@/lib/app-config";
import {
  readAudioVolumesFromConfig,
  setRuntimeAudioVolumes,
} from "@/lib/audio-settings";
import { getBartenderHistory } from "@/lib/bartender-history";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import {
  DIALOG_TYPING_SPEED_VALUES,
  getDialogTypingIntervalMs,
  type DialogTypingSpeed,
} from "@/lib/dialog-typing-speed";
import { getUIFontClass, resolveAppLanguage, usesPixelUiFont } from "@/lib/language";
import { cn } from "@/lib/utils";

type ServiceStatus = "unknown" | "checking" | "online" | "offline";

export default function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const resolvedLanguage = resolveAppLanguage(language);
  const uiFontClass = getUIFontClass(language);
  const usesPixelFont = usesPixelUiFont(language);
  const selectValue = resolvedLanguage;
  const [config, setConfig] = useState<AppConfig>(() => buildDefaultAppConfig());
  const [configStatus, setConfigStatus] = useState<string | null>(null);
  const [exitStatus, setExitStatus] = useState<string | null>(null);
  const [autostartStatus, setAutostartStatus] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isUpdatingAutostart, setIsUpdatingAutostart] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(false);
  const [chatModelStatus, setChatModelStatus] =
    useState<ServiceStatus>("unknown");
  const [embeddingModelStatus, setEmbeddingModelStatus] =
    useState<ServiceStatus>("unknown");
  const [lanceStatus, setLanceStatus] = useState<ServiceStatus>("unknown");
  const hasLoadedConfigRef = useRef(false);
  const isAutoSavingRef = useRef(false);
  const lastPersistedConfigRef = useRef("");
  const previewTimerRef = useRef<number | null>(null);
  const [typingPreviewText, setTypingPreviewText] = useState("");
  const [isTypingPreviewSpeaking, setIsTypingPreviewSpeaking] = useState(false);

  const typingPreviewMessage = t("ui.dialogTypingPreviewMessage");

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (!hasLoadedConfigRef.current) {
      return;
    }

    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    setTypingPreviewText("");
    setIsTypingPreviewSpeaking(false);

    const startTimer = window.setTimeout(() => {
      setTypingPreviewText(typingPreviewMessage);
      setIsTypingPreviewSpeaking(true);
    }, 30);

    const finishTimer = window.setTimeout(() => {
      setIsTypingPreviewSpeaking(false);
      previewTimerRef.current = null;
    }, typingPreviewMessage.length * getDialogTypingIntervalMs(config.Dialog_Typing_Speed) + 240);

    previewTimerRef.current = finishTimer;

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(finishTimer);
    };
  }, [config.Dialog_Typing_Speed, typingPreviewMessage]);

  useEffect(() => {
    if (!hasLoadedConfigRef.current) {
      return;
    }

    setLanceStatus("checking");
    void invoke<{ online: boolean }>("check_lance_connection")
      .then((result) => {
        setLanceStatus(result.online ? "online" : "offline");
      })
      .catch((error: unknown) => {
        console.error("Failed to check lance connection:", error);
        setLanceStatus("offline");
      });
  }, [config.Bar_Root_Parent]);

  useEffect(() => {
    void isEnabled()
      .then((enabled) => {
        setAutostartEnabled(enabled);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load launch-on-startup status";
        setAutostartStatus(message);
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
    console.info("[settings] exit:start", {
      rememberOnExit: config.Remember_On_Exit,
      baseDir: config.Base_Dir,
      barRootParent: config.Bar_Root_Parent,
    });
    setIsExiting(true);
    setExitStatus(null);

    try {
      console.info("[settings] exit:save_config:start");
      const savedConfig = await saveAppConfig(config);
      console.info("[settings] exit:save_config:done", {
        rememberOnExit: savedConfig.Remember_On_Exit,
      });
      setConfig(savedConfig);
      setRuntimeAudioVolumes(readAudioVolumesFromConfig(savedConfig));

      if (savedConfig.Remember_On_Exit) {
        console.info("[settings] exit:memory_summary:start");
        setExitStatus(t("ui.exitMemorySaving"));
        const summary = await summarizeExitMemory({
          language,
          baseDir: savedConfig.Base_Dir,
          barRootParent: savedConfig.Bar_Root_Parent,
          history: getBartenderHistory(),
        });
        console.info("[settings] exit:memory_summary:done", {
          summaryLength: summary.length,
        });
        console.info("[settings] exit:memory_embedding:start");
        const memory = await createMemoryVector(summary, summary);
        console.info("[settings] exit:memory_embedding:done", {
          vectorLength: memory.vector.length,
        });
        console.info("[settings] exit:add_memory:start");
        await invoke("add_memory", {
          text: summary,
          vector: Array.from(memory.vector),
          tags: ["exit", "session_summary"],
        });
        console.info("[settings] exit:add_memory:done");
      }

      console.info("[settings] exit:quit_app:invoke");
      await invoke("quit_app");
      console.info("[settings] exit:quit_app:resolved");
    } catch (error) {
      console.error("[settings] exit:error", error);
      setExitStatus(
        error instanceof Error ? error.message : "Failed to exit cleanly",
      );
      setIsExiting(false);
    }
  };

  const handleAutostartChange = async (checked: boolean) => {
    const previousValue = autostartEnabled;
    setAutostartEnabled(checked);
    setAutostartStatus(null);
    setIsUpdatingAutostart(true);

    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
    } catch (error) {
      setAutostartEnabled(previousValue);
      setAutostartStatus(
        error instanceof Error
          ? error.message
          : "Failed to update launch-on-startup",
      );
    } finally {
      setIsUpdatingAutostart(false);
    }
  };

  const getStatusLabel = (status: ServiceStatus) => {
    switch (status) {
      case "checking":
        return t("ui.connectionChecking");
      case "online":
        return t("ui.connectionOnline");
      case "offline":
        return t("ui.connectionOffline");
      default:
        return t("ui.connectionUnknown");
    }
  };

  const getStatusClassName = (status: ServiceStatus) => {
    switch (status) {
      case "online":
        return "text-green-400";
      case "offline":
        return "text-red-400";
      default:
        return "text-white/70";
    }
  };

  const handleCheckModelConnections = async () => {
    const runtimeConfig = resolveRuntimeLlmConfig(config);
    setIsCheckingModels(true);
    setChatModelStatus("checking");
    setEmbeddingModelStatus("checking");
    setConfigStatus(null);

    const [chatResult, embeddingResult] = await Promise.allSettled([
      checkChatModelConnection(runtimeConfig),
      checkEmbeddingModelConnection(runtimeConfig),
    ]);

    setChatModelStatus(chatResult.status === "fulfilled" ? "online" : "offline");
    setEmbeddingModelStatus(
      embeddingResult.status === "fulfilled" ? "online" : "offline",
    );

    const failure = [chatResult, embeddingResult].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    setConfigStatus(
      failure
        ? failure.reason instanceof Error
          ? failure.reason.message
          : t("ui.connectionCheckFailed")
        : t("ui.connectionCheckSuccess"),
    );
    setIsCheckingModels(false);
  };

  const handleTypingSpeedChange = (speed: DialogTypingSpeed, checked: boolean) => {
    if (!checked || config.Dialog_Typing_Speed === speed) {
      return;
    }
    updateConfig({ Dialog_Typing_Speed: speed });
  };

  return (
    <main className={cn("container flex flex-col gap-6", uiFontClass)}>
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
              checked={autostartEnabled}
              onCheckedChange={(checked) =>
                void handleAutostartChange(checked === true)
              }
              disabled={isExiting || isUpdatingAutostart}
              font="normal"
            />
            <span>{t("ui.launchOnStartup")}</span>
          </label>
          {autostartStatus && (
            <div className="text-xs text-white/70">{autostartStatus}</div>
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

        <section className="flex w-full max-w-xl flex-col gap-3">
          <span className="text-sm">{t("ui.dialogTypingSpeed")}</span>
          <div className="flex flex-wrap items-center gap-4">
            {DIALOG_TYPING_SPEED_VALUES.map((speed) => (
              <label key={speed} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={config.Dialog_Typing_Speed === speed}
                  onCheckedChange={(checked) =>
                    handleTypingSpeedChange(speed, checked === true)
                  }
                  disabled={isExiting}
                  font="normal"
                />
                <span>{t(`ui.dialogTypingSpeed${speed[0].toUpperCase()}${speed.slice(1)}`)}</span>
              </label>
            ))}
          </div>
          <PDialog
            value={typingPreviewText}
            isSpeaking={isTypingPreviewSpeaking}
            typingSpeed={config.Dialog_Typing_Speed}
            readOnly
            rows={4}
            font="normal"
            label={t("ui.dialogTypingPreview")}
            className="bg-foreground text-background placeholder:text-background/60"
          />
        </section>

        <section className="flex flex-col gap-6 max-w-xs">
          <span className="text-sm">{t("ui.language")}</span>
          <Select value={selectValue} onValueChange={(value) => void i18n.changeLanguage(value)}>
            <SelectTrigger font="normal">
              <SelectValue placeholder={t("ui.language")} font="normal" />
            </SelectTrigger>
            <SelectContent {...ghostModeRegionProps} font="normal">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-CN">中文</SelectItem>
              <SelectItem value="jp">日本語</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span>{t("ui.seVolume")}</span>
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
            aria-label={t("ui.seVolume")}
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
              font={usesPixelFont ? "normal" : undefined}
            />
            <Input
              value={config.Chat_Base_URL}
              onChange={(event) =>
                updateConfig({ Chat_Base_URL: event.target.value })
              }
              placeholder={t("ui.chatBaseUrlPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
            />
            <Input
              value={config.Chat_Model}
              onChange={(event) =>
                updateConfig({ Chat_Model: event.target.value })
              }
              placeholder={t("ui.chatModelPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
            />
            <Input
              value={config.Embedding_Base_URL}
              onChange={(event) =>
                updateConfig({ Embedding_Base_URL: event.target.value })
              }
              placeholder={t("ui.embeddingBaseUrlPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
            />
            <Input
              value={config.Embedding_Model}
              onChange={(event) =>
                updateConfig({ Embedding_Model: event.target.value })
              }
              placeholder={t("ui.embeddingModelPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
            />
            <div className="flex flex-col gap-1 text-xs text-white/70">
              <div className="flex items-center justify-between gap-3">
                <span>{t("ui.chatModelConnection")}</span>
                <span className={getStatusClassName(chatModelStatus)}>
                  {getStatusLabel(chatModelStatus)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t("ui.embeddingModelConnection")}</span>
                <span className={getStatusClassName(embeddingModelStatus)}>
                  {getStatusLabel(embeddingModelStatus)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t("ui.lanceConnection")}</span>
                <span className={getStatusClassName(lanceStatus)}>
                  {getStatusLabel(lanceStatus)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => void handleSaveConfig()}
                font="normal"
                className="h-9 shrink-0 px-4"
              >
                {t("ui.configSave")}
              </Button>
              <Button
                onClick={() => void handleCheckModelConnections()}
                font="normal"
                className="h-9 shrink-0 px-4"
                disabled={isCheckingModels || isExiting}
              >
                {isCheckingModels
                  ? t("ui.connectionChecking")
                  : t("ui.checkConnections")}
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
