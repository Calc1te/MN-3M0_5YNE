import { invoke } from "@tauri-apps/api/core";

export const enableClick = () => {
  void invoke("set_ghost_mode", { ignore: false });
};

export const disableClick = () => {
  void invoke("set_ghost_mode", { ignore: true });
};

export const ghostModeRegionProps = {
  onMouseEnter: enableClick,
  onMouseLeave: disableClick,
};
