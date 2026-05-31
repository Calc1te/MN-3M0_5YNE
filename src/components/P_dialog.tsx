import type { HTMLAttributes } from "react";

import { Textarea, type BitTextareaProps } from "@/components/ui/8bit/textarea";
import { cn } from "@/lib/utils";

export type PDialogProps = Omit<BitTextareaProps, "value"> & {
  value: string;
  containerClassName?: string;
  label?: string;
  isSpeaking?: boolean;
  containerProps?: HTMLAttributes<HTMLDivElement>;
};

export default function PDialog({
  value,
  label,
  isSpeaking = false,
  containerClassName,
  containerProps,
  readOnly = true,
  className,
  ...props
}: PDialogProps) {
  if (!value.trim()) {
    return null;
  }

  return (
    <div
      {...containerProps}
      className={cn(
        "flex flex-col gap-2",
        containerProps?.className,
        containerClassName,
      )}
    >
      {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
      ) : null}
      <Textarea
        {...props}
        value={value}
        readOnly={readOnly}
        className={className}
      />
      {isSpeaking ? (
        <span className="self-end text-xs leading-none text-foreground/70 animate-pulse">
          |
        </span>
      ) : null}
    </div>
  );
}
