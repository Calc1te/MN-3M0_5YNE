import * as React from "react";

import { cn } from "@/lib/utils";
import {
  changeBartenderState,
  getBartenderState,
  onBartenderStateChange,
  type BartenderState,
} from "@/uiControllers/bartender";
import "@/components/ui/8bit/styles/retro.css";

const SPRITE_MAP: Record<BartenderState, string> = {
  idle: "/assets/sprites/idle.gif",
  shaking: "/assets/sprites/shaking.gif",
  smoking: "/assets/sprites/smoking.gif",
  lookingAtYou: "/assets/sprites/lookingatyou.gif",
};

export interface PSpriteProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: BartenderState;
  onStateChange?: (state: BartenderState) => void;
  "data-tauri-drag-region"?: boolean | "";
}

export default function PSprite({
  state,
  onStateChange,
  className,
  children,
  ...props
}: PSpriteProps) {
  const [internalState, setInternalState] = React.useState<BartenderState>(
    () => state ?? getBartenderState(),
  );
  const stateRef = React.useRef<BartenderState | undefined>(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    if (state && state !== getBartenderState()) {
      changeBartenderState(state);
    }
  }, [state]);

  React.useEffect(() => {
    return onBartenderStateChange((nextState) => {
      if (stateRef.current === undefined) {
        setInternalState(nextState);
      }
      if (stateRef.current !== nextState) {
        onStateChange?.(nextState);
      }
    });
  }, [onStateChange]);

  const resolvedState = state ?? internalState;
  const ariaLabel =
    props["aria-label"] ?? `Bartender sprite (${resolvedState})`;
  const spriteSrc = SPRITE_MAP[resolvedState];
  const dragRegionProps =
    props["data-tauri-drag-region"] !== undefined
      ? { "data-tauri-drag-region": true }
      : undefined;

  return (
    <div
      {...props}
      className={cn("inline-flex items-center justify-center", className)}
      data-component="p-sprite"
      data-state={resolvedState}
      role="img"
      aria-label={ariaLabel}
    >
      {children ?? (
        <img
          {...dragRegionProps}
          src={spriteSrc}
          alt={ariaLabel}
          className="pixelated pointer-events-none block h-auto w-full max-w-full"
          draggable={false}
        />
      )}
    </div>
  );
}
