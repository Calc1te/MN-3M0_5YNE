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
  idle: "/assets/sprites/idle_placeholder.jpg",
  shaking: "/assets/sprites/idle_placeholder.jpg",
  smoking: "/assets/sprites/idle_placeholder.jpg",
  griefing: "/assets/sprites/idle_placeholder.jpg",
};

export interface PSpriteProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: BartenderState;
  onStateChange?: (state: BartenderState) => void;
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
          src={spriteSrc}
          alt={ariaLabel}
          className="pixelated block max-w-full"
          draggable={false}
        />
      )}
    </div>
  );
}