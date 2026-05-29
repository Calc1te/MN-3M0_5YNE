import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { cn } from "@/lib/utils";

export default function DirectorySelector() {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChangeDirectory = async () => {
    if (!inputPath.trim()) {
      setError(t("ui.directoryRequired") || "Please enter a directory path");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Call the backend to validate and change directory
      const result = await invoke<string>("change_base_directory", {
        path: inputPath,
      });

      setCurrentPath(result);
      setInputPath("");
      setSuccess(`${t("ui.directoryChanged") || "Directory changed to"}: ${result}`);
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
        <Input
          type="text"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) {
              void handleChangeDirectory();
            }
          }}
          placeholder={t("ui.directoryPlaceholder") || "Enter directory path..."}
          disabled={isLoading}
          font="normal"
          className="min-w-0 flex-1 bg-foreground text-background placeholder:text-background/60"
        />
        <Button
          onClick={handleChangeDirectory}
          disabled={isLoading || !inputPath.trim()}
          font="normal"
          className={cn("h-9 shrink-0 px-4 text-background", isLoading && "opacity-70")}
        >
          {isLoading
            ? t("ui.directoryChanging") || "Changing..."
            : t("ui.directoryChange") || "Change"}
        </Button>
      </div>
    </section>
  );
}
