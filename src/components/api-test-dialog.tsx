import { useState } from "react";
import { chatWithBartenderAndTools, type ChatTurn } from "@/api_caller";
import { useTranslation } from "react-i18next";

export default function ApiTestDialog() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatWithBartenderAndTools(input, history);
      const toolSummary =
        response.toolResults.length > 0
          ? `\n\n[tool results]\n${JSON.stringify(response.toolResults, null, 2)}`
          : "";

      // Add user message and assistant response to history
      const newHistory: ChatTurn[] = [
        ...history,
        { role: "user", content: input },
        {
          role: "assistant",
          content: `${response.finalReply.assistant}${toolSummary}`,
        },
      ];
      setHistory(newHistory);
      setInput("");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("API call failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    setInput("");
    setError(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        {t("ui.apiTest") || "API Test"}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-card border border-border rounded-lg shadow-lg p-4 max-h-96 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">{t("ui.apiTest") || "Bartender API Test"}</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 border border-border rounded p-2 bg-background/50">
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("ui.noMessages") || "No messages yet"}</p>
        ) : (
          <div className="space-y-2">
            {history.map((msg, idx) => (
              <div
                key={idx}
                className={`text-sm p-2 rounded ${
                  msg.role === "user"
                    ? "bg-primary/20 text-primary-foreground/90"
                    : "bg-secondary/20 text-secondary-foreground/90"
                }`}
              >
                <strong>{msg.role === "assistant" ? "P" : msg.role}:</strong> {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-2 bg-destructive/20 text-destructive text-sm rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) {
              handleSendMessage();
            }
          }}
          placeholder={t("ui.inputPlaceholder") || "Enter message..."}
          disabled={isLoading}
          className="flex-1 px-3 py-2 border border-border rounded text-sm bg-background text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim()}
          className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
        <button
          onClick={handleClearHistory}
          className="px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/90"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
