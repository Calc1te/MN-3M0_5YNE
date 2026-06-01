import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/8bit/button";
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
  completeInitialSetup,
  isFriendMode,
  type AppConfig,
} from "@/lib/app-config";
import { cn } from "@/lib/utils";

type SetupStep = "language" | "bar" | "base" | "api";

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
  const isZh = Boolean(language && language.startsWith("zh"));
  const [step, setStep] = useState<SetupStep>("language");
  const [config, setConfig] = useState<AppConfig>(
    () => initialConfig ?? buildDefaultAppConfig(),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const steps = useMemo<SetupStep[]>(
    () => (isFriendMode ? ["language", "bar", "base"] : ["language", "bar", "base", "api"]),
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
    (step === "bar" && Boolean(config.Bar_Root_Parent.trim())) ||
    (step === "base" && Boolean(config.Base_Dir.trim())) ||
    (step === "api" &&
      Boolean(
        config.API_Key.trim() &&
          config.Chat_Base_URL.trim() &&
          config.Chat_Model.trim() &&
          config.Embedding_Base_URL.trim() &&
          config.Embedding_Model.trim(),
      ));

  return (
    <main className={cn("container flex min-h-screen flex-col justify-center gap-6 px-8", isZh && "font-ui-cn")}>
      <section className="flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("setup.title")}</h1>
          <span className="text-xs text-foreground/70">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>

        {step === "language" && (
          <div className="flex flex-col gap-3">
            <span className="text-sm">{t("setup.language")}</span>
            <Select
              value={language === "zh-CN" ? "zh-CN" : "en"}
              onValueChange={(value) => void i18n.changeLanguage(value)}
            >
              <SelectTrigger font="normal">
                <SelectValue placeholder={t("ui.language")} font="normal" />
              </SelectTrigger>
              <SelectContent font="normal">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh-CN">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

        {step === "api" && (
          <div className="flex flex-col gap-3">
            <span className="text-sm">{t("setup.api")}</span>
            <Input
              type="password"
              value={config.API_Key}
              onChange={(event) => updateConfig({ API_Key: event.target.value })}
              placeholder={t("ui.apiKeyPlaceholder")}
              font="normal"
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Chat_Base_URL}
              onChange={(event) => updateConfig({ Chat_Base_URL: event.target.value })}
              placeholder={t("ui.chatBaseUrlPlaceholder")}
              font="normal"
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Chat_Model}
              onChange={(event) => updateConfig({ Chat_Model: event.target.value })}
              placeholder={t("ui.chatModelPlaceholder")}
              font="normal"
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Embedding_Base_URL}
              onChange={(event) => updateConfig({ Embedding_Base_URL: event.target.value })}
              placeholder={t("ui.embeddingBaseUrlPlaceholder")}
              font="normal"
              className="bg-foreground text-background placeholder:text-background/60"
            />
            <Input
              value={config.Embedding_Model}
              onChange={(event) => updateConfig({ Embedding_Model: event.target.value })}
              placeholder={t("ui.embeddingModelPlaceholder")}
              font="normal"
              className="bg-foreground text-background placeholder:text-background/60"
            />
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
            {stepIndex === steps.length - 1
              ? t("setup.finish")
              : t("setup.next")}
          </Button>
        </div>
      </section>
    </main>
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
