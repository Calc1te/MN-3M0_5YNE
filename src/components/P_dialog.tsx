import { Textarea, type BitTextareaProps } from "@/components/ui/8bit/textarea";
import { cn } from "@/lib/utils";

export type PDialogProps = Omit<BitTextareaProps, "value"> & {
value: string;
containerClassName?: string;
label?: string;
};

export default function PDialog({
value,
label,
containerClassName,
readOnly = true,
className,
...props
}: PDialogProps) {
if (!value.trim()) {
    return null;
}

return (
    <div className={cn("flex flex-col gap-2", containerClassName)}>
    {label ? (
        <span className="text-xs text-muted-foreground">{label}</span>
    ) : null}
    <Textarea
        {...props}
        value={value}
        readOnly={readOnly}
        className={className}
    />
    </div>
);
}
