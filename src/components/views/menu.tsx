import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/8bit/context-menu.tsx";
import {
  disableClick,
  enableClick,
  GHOST_CLICK_REGION_SELECTOR,
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
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      enableClick();
      return;
    }
    // set back pointer status of original position
    window.requestAnimationFrame(() => {
      const { x, y } = pointerRef.current;
      const target = document.elementFromPoint(x, y);
      if (target?.closest(GHOST_CLICK_REGION_SELECTOR)) {
        enableClick();
      } else {
        disableClick();
      }
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
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onPointerDown={rememberPointer}
        onPointerMove={rememberPointer}
        onMouseEnter={enableClick}
      >
        <ContextMenuItem onSelect={handleSetting}>
          {t("menu.settings")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleAbout}>{t("menu.about")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
