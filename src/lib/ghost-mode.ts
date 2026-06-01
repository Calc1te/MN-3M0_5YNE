import { invoke } from "@tauri-apps/api/core";

export const GHOST_CLICK_REGION_SELECTOR = "[data-ghost-click-region='true']";

export const enableClick = () => {
  void invoke("set_ghost_mode", { ignore: false });
};

export const disableClick = () => {
  void invoke("set_ghost_mode", { ignore: true });
};

export const ghostModeRegionProps = {
  "data-ghost-click-region": "true",
  onMouseEnter: enableClick,
  onMouseLeave: disableClick,
} as const;
