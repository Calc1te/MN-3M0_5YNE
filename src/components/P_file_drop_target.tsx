import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  cursorPosition,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import PSprite from "@/components/P_sprite";
import {
  getBarCounterDrinkSprite,
  onBarCounterDrinkChange,
} from "@/uiControllers/bar-counter-drink";
import { enableClick, ghostModeRegionProps } from "@/lib/ghost-mode";
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
  const dragPathsRef = useRef<string[]>([]);
  const dragSessionRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [isFileOverP, setIsFileOverP] = useState(false);
  const [barCounterDrink, setBarCounterDrink] = useState(() =>
    getBarCounterDrinkSprite(),
  );

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

    const containsLogicalPoint = (x: number, y: number) => {
      const target = targetRef.current;
      if (!target) {
        return false;
      }

      const rect = target.getBoundingClientRect();
      return (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      );
    };

    const isOverTarget = (physicalX: number, physicalY: number) =>
      containsLogicalPoint(physicalX / scaleFactor, physicalY / scaleFactor) ||
      containsLogicalPoint(physicalX, physicalY);

    const isCursorOverTarget = async () => {
      const [cursor, windowPosition, primary] = await Promise.all([
        cursorPosition(),
        appWindow.outerPosition(),
        primaryMonitor(),
      ]);
      const cursorScaleFactor = primary?.scaleFactor ?? scaleFactor;
      return containsLogicalPoint(
        cursor.x / cursorScaleFactor - windowPosition.x / scaleFactor,
        cursor.y / cursorScaleFactor - windowPosition.y / scaleFactor,
      );
    };

    void appWindow.scaleFactor().then((factor) => {
      if (!disposed && factor > 0) {
        scaleFactor = factor;
      }
    });

    void appWebview
      .onDragDropEvent(async ({ payload }) => {
        if (disposed) {
          return;
        }

        if (payload.type === "leave") {
          const session = dragSessionRef.current;
          const wasOverP = isFileOverPRef.current;
          isFileOverPRef.current = false;
          setIsFileDragActive(false);
          setIsFileOverP(false);

          window.setTimeout(() => {
            const paths = dragPathsRef.current;
            if (
              disposed ||
              session !== dragSessionRef.current ||
              !wasOverP ||
              paths.length === 0
            ) {
              return;
            }

            void isCursorOverTarget()
              .then((droppedOnP) => {
                console.debug("[file-drop] leave fallback", {
                  pathCount: paths.length,
                  droppedOnP,
                  disabled: disabledRef.current,
                });
                if (
                  !disposed &&
                  droppedOnP &&
                  !disabledRef.current &&
                  session === dragSessionRef.current
                ) {
                  dragPathsRef.current = [];
                  void onFilesDroppedRef.current(paths);
                }
              })
              .catch((error: unknown) => {
                console.warn("Failed to verify file drop leave position:", error);
              });
          }, 80);
          return;
        }

        const overTarget = isOverTarget(payload.position.x, payload.position.y);
        if (payload.type === "enter" || payload.type === "over") {
          enableClick();
          if (payload.type === "enter") {
            dragSessionRef.current += 1;
            dragPathsRef.current = payload.paths;
            console.debug("[file-drop] enter", {
              pathCount: payload.paths.length,
              overTarget,
            });
          }
          isFileOverPRef.current = overTarget;
          setIsFileDragActive(true);
          setIsFileOverP(overTarget);
          return;
        }

        const wasOverP = isFileOverPRef.current;
        dragPathsRef.current = [];
        isFileOverPRef.current = false;
        setIsFileDragActive(false);
        setIsFileOverP(false);

        let droppedOnP = overTarget || wasOverP;
        if (!droppedOnP) {
          try {
            droppedOnP = await isCursorOverTarget();
          } catch (error) {
            console.warn("Failed to verify file drop position:", error);
          }
        }

        console.debug("[file-drop] received", {
          pathCount: payload.paths.length,
          droppedOnP,
          disabled: disabledRef.current,
        });
        if (!disposed && droppedOnP && !disabledRef.current) {
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

  useEffect(() => onBarCounterDrinkChange(setBarCounterDrink), []);

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
      {barCounterDrink && (
        <img
          src={barCounterDrink}
          alt=""
          aria-hidden="true"
          className="pixelated pointer-events-none absolute left-[51px] top-[23px] z-10 block"
          draggable={false}
        />
      )}
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
