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
  ghostModeRegionProps,
} from "@/lib/ghost-mode";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

type MenuProps = {
  children: ReactNode;
};

export default function Menu({ children }: MenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const pointerRef = useRef({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement | null>(null);
  const suppressContextMenuUntilRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [menuInstance, setMenuInstance] = useState(0);

  const rememberPointer = (event: ReactPointerEvent<HTMLElement>) => {
    pointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
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

  useEffect(() => {
    const suppressReopen = (event: globalThis.MouseEvent) => {
      if (performance.now() > suppressContextMenuUntilRef.current) {
        return;
      }
      suppressContextMenuUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("contextmenu", suppressReopen, true);
    return () => {
      document.removeEventListener("contextmenu", suppressReopen, true);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeFromOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && contentRef.current?.contains(target)) {
        return;
      }

      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (event.button === 2) {
        suppressContextMenuUntilRef.current = performance.now() + 500;
      }
      setMenuInstance((current) => current + 1);
      handleOpenChange(false);
    };

    document.addEventListener("pointerdown", closeFromOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutsidePointer, true);
    };
  }, [isOpen]);

  const handleSetting = () => {
    navigate("/settings");
  };
  const handleAbout = () => {
    navigate("/about");
  };

  return (
    <ContextMenu key={menuInstance} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>
        <div
          className="min-h-screen w-full"
          data-ghost-click-region={isOpen ? "true" : undefined}
          onPointerDown={rememberPointer}
          onPointerMove={rememberPointer}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        ref={contentRef}
        {...ghostModeRegionProps}
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
