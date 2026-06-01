import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
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

export interface BitTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
}

function Textarea({ ...props }: BitTextareaProps) {
  const { className, font } = props;

  return (
    <div className={cn(className, "relative w-full bg-black text-white")}>
      <ShadcnTextarea
        {...props}
        className={cn(
          className,
          "rounded-none border-0 bg-black text-white ring-0 transition-transform placeholder:text-white/60 focus-visible:border-[#483D8B] focus-visible:ring-[#483D8B]/50 disabled:bg-black/70",
          font !== "normal" && "retro",
        )}
      />

      <div
        className="pointer-events-none absolute inset-0 -my-1.5 border-y-6 border-[#483D8B]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-[#483D8B]"
        aria-hidden="true"
      />
    </div>
  );
}

export { Textarea };
