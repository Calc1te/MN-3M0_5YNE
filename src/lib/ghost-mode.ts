import { invoke } from "@tauri-apps/api/core";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";

export const GHOST_CLICK_REGION_SELECTOR = "[data-ghost-click-region='true']";

const appWindow = getCurrentWindow();
const isMacOS =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent);

let currentIgnoreState: boolean | null = null;
let recoveryIntervalId: number | null = null;

const setGhostMode = async (ignore: boolean) => {
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

export const startGhostModeRecovery = () => {
  if (!isMacOS || recoveryIntervalId !== null) {
    return;
  }

  const poll = () => {
    void isCursorOverClickableRegion()
      .then((isOverClickableRegion) => setGhostMode(!isOverClickableRegion))
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

export const shouldUseGhostModeRecovery = isMacOS;

export const ghostModeRegionProps = {
  "data-ghost-click-region": "true",
  onMouseEnter: enableClick,
  onMouseLeave: disableClick,
} as const;
