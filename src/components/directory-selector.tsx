import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

export default function DirectorySelector() {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChangeDirectory = async () => {
    if (!inputPath.trim()) {
      setError("Please enter a directory path");
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
      setSuccess(`Directory changed to: ${result}`);
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
    <div className="p-4 border border-border rounded-lg bg-card">
      <h3 className="font-semibold mb-4">
        {t("ui.directorySelector") || "Directory Selector"}
      </h3>

      {currentPath && (
        <div className="mb-4 p-2 bg-secondary/20 text-secondary-foreground rounded text-sm">
          <strong>Current Path:</strong> {currentPath}
        </div>
      )}

      {error && (
        <div className="mb-4 p-2 bg-destructive/20 text-destructive rounded text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-2 bg-primary/20 text-primary-foreground rounded text-sm">
          {success}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) {
              handleChangeDirectory();
            }
          }}
          placeholder="Enter directory path..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground"
        />
        <button
          onClick={handleChangeDirectory}
          disabled={isLoading || !inputPath.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Changing..." : "Change"}
        </button>
      </div>
    </div>
  );
}
