import { invoke } from "@tauri-apps/api/core";
import { GlassWater, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/8bit/context-menu";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import {
  clearBarCounterDrink,
  getBarCounterDrink,
  onBarCounterDrinkChange,
  showBarCounterDrink,
  type BarCounterDrinkSelection,
} from "@/uiControllers/bar-counter-drink";

type StagedFile = {
  original_path: string;
  staged_path: string;
};

type StagedDrink = {
  drink_id: string;
  staged_dir: string;
  staged_files: StagedFile[];
  modified_unix_secs: number | null;
};

type DrinkAction = "drink" | "restore";
type MenuMode = "current" | "all";

interface BarCounterDrinkMenuProps {
  disabled?: boolean;
  onActionError?: (message: string) => void;
}

const isTauriApp =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function drinkLabel(drink: StagedDrink): string {
  const firstFile = drink.staged_files[0];
  if (!firstFile) {
    return drink.drink_id;
  }
  const remaining = drink.staged_files.length - 1;
  return remaining > 0
    ? `${fileName(firstFile.original_path)} +${remaining}`
    : fileName(firstFile.original_path);
}

export default function BarCounterDrinkMenu({
  disabled = false,
  onActionError,
}: BarCounterDrinkMenuProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<BarCounterDrinkSelection>(() =>
    getBarCounterDrink(),
  );
  const [drinks, setDrinks] = useState<StagedDrink[]>([]);
  const [menuMode, setMenuMode] = useState<MenuMode>("current");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingDrinkId, setPendingDrinkId] = useState<string | null>(null);
  const openingCurrentMenuRef = useRef(false);

  const refreshDrinks = useCallback(async () => {
    if (!isTauriApp) {
      return;
    }

    try {
      const nextDrinks = await invoke<StagedDrink[]>("debug_staged_drinks");
      setDrinks(nextDrinks);

      const selected = getBarCounterDrink();
      if (!selected.drinkId && selected.sprite) {
        return;
      }
      if (
        selected.drinkId &&
        nextDrinks.some((drink) => drink.drink_id === selected.drinkId)
      ) {
        return;
      }

      if (nextDrinks[0]) {
        showBarCounterDrink(nextDrinks[0].drink_id);
      } else if (selected.drinkId) {
        clearBarCounterDrink(selected.drinkId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Failed to load staged drinks:", error);
      onActionError?.(message);
    }
  }, [onActionError]);

  useEffect(() => {
    void refreshDrinks();
    return onBarCounterDrinkChange((nextSelection) => {
      setSelection(nextSelection);
      void refreshDrinks();
    });
  }, [refreshDrinks]);

  const finalizeDrink = async (drinkId: string, action: DrinkAction) => {
    if (disabled || pendingDrinkId || !isTauriApp) {
      return;
    }

    setPendingDrinkId(drinkId);
    onActionError?.("");
    try {
      await invoke("finalize_drink", { drinkId, action });
      const remaining = drinks.filter((drink) => drink.drink_id !== drinkId);
      setDrinks(remaining);

      if (selection.drinkId === drinkId) {
        if (remaining[0]) {
          showBarCounterDrink(remaining[0].drink_id);
        } else {
          clearBarCounterDrink(drinkId);
        }
      } else {
        clearBarCounterDrink(drinkId);
      }
      setIsMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to finalize drink:", error);
      onActionError?.(message);
    } finally {
      setPendingDrinkId(null);
      void refreshDrinks();
    }
  };

  const currentDrink = drinks.find(
    (drink) => drink.drink_id === selection.drinkId,
  );
  const isInteractive = Boolean(currentDrink && !disabled && !pendingDrinkId);

  const openCurrentMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!isInteractive) {
      return;
    }

    flushSync(() => setMenuMode("current"));
    openingCurrentMenuRef.current = true;
    event.currentTarget.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: 2,
      }),
    );
    openingCurrentMenuRef.current = false;
  };

  const openAllMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!openingCurrentMenuRef.current) {
      flushSync(() => setMenuMode("all"));
    }
  };

  if (!selection.sprite) {
    return null;
  }

  const actionItems = (drink: StagedDrink) => {
    const actionPending = pendingDrinkId === drink.drink_id;
    return (
      <>
        <ContextMenuItem
          disabled={disabled || actionPending}
          onSelect={() => void finalizeDrink(drink.drink_id, "drink")}
        >
          <GlassWater className="mr-2 size-4" />
          {actionPending ? t("ui.drinkMenuWorking") : t("ui.drinkMenuDrink")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled || actionPending}
          onSelect={() => void finalizeDrink(drink.drink_id, "restore")}
        >
          <RotateCcw className="mr-2 size-4" />
          {actionPending
            ? t("ui.drinkMenuWorking")
            : t("ui.drinkMenuRestore")}
        </ContextMenuItem>
      </>
    );
  };

  return (
    <ContextMenu onOpenChange={setIsMenuOpen}>
      <ContextMenuTrigger asChild>
        <button
          {...ghostModeRegionProps}
          type="button"
          className="pixelated absolute left-[51px] top-[23px] z-10 block cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default"
          aria-label={
            currentDrink
              ? t("ui.drinkMenuCurrent", { drink: drinkLabel(currentDrink) })
              : t("ui.drinkMenuPreview")
          }
          title={
            currentDrink
              ? t("ui.drinkMenuCurrent", { drink: drinkLabel(currentDrink) })
              : t("ui.drinkMenuPreview")
          }
          disabled={!isInteractive}
          onClick={openCurrentMenu}
          onContextMenu={openAllMenu}
        >
          <img
            src={selection.sprite}
            alt=""
            aria-hidden="true"
            className="block"
            draggable={false}
          />
        </button>
      </ContextMenuTrigger>

      {isMenuOpen && (
        <div
          {...ghostModeRegionProps}
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      )}

      <ContextMenuContent {...ghostModeRegionProps} className="max-w-64">
        {menuMode === "current" && currentDrink ? (
          <>
            <ContextMenuLabel className="max-w-56 truncate" title={drinkLabel(currentDrink)}>
              {t("ui.drinkMenuCurrent", { drink: drinkLabel(currentDrink) })}
            </ContextMenuLabel>
            {actionItems(currentDrink)}
          </>
        ) : (
          <>
            <ContextMenuLabel>
              {t("ui.drinkMenuPending", { count: drinks.length })}
            </ContextMenuLabel>
            {drinks.map((drink) => (
              <ContextMenuSub key={drink.drink_id}>
                <ContextMenuSubTrigger
                  className="max-w-60"
                  onPointerEnter={() => showBarCounterDrink(drink.drink_id)}
                  title={drink.drink_id}
                >
                  <span className="truncate">{drinkLabel(drink)}</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent {...ghostModeRegionProps}>
                  {actionItems(drink)}
                </ContextMenuSubContent>
              </ContextMenuSub>
            ))}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
