import type * as React from "react";

import type * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";

import "@/components/ui/8bit/styles/retro.css";

export const checkboxVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitCheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  asChild?: boolean;
}

function Checkbox({ className, font, ...props }: BitCheckboxProps) {
  return (
    <div
      className={cn(
        className,
        "relative flex items-center justify-center border-y-6 border-[#483D8B] bg-black text-white"
      )}
    >
      <ShadcnCheckbox
        className={cn(
          className,
          "size-5 rounded-none border-none bg-black text-white ring-0 focus-visible:border-[#483D8B] focus-visible:ring-[#483D8B]/50 data-checked:bg-[#483D8B] data-checked:text-white",
          font !== "normal" && "retro",
        )}
        {...props}
      />

      <div
        className="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-[#483D8B]"
        aria-hidden="true"
      />
    </div>
  );
}

export { Checkbox };
