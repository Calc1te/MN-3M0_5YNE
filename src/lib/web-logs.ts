import { invoke } from "@tauri-apps/api/core";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

let installed = false;

function serializeConsoleArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeWebLog(level: ConsoleLevel, parts: unknown[]) {
  const message = parts.map(serializeConsoleArg).join(" ").trim();
  if (!message) {
    return;
  }

  void invoke("append_web_log", {
    level,
    message,
  }).catch(() => {
    // Ignore logging failures to avoid recursive console noise.
  });
}

export function installWebLogCapture() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  const levels: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      writeWebLog(level, args);
    };
  }

  window.addEventListener("error", (event) => {
    const detail = event.error instanceof Error
      ? event.error.stack || `${event.error.name}: ${event.error.message}`
      : event.message;
    writeWebLog("error", [`window.error`, detail, event.filename, event.lineno, event.colno]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    writeWebLog("error", ["window.unhandledrejection", event.reason]);
  });
}
