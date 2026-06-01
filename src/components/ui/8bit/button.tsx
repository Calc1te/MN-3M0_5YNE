import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Button as ShadcnButton } from "@/components/ui/button";

import "@/components/ui/8bit/styles/retro.css";

export const buttonVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
    variant: {
      default: "bg-black text-white",
      destructive: "bg-black text-white",
      outline: "bg-black text-white",
      secondary: "bg-black text-white",
      ghost: "bg-black text-white hover:bg-black",
      link: "text-white underline-offset-4 hover:underline",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface BitButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({ children, asChild, ...props }: BitButtonProps) {
  const { variant, size, className, font } = props;

  return (
    <ShadcnButton
      {...props}
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 rounded-none border-none transition-transform active:translate-y-1",
        size === "icon" && "mx-1 my-0",
        font !== "normal" && "retro",
        className,
        "bg-black text-white hover:bg-black hover:text-white focus-visible:border-[#483D8B] focus-visible:ring-[#483D8B]/50"
      )}
      size={size}
      variant={variant}
      asChild={asChild}
    >
      {asChild ? (
        <span className="relative inline-flex items-center justify-center gap-1.5">
          {children}

          {variant !== "ghost" && variant !== "link" && size !== "icon" && (
            <>
              {/* Pixelated border */}
              <div className="absolute -top-1.5 w-1/2 left-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -top-1.5 w-1/2 right-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -bottom-1.5 w-1/2 left-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -bottom-1.5 w-1/2 right-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute top-0 left-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute top-0 right-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute bottom-0 left-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute bottom-0 right-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5 bg-[#483D8B]" />
              <div className="absolute top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5 bg-[#483D8B]" />
              {variant !== "outline" && (
                <>
                  {/* Top shadow */}
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-white/15" />
                  <div className="absolute top-1.5 left-0 w-3 h-1.5 bg-white/15" />

                  {/* Bottom shadow */}
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/15" />
                  <div className="absolute bottom-1.5 right-0 w-3 h-1.5 bg-white/15" />
                </>
              )}
            </>
          )}

          {size === "icon" && (
            <>
              <div className="absolute top-0 left-0 w-full h-[5px] md:h-1.5 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-0 w-full h-[5px] md:h-1.5 bg-[#483D8B] pointer-events-none" />
              <div className="absolute top-1 -left-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-1 -left-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute top-1 -right-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-1 -right-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
            </>
          )}
        </span>
      ) : (
        <>
          {children}

          {variant !== "ghost" && variant !== "link" && size !== "icon" && (
            <>
              {/* Pixelated border */}
              <div className="absolute -top-1.5 w-1/2 left-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -top-1.5 w-1/2 right-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -bottom-1.5 w-1/2 left-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute -bottom-1.5 w-1/2 right-1.5 h-1.5 bg-[#483D8B]" />
              <div className="absolute top-0 left-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute top-0 right-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute bottom-0 left-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute bottom-0 right-0 size-1.5 bg-[#483D8B]" />
              <div className="absolute top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5 bg-[#483D8B]" />
              <div className="absolute top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5 bg-[#483D8B]" />
              {variant !== "outline" && (
                <>
                  {/* Top shadow */}
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-white/15" />
                  <div className="absolute top-1.5 left-0 w-3 h-1.5 bg-white/15" />

                  {/* Bottom shadow */}
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/15" />
                  <div className="absolute bottom-1.5 right-0 w-3 h-1.5 bg-white/15" />
                </>
              )}
            </>
          )}

          {size === "icon" && (
            <>
              <div className="absolute top-0 left-0 w-full h-[5px] md:h-1.5 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-0 w-full h-[5px] md:h-1.5 bg-[#483D8B] pointer-events-none" />
              <div className="absolute top-1 -left-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-1 -left-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute top-1 -right-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
              <div className="absolute bottom-1 -right-1 w-[5px] md:w-1.5 h-1/2 bg-[#483D8B] pointer-events-none" />
            </>
          )}
        </>
      )}
    </ShadcnButton>
  );
}

export { Button };
