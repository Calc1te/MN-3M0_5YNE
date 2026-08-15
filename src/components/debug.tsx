import {
  cursorPosition,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import MemoryAdder from "@/components/memory-adder";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import {
  getGhostModeIgnoreState,
  ghostModeRegionProps,
  onGhostModeChange,
} from "@/lib/ghost-mode";
import { getUIFontClass } from "@/lib/language";
import { cn } from "@/lib/utils";
import {
  BARTENDER_STATES,
  changeBartenderState,
  getBartenderState,
  isBartenderState,
  onBartenderStateChange,
  type BartenderState,
} from "@/uiControllers/bartender";
import {
  getIdleTriggerState,
  onIdleTriggerStateChange,
  type IdleTriggerState,
} from "@/uiControllers/idle-trigger";

type DebugCoordinates = {
  screen: string;
  window: string;
  pointer: string;
};

const isTauriApp =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauriApp ? getCurrentWindow() : null;
const UNAVAILABLE_COORDINATE = "—";

function formatCoordinates(x: number, y: number): string {
  return `${Math.round(x)}, ${Math.round(y)}`;
}

function getBrowserCoordinates(): DebugCoordinates {
  return {
    screen: `${window.screen.width} × ${window.screen.height}`,
    window: formatCoordinates(window.screenX, window.screenY),
    pointer: UNAVAILABLE_COORDINATE,
  };
}

export default function DebugMenu() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const uiFontClass = getUIFontClass(language);
  const [state, setState] = useState<BartenderState>(() => getBartenderState());
  const [idleTrigger, setIdleTrigger] = useState<IdleTriggerState>(() =>
    getIdleTriggerState(),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<DebugCoordinates>(() =>
    isTauriApp
      ? {
          screen: UNAVAILABLE_COORDINATE,
          window: UNAVAILABLE_COORDINATE,
          pointer: UNAVAILABLE_COORDINATE,
        }
      : getBrowserCoordinates(),
  );
  const [isClickEnabled, setIsClickEnabled] = useState<boolean | null>(() => {
    if (!isTauriApp) {
      return true;
    }

    const ignoreState = getGhostModeIgnoreState();
    return ignoreState === null ? null : !ignoreState;
  });

  useEffect(() => onBartenderStateChange(setState), []);
  useEffect(() => onIdleTriggerStateChange(setIdleTrigger), []);
  useEffect(
    () =>
      onGhostModeChange((ignore) => {
        setIsClickEnabled(ignore === null ? null : !ignore);
      }),
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!appWindow) {
      const updateBrowserPointer = (event: MouseEvent) => {
        setCoordinates({
          ...getBrowserCoordinates(),
          pointer: formatCoordinates(event.screenX, event.screenY),
        });
      };

      window.addEventListener("mousemove", updateBrowserPointer);
      return () => {
        window.removeEventListener("mousemove", updateBrowserPointer);
      };
    }

    let isDisposed = false;
    const updateTauriCoordinates = () => {
      void Promise.all([
        currentMonitor(),
        appWindow.outerPosition(),
        cursorPosition(),
      ])
        .then(([monitor, windowPosition, pointerPosition]) => {
          if (isDisposed) {
            return;
          }

          setCoordinates({
            screen: monitor
              ? `${monitor.size.width} × ${monitor.size.height}`
              : UNAVAILABLE_COORDINATE,
            window: formatCoordinates(windowPosition.x, windowPosition.y),
            pointer: formatCoordinates(pointerPosition.x, pointerPosition.y),
          });
        })
        .catch((error: unknown) => {
          console.warn("Failed to load debug window coordinates:", error);
        });
    };

    updateTauriCoordinates();
    const intervalId = window.setInterval(updateTauriCoordinates, 250);
    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  const handleStateChange = (value: string) => {
    if (!isBartenderState(value)) {
      return;
    }
    setState(changeBartenderState(value));
  };

  const countdownText = idleTrigger.running
    ? t("ui.debugIdleCountdownRunning")
    : !idleTrigger.enabled
      ? t("ui.debugIdleCountdownDisabled")
      : `${Math.floor(idleTrigger.remainingMs / 1000)}s`;

  return (
    <details
      {...ghostModeRegionProps}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className={cn(
        "w-full max-w-3xl mx-auto mt-6 border border-border rounded-lg bg-card p-4",
        uiFontClass,
      )}
    >
      <summary className="cursor-pointer select-none font-semibold">
        {t("ui.debug") || "Debug"}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <section className="grid w-full max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            {t("ui.debugScreenResolution")}
          </span>
          <span>{coordinates.screen}</span>
          <span className="text-muted-foreground">
            {t("ui.debugWindowPosition")}
          </span>
          <span>{coordinates.window}</span>
          <span className="text-muted-foreground">
            {t("ui.debugPointerPosition")}
          </span>
          <span>{coordinates.pointer}</span>
          <span className="text-muted-foreground">
            {t("ui.debugClickStatus")}
          </span>
          <span
            className={cn(
              isClickEnabled === true && "text-emerald-400",
              isClickEnabled === false && "text-amber-400",
            )}
          >
            {isClickEnabled === true
              ? t("ui.debugClickEnabled")
              : isClickEnabled === false
                ? t("ui.debugClickThrough")
                : t("ui.debugClickUnknown")}
          </span>
        </section>
        <section className="flex w-full max-w-xs flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="debug-state-select">
            {t("ui.debugState") || "Bartender state"}
          </label>
          <Select value={state} onValueChange={handleStateChange}>
            <SelectTrigger id="debug-state-select" font="normal">
              <SelectValue
                placeholder={t("ui.debugStatePlaceholder") || "Select state"}
                font="normal"
              />
            </SelectTrigger>
            <SelectContent {...ghostModeRegionProps} font="normal">
              {BARTENDER_STATES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
        <section className="flex w-full max-w-xs flex-col gap-2">
          <div className="text-sm font-medium">
            {t("ui.debugIdleCountdown")}
          </div>
          <div className="border border-border rounded px-3 py-2 text-sm">
            {countdownText}
          </div>
        </section>
        <MemoryAdder />
      </div>
    </details>
  );
}
