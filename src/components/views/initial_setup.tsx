import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/8bit/input";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import { Checkbox } from "@/components/ui/8bit/checkbox";
import {
  buildDefaultAppConfig,
  completeInitialSetup,
  isFriendMode,
  type AppConfig,
} from "@/lib/app-config";
import {
  getUIFontClass,
  resolveAppLanguage,
  type AppLanguage,
  usesPixelUiFont,
} from "@/lib/language";
import { cn } from "@/lib/utils";

type SetupStep = "language" | "eula" | "bar" | "base" | "memory" | "api";

const EULA_PATHS: Record<AppLanguage, string> = {
  en: "/assets/EULA/en_us.md",
  "zh-CN": "/assets/EULA/zh_cn.md",
  jp: "/assets/EULA/jp_jp.md",
};

interface InitialSetupProps {
  initialConfig?: AppConfig;
  onComplete: () => void;
}

export default function InitialSetup({
  initialConfig,
  onComplete,
}: InitialSetupProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const resolvedLanguage = resolveAppLanguage(language);
  const uiFontClass = getUIFontClass(language);
  const usesPixelFont = usesPixelUiFont(language);
  const [step, setStep] = useState<SetupStep>("language");
  const [config, setConfig] = useState<AppConfig>(
    () => initialConfig ?? buildDefaultAppConfig(),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEulaReady, setIsEulaReady] = useState(false);

  const steps = useMemo<SetupStep[]>(
    () =>
      isFriendMode
        ? ["language", "eula", "bar", "base", "memory"]
        : ["language", "eula", "bar", "base", "memory", "api"],
    [],
  );
  const stepIndex = steps.indexOf(step);

  const updateConfig = (patch: Partial<AppConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setStatus(null);
  };

  const chooseDirectory = async (
    title: string,
    onSelected: (path: string) => Promise<string>,
  ) => {
    let selected: string | null;
    try {
      selected = await open({ directory: true, multiple: false, title });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to open directory picker");
      return;
    }
    if (typeof selected !== "string") {
      return;
    }

    setIsSaving(true);
    setStatus(null);
    try {
      const saved = await onSelected(selected);
      return saved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save directory");
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = async () => {
    const nextStep = steps[stepIndex + 1];
    if (!nextStep) {
      setIsSaving(true);
      setStatus(null);
      try {
        await completeInitialSetup({
          ...config,
          Setup_Completed: true,
        });
        onComplete();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to complete setup");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    setStep(nextStep);
  };

  const goBack = () => {
    const previousStep = steps[stepIndex - 1];
    if (previousStep) {
      setStep(previousStep);
      setStatus(null);
    }
  };

  const canContinue =
    step === "language" ||
    (step === "eula" && isEulaReady) ||
    (step === "bar" && Boolean(config.Bar_Root_Parent.trim())) ||
    (step === "base" && Boolean(config.Base_Dir.trim())) ||
    (step === "api" &&
      Boolean(
        config.API_Key.trim() &&
          config.Chat_Base_URL.trim() &&
          config.Chat_Model.trim() &&
          (!config.Use_Experimental_Vector_Memory ||
            (config.Embedding_Base_URL.trim() &&
              config.Embedding_Model.trim())),
      ));

  return (
    <main className={cn("container flex min-h-screen flex-col justify-center gap-6 px-8", uiFontClass)}>
      <Card className="w-full max-w-2xl text-white">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg text-white">
              {t("setup.title")}
            </CardTitle>
            <span className="text-xs text-white/70">
              {stepIndex + 1}/{steps.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex w-full flex-col gap-5">

        {step === "language" && (
          <div className="flex flex-col gap-3">
            <span className="text-sm">{t("setup.language")}</span>
            <Select
              value={
                resolvedLanguage
              }
              onValueChange={(value) => void i18n.changeLanguage(value)}
            >
              <SelectTrigger font="normal">
                <SelectValue placeholder={t("ui.language")} font="normal" />
              </SelectTrigger>
              <SelectContent {...ghostModeRegionProps} font="normal">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh-CN">中文</SelectItem>
                <SelectItem value="jp">日本語</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {step === "eula" && (
          <EulaStep
            language={resolvedLanguage}
            onReadyChange={setIsEulaReady}
          />
        )}

        {step === "bar" && (
          <DirectoryStep
            label={t("setup.barParent")}
            value={config.Bar_Root_Parent}
            buttonLabel={t("setup.chooseBarParent")}
            isSaving={isSaving}
            onChoose={() =>
              void chooseDirectory(t("setup.barParent"), async (path) => {
                const saved = await invoke<string>("change_bar_root_parent", { path });
                updateConfig({ Bar_Root_Parent: saved });
                return saved;
              })
            }
          />
        )}

        {step === "base" && (
          <DirectoryStep
            label={t("setup.baseDir")}
            value={config.Base_Dir}
            buttonLabel={t("setup.chooseBaseDir")}
            isSaving={isSaving}
            onChoose={() =>
              void chooseDirectory(t("setup.baseDir"), async (path) => {
                const saved = await invoke<string>("change_base_directory", { path });
                updateConfig({ Base_Dir: saved });
                return saved;
              })
            }
          />
        )}

        {step === "memory" && (
          <div className="flex flex-col gap-3">
            <span className="text-sm">{t("setup.memory")}</span>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={config.Use_Experimental_Vector_Memory}
                onCheckedChange={(checked) =>
                  updateConfig({ Use_Experimental_Vector_Memory: checked === true })
                }
                disabled={isSaving}
                font="normal"
              />
              <span className="flex flex-col gap-1">
                <span>{t("ui.experimentalVectorMemory")}</span>
                <span className="text-xs text-white/70">
                  {t("ui.plainMemoryDefaultHint")}
                </span>
              </span>
            </label>
          </div>
        )}

        {step === "api" && (
          <div className="flex flex-col gap-3">
            <span className="text-sm">{t("setup.api")}</span>
            <Input
              type="password"
              value={config.API_Key}
              onChange={(event) => updateConfig({ API_Key: event.target.value })}
              placeholder={t("ui.apiKeyPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Chat_Base_URL}
              onChange={(event) => updateConfig({ Chat_Base_URL: event.target.value })}
              placeholder={t("ui.chatBaseUrlPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Chat_Model}
              onChange={(event) => updateConfig({ Chat_Model: event.target.value })}
              placeholder={t("ui.chatModelPlaceholder")}
              font={usesPixelFont ? "normal" : undefined}
              className="bg-foreground text-background placeholder:text-background/60"
            />
            {config.Use_Experimental_Vector_Memory && (
              <>
                <Input
                  value={config.Embedding_Base_URL}
                  onChange={(event) => updateConfig({ Embedding_Base_URL: event.target.value })}
                  placeholder={t("ui.embeddingBaseUrlPlaceholder")}
                  font={usesPixelFont ? "normal" : undefined}
                  className="bg-foreground text-background placeholder:text-background/60"
                />
                <Input
                  value={config.Embedding_Model}
                  onChange={(event) => updateConfig({ Embedding_Model: event.target.value })}
                  placeholder={t("ui.embeddingModelPlaceholder")}
                  font={usesPixelFont ? "normal" : undefined}
                  className="bg-foreground text-background placeholder:text-background/60"
                />
              </>
            )}
          </div>
        )}

        {status && <div className="text-xs text-destructive">{status}</div>}

        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={goBack}
            disabled={stepIndex === 0 || isSaving}
            font="normal"
            className="h-9 px-4 text-background"
          >
            {t("ui.back")}
          </Button>
          <Button
            onClick={() => void goNext()}
            disabled={!canContinue || isSaving}
            font="normal"
            className="h-9 px-4 text-background"
          >
            {step === "eula"
              ? t("setup.eulaConfirm")
              : stepIndex === steps.length - 1
                ? t("setup.finish")
                : t("setup.next")}
          </Button>
        </div>
        </CardContent>
      </Card>
    </main>
  );
}

function EulaStep({
  language,
  onReadyChange,
}: {
  language: AppLanguage;
  onReadyChange: (ready: boolean) => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    setContent(null);
    setLoadError(false);
    onReadyChange(false);

    void fetch(EULA_PATHS[language], { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load EULA: ${response.status}`);
        }
        return response.text();
      })
      .then((nextContent) => {
        if (!nextContent.trim()) {
          throw new Error("EULA is empty");
        }
        setContent(nextContent);
        onReadyChange(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load EULA:", error);
        setLoadError(true);
      });

    return () => {
      abortController.abort();
    };
  }, [language, onReadyChange]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="eula-title">
      <span id="eula-title" className="text-sm">
        {t("setup.eula")}
      </span>
      <div className="max-h-[min(50vh,28rem)] overflow-y-auto border-x-4 border-y-6 border-foreground bg-foreground px-4 py-3 text-sm leading-6 text-background">
        {loadError ? (
          <p className="text-destructive">{t("setup.eulaLoadFailed")}</p>
        ) : content ? (
          <EulaContent content={content} />
        ) : (
          <p>{t("setup.eulaLoading")}</p>
        )}
      </div>
    </section>
  );
}

function EulaContent({ content }: { content: string }) {
  return (
    <article className="flex flex-col gap-4">
      {content
        .trim()
        .split(/\n{2,}/)
        .map((block, index) => {
          if (block.startsWith("# ")) {
            return (
              <h2 key={index} className="text-base font-bold">
                {block.slice(2)}
              </h2>
            );
          }

          if (block.startsWith("## ")) {
            return (
              <h3 key={index} className="text-sm font-bold">
                {block.slice(3)}
              </h3>
            );
          }

          return (
            <p key={index} className="whitespace-pre-wrap">
              {block.replace(/  \n/g, "\n")}
            </p>
          );
        })}
    </article>
  );
}

function DirectoryStep({
  label,
  value,
  buttonLabel,
  isSaving,
  onChoose,
}: {
  label: string;
  value: string;
  buttonLabel: string;
  isSaving: boolean;
  onChoose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 truncate border-y-6 border-foreground bg-foreground px-3 py-1.5 text-sm text-background">
          {value || t("ui.directoryUnset")}
        </div>
        <Button
          onClick={onChoose}
          disabled={isSaving}
          font="normal"
          className="h-9 shrink-0 px-4 text-background"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
