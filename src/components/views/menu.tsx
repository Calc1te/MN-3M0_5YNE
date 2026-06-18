import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";
import {
  GHOST_CLICK_REGION_SELECTOR,
  handleGhostContextMenuClose,
  handleGhostContextMenuIntent,
  handleGhostContextMenuOpen,
  isWindowsGhostModePlatform,
} from "@/lib/ghost-mode";
import { useRef, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

type MenuProps = {
  children: ReactNode;
};

export default function Menu({ children }: MenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const pointerRef = useRef({ x: 0, y: 0 });

  const rememberPointer = (event: PointerEvent<HTMLElement>) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
    console.debug("[ghost-mode]", "menu:rememberPointer", pointerRef.current);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    console.debug("[ghost-mode]", "menu:openChange", {
      nextOpen,
      pointer: pointerRef.current,
      isWindows: isWindowsGhostModePlatform(),
    });

    if (nextOpen) {
      handleGhostContextMenuOpen();
      return;
    }

    window.requestAnimationFrame(() => {
      const pointer = pointerRef.current;
      if (isWindowsGhostModePlatform()) {
        handleGhostContextMenuClose(pointer);
        return;
      }

      const target = document.elementFromPoint(pointer.x, pointer.y);
      handleGhostContextMenuClose(
        target?.closest(GHOST_CLICK_REGION_SELECTOR) ? pointer : undefined,
      );
    });
  };

  const handleSetting = () => {
    navigate("/settings");
  };
  const handleAbout = () => {
    navigate("/about");
  };

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          className="min-h-screen w-full"
          onPointerDown={rememberPointer}
          onPointerMove={rememberPointer}
          onContextMenuCapture={() => {
            console.debug("[ghost-mode]", "menu:contextmenu-intent");
            handleGhostContextMenuIntent();
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onPointerDown={rememberPointer}
        onPointerMove={rememberPointer}
      >
        <ContextMenuItem onSelect={handleSetting}>
          {t("menu.settings")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleAbout}>{t("menu.about")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
