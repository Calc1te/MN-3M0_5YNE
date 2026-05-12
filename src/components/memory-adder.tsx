import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AddMemoryResponse {
  id: string;
  text: string;
  vector: [number, number, number];
}

export default function MemoryAdder() {
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<AddMemoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAddMemory = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Please enter a memory");
      return;
    }

    setIsSaving(true);
    setError(null);
    setResult(null);

    try {
      const saved = await invoke<AddMemoryResponse>("add_memory", {
        text: trimmed,
      });
      setResult(saved);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 border border-border rounded-lg bg-card">
      <h3 className="font-semibold mb-4">Memory</h3>

      {error && (
        <div className="mb-4 p-2 bg-destructive/20 text-destructive rounded text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 p-2 bg-primary/20 text-primary-foreground rounded text-sm">
          Saved memory: {result.id}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isSaving) {
              void handleAddMemory();
            }
          }}
          placeholder="Add a memory..."
          disabled={isSaving}
          className="flex-1 px-3 py-2 border border-border rounded bg-background text-foreground placeholder:text-muted-foreground"
        />
        <button
          onClick={() => void handleAddMemory()}
          disabled={isSaving || !text.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Add"}
        </button>
      </div>
    </div>
  );
}
