import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";

export const GHOST_CLICK_REGION_SELECTOR = "[data-ghost-click-region='true']";

const isTauriApp =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauriApp ? getCurrentWindow() : null;
const isMacOS =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent);

let currentIgnoreState: boolean | null = null;
let recoveryIntervalId: number | null = null;

const setGhostMode = async (ignore: boolean) => {
  if (!isTauriApp) {
    return;
  }

  if (currentIgnoreState === ignore) {
    return;
  }
  currentIgnoreState = ignore;
  await invoke("set_ghost_mode", { ignore });
};

export const enableClick = () => {
  stopGhostModeRecovery();
  void setGhostMode(false);
};

export const disableClick = () => {
  void setGhostMode(true);
};

async function isCursorOverClickableRegion(): Promise<boolean> {
  if (!appWindow) {
    return false;
  }

  const [cursor, outerPosition, scaleFactor] = await Promise.all([
    cursorPosition(),
    appWindow.outerPosition(),
    appWindow.scaleFactor(),
  ]);

  const localX = (cursor.x - outerPosition.x) / scaleFactor;
  const localY = (cursor.y - outerPosition.y) / scaleFactor;

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
  if (!isMacOS || recoveryIntervalId !== null) {
    return;
  }

  const poll = () => {
    void Promise.all([isCursorOverClickableRegion(), isDevtoolsOpen()])
      .then(([isOverClickableRegion, devtoolsOpen]) =>
        setGhostMode(devtoolsOpen ? false : !isOverClickableRegion),
      )
      .catch(() => {
        // Ignore transient cursor query failures.
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
