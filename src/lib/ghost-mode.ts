import { invoke } from "@tauri-apps/api/core";
import {
  cursorPosition,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";

export const GHOST_CLICK_REGION_SELECTOR = "[data-ghost-click-region='true']";

const isTauriApp =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauriApp ? getCurrentWindow() : null;
const isMacOS =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent);
const isWindows =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

let currentIgnoreState: boolean | null = null;
let recoveryIntervalId: number | null = null;
let recoveryPollInFlight = false;
let ghostModeCommandQueue: Promise<void> = Promise.resolve();
const ghostModeListeners = new Set<(ignore: boolean | null) => void>();

function notifyGhostModeListeners() {
  for (const listener of ghostModeListeners) {
    listener(currentIgnoreState);
  }
}

export function getGhostModeIgnoreState(): boolean | null {
  return currentIgnoreState;
}

export function onGhostModeChange(
  listener: (ignore: boolean | null) => void,
): () => void {
  ghostModeListeners.add(listener);
  return () => {
    ghostModeListeners.delete(listener);
  };
}

const setGhostMode = (ignore: boolean): Promise<void> => {
  if (!isTauriApp) {
    return Promise.resolve();
  }

  if (currentIgnoreState === ignore) {
    return ghostModeCommandQueue;
  }
  currentIgnoreState = ignore;
  notifyGhostModeListeners();

  // Keep native updates ordered. Mouse enter/leave and the recovery poll can
  // otherwise issue opposite requests before macOS applies the first one.
  ghostModeCommandQueue = ghostModeCommandQueue.then(async () => {
    try {
      await invoke("set_ghost_mode", { ignore });
    } catch (error) {
      if (currentIgnoreState === ignore) {
        currentIgnoreState = null;
        notifyGhostModeListeners();
      }
      console.warn("Failed to update click-through state:", error);
    }
  });

  return ghostModeCommandQueue;
};

export const enableClick = () => {
  void setGhostMode(false);
};

export const disableClick = () => {
  void setGhostMode(true);
};

async function isCursorOverClickableRegion(): Promise<boolean> {
  if (!appWindow) {
    return false;
  }

  const [cursor, outerPosition, windowScaleFactor, primary] = await Promise.all([
    cursorPosition(),
    appWindow.outerPosition(),
    appWindow.scaleFactor(),
    primaryMonitor(),
  ]);

  // macOS reports the global cursor using the primary monitor scale factor;
  // Windows reports both values in physical pixels. Convert both to local
  // CSS pixels before hit-testing.
  const cursorScaleFactor = isMacOS
    ? (primary?.scaleFactor ?? windowScaleFactor)
    : windowScaleFactor;
  const windowPositionScaleFactor = windowScaleFactor;
  const localX =
    cursor.x / cursorScaleFactor - outerPosition.x / windowPositionScaleFactor;
  const localY =
    cursor.y / cursorScaleFactor - outerPosition.y / windowPositionScaleFactor;

  if (
    localX < 0 ||
    localY < 0 ||
    localX > window.innerWidth ||
    localY > window.innerHeight
  ) {
    return false;
  }

  const element = document.elementFromPoint(localX, localY);
  return Boolean(element?.closest(GHOST_CLICK_REGION_SELECTOR));
}

async function isDevtoolsOpen(): Promise<boolean> {
  if (!isTauriApp || !import.meta.env.DEV) {
    return false;
  }

  return invoke<boolean>("is_devtools_open");
}

export const startGhostModeRecovery = () => {
  if ((!isMacOS && !isWindows) || recoveryIntervalId !== null) {
    return;
  }

  const poll = () => {
    if (recoveryPollInFlight) {
      return;
    }
    recoveryPollInFlight = true;

    void Promise.all([isCursorOverClickableRegion(), isDevtoolsOpen()])
      .then(([isOverClickableRegion, devtoolsOpen]) =>
        setGhostMode(devtoolsOpen ? false : !isOverClickableRegion),
      )
      .catch(() => {
        // Ignore transient cursor query failures.
      })
      .finally(() => {
        recoveryPollInFlight = false;
      });
  };

  poll();
  recoveryIntervalId = window.setInterval(poll, 120);
};

export const stopGhostModeRecovery = () => {
  if (recoveryIntervalId !== null) {
    window.clearInterval(recoveryIntervalId);
    recoveryIntervalId = null;
  }
};

export const shouldUseGhostModeRecovery = isTauriApp && isMacOS;

export const ghostModeRegionProps = {
  "data-ghost-click-region": "true",
  onMouseEnter: enableClick,
  onMouseLeave: disableClick,
} as const;
