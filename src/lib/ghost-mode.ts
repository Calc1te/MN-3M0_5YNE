import { invoke } from "@tauri-apps/api/core";

export const GHOST_CLICK_REGION_SELECTOR = "[data-ghost-click-region='true']";

const IS_WINDOWS =
  typeof navigator !== "undefined" &&
  /Windows/i.test(navigator.userAgent);

let windowsRegionHoverDepth = 0;
let windowsContextMenuOpen = false;
let lastIgnoreState: boolean | null = null;
let windowsLeaveTimeout: number | null = null;
let windowsContextMenuIntentUntil = 0;

function debugGhostMode(event: string, detail?: Record<string, unknown>) {
  if (typeof console === "undefined") {
    return;
  }

  console.debug("[ghost-mode]", event, {
    platform: IS_WINDOWS ? "windows" : "non-windows",
    hoverDepth: windowsRegionHoverDepth,
    contextMenuOpen: windowsContextMenuOpen,
    contextMenuIntentActive: Date.now() < windowsContextMenuIntentUntil,
    ignoreState: lastIgnoreState,
    ...detail,
  });
}

function clearWindowsLeaveTimeout() {
  if (windowsLeaveTimeout !== null && typeof window !== "undefined") {
    window.clearTimeout(windowsLeaveTimeout);
    windowsLeaveTimeout = null;
  }
}

function setGhostMode(ignore: boolean) {
  if (lastIgnoreState === ignore) {
    debugGhostMode("setGhostMode:skip", { ignore });
    return;
  }

  lastIgnoreState = ignore;
  debugGhostMode("setGhostMode:apply", { ignore });
  void invoke("set_ghost_mode", { ignore });
}

function syncWindowsGhostMode() {
  debugGhostMode("syncWindowsGhostMode");
  const keepClickable =
    windowsContextMenuOpen ||
    windowsRegionHoverDepth > 0 ||
    Date.now() < windowsContextMenuIntentUntil;
  setGhostMode(!keepClickable);
}

export const enableClick = () => {
  debugGhostMode("enableClick");
  setGhostMode(false);
};

export const disableClick = () => {
  debugGhostMode("disableClick");
  setGhostMode(true);
};

export function isWindowsGhostModePlatform() {
  return IS_WINDOWS;
}

export function reconcileGhostModeFromPoint(x: number, y: number) {
  if (!IS_WINDOWS || typeof document === "undefined") {
    return;
  }

  const hoveredGhostRegion = document
    .elementFromPoint(x, y)
    ?.closest(GHOST_CLICK_REGION_SELECTOR);
  debugGhostMode("reconcileGhostModeFromPoint", {
    x,
    y,
    hoveredGhostRegion: Boolean(hoveredGhostRegion),
  });
  windowsRegionHoverDepth = hoveredGhostRegion ? 1 : 0;
  syncWindowsGhostMode();
}

function handleGhostRegionEnter() {
  if (!IS_WINDOWS) {
    enableClick();
    return;
  }

  clearWindowsLeaveTimeout();
  windowsRegionHoverDepth += 1;
  debugGhostMode("handleGhostRegionEnter");
  syncWindowsGhostMode();
}

function handleGhostRegionLeave() {
  if (!IS_WINDOWS) {
    disableClick();
    return;
  }

  windowsRegionHoverDepth = Math.max(0, windowsRegionHoverDepth - 1);
  clearWindowsLeaveTimeout();
  debugGhostMode("handleGhostRegionLeave:schedule");
  windowsLeaveTimeout = window.setTimeout(() => {
    windowsLeaveTimeout = null;
    debugGhostMode("handleGhostRegionLeave:flush");
    syncWindowsGhostMode();
  }, 160);
}

export function handleGhostContextMenuOpen() {
  if (!IS_WINDOWS) {
    enableClick();
    return;
  }

  clearWindowsLeaveTimeout();
  windowsContextMenuIntentUntil = 0;
  windowsContextMenuOpen = true;
  debugGhostMode("handleGhostContextMenuOpen");
  syncWindowsGhostMode();
}

export function handleGhostContextMenuIntent() {
  if (!IS_WINDOWS) {
    return;
  }

  clearWindowsLeaveTimeout();
  windowsContextMenuIntentUntil = Date.now() + 300;
  debugGhostMode("handleGhostContextMenuIntent");
  syncWindowsGhostMode();
}

export function handleGhostContextMenuClose(pointer?: { x: number; y: number }) {
  debugGhostMode("handleGhostContextMenuClose", { pointer });
  if (!IS_WINDOWS) {
    if (pointer) {
      const target = document.elementFromPoint(pointer.x, pointer.y);
      if (target?.closest(GHOST_CLICK_REGION_SELECTOR)) {
        enableClick();
      } else {
        disableClick();
      }
      return;
    }

    disableClick();
    return;
  }

  clearWindowsLeaveTimeout();
  windowsContextMenuOpen = false;
  windowsContextMenuIntentUntil = 0;
  if (pointer) {
    reconcileGhostModeFromPoint(pointer.x, pointer.y);
    return;
  }
  syncWindowsGhostMode();
}

export const ghostModeRegionProps = {
  "data-ghost-click-region": "true",
  onMouseEnter: handleGhostRegionEnter,
  onMouseLeave: handleGhostRegionLeave,
} as const;
