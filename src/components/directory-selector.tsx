import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/8bit/button";
import { cn } from "@/lib/utils";
import { getAppConfig } from "@/lib/app-config";

export default function DirectorySelector() {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void getAppConfig()
      .then((config) => setCurrentPath(config.Base_Dir || ""))
      .catch((err: unknown) => {
        console.error("Failed to load current directory:", err);
      });
  }, []);

  const handleChooseDirectory = async () => {
    let selected: string | null;
    try {
      selected = await open({
        directory: true,
        multiple: false,
        title: t("ui.directorySelector") || "Base Directory",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to open directory picker";
      setError(errorMessage);
      return;
    }

    if (typeof selected !== "string") {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Call the backend to validate and change directory
      const result = await invoke<string>("change_base_directory", {
        path: selected,
      });

      setCurrentPath(result);
      setSuccess(
        `${t("ui.directoryChanged") || "Directory changed to"}: ${result}`,
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Failed to change directory:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="flex w-full max-w-xl flex-col gap-3">
      <span className="text-sm">
        {t("ui.directorySelector") || "Directory Selector"}
      </span>

      {currentPath && (
        <div className="text-xs text-foreground/70">
          {t("ui.currentPath") || "Current Path"}: {currentPath}
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="text-xs text-foreground/70">
          {success}
        </div>
      )}

      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1 truncate border-y-6 border-[#483D8B] bg-black px-3 py-1.5 text-sm text-white">
          {currentPath || t("ui.directoryUnset") || "No directory selected"}
        </div>
        <Button
          onClick={() => void handleChooseDirectory()}
          disabled={isLoading}
          font="normal"
          className={cn("h-9 shrink-0 px-4", isLoading && "opacity-70")}
        >
          {isLoading
            ? t("ui.directoryChanging") || "Changing..."
            : t("ui.directoryChoose") || "Choose"}
        </Button>
      </div>
    </section>
  );
}
