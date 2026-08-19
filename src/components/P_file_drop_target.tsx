import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import PSprite from "@/components/P_sprite";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import { getChatFontClass } from "@/lib/language";
import { cn } from "@/lib/utils";

interface PFileDropTargetProps {
  disabled?: boolean;
  onFilesDropped: (paths: string[]) => void | Promise<void>;
  className?: string;
}

export default function PFileDropTarget({
  disabled = false,
  onFilesDropped,
  className,
}: PFileDropTargetProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const chatFontClass = getChatFontClass(language);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const disabledRef = useRef(disabled);
  const onFilesDroppedRef = useRef(onFilesDropped);
  const isFileOverPRef = useRef(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [isFileOverP, setIsFileOverP] = useState(false);

  disabledRef.current = disabled;
  onFilesDroppedRef.current = onFilesDropped;

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    let scaleFactor = 1;
    const appWindow = getCurrentWindow();
    const appWebview = getCurrentWebview();

    const isOverTarget = (physicalX: number, physicalY: number) => {
      const target = targetRef.current;
      if (!target) {
        return false;
      }

      const rect = target.getBoundingClientRect();
      const logicalX = physicalX / scaleFactor;
      const logicalY = physicalY / scaleFactor;
      return (
        logicalX >= rect.left &&
        logicalX <= rect.right &&
        logicalY >= rect.top &&
        logicalY <= rect.bottom
      );
    };

    void appWindow.scaleFactor().then((factor) => {
      if (!disposed && factor > 0) {
        scaleFactor = factor;
      }
    });

    void appWebview
      .onDragDropEvent(({ payload }) => {
        if (disposed) {
          return;
        }

        if (payload.type === "leave") {
          isFileOverPRef.current = false;
          setIsFileDragActive(false);
          setIsFileOverP(false);
          return;
        }

        const overTarget = isOverTarget(payload.position.x, payload.position.y);
        if (payload.type === "enter" || payload.type === "over") {
          isFileOverPRef.current = overTarget;
          setIsFileDragActive(true);
          setIsFileOverP(overTarget);
          return;
        }

        const droppedOnP = overTarget || isFileOverPRef.current;
        isFileOverPRef.current = false;
        setIsFileDragActive(false);
        setIsFileOverP(false);
        if (droppedOnP && !disabledRef.current) {
          void onFilesDroppedRef.current(payload.paths);
        }
      })
      .then((stopListening) => {
        if (disposed) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      })
      .catch((error: unknown) => {
        console.warn("Failed to register file drop listener:", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div
      className={cn("p-sprite-container relative self-end", className)}
      ref={targetRef}
    >
      <PSprite
        className={cn(
          "w-full transition-[filter] duration-100",
          isFileDragActive && !disabled && "brightness-110",
        )}
        data-tauri-drag-region
        {...ghostModeRegionProps}
      />
      {isFileDragActive && (
        <div
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute inset-0 flex items-end justify-center border-2 border-dashed p-1 text-center text-[9px] leading-3",
            disabled
              ? "border-amber-400 bg-amber-950/60 text-amber-100"
              : isFileOverP
                ? "border-emerald-400 bg-emerald-950/60 text-emerald-100"
                : "border-white/60 bg-black/50 text-white",
            chatFontClass,
          )}
        >
          <span className="bg-black/70 px-1 py-0.5">
            {disabled
              ? t("ui.fileDropBusy")
              : isFileOverP
                ? t("ui.fileDropRelease")
                : t("ui.fileDropTarget")}
          </span>
        </div>
      )}
    </div>
  );
}
