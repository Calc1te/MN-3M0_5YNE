import * as React from "react";

import { Button, type BitButtonProps } from "@/components/ui/8bit/button";
import { Input, type BitInputProps } from "@/components/ui/8bit/input";
import { cn } from "@/lib/utils";

export interface UserInputProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "onSubmit"> {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  buttonLabel?: string;
  disabled?: boolean;
  disableSubmitWhenEmpty?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  inputProps?: Omit<BitInputProps, "value" | "onChange" | "placeholder" | "disabled">;
  buttonProps?: Omit<BitButtonProps, "disabled" | "children">;
}

export default function UserInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  buttonLabel = "Send",
  disabled = false,
  disableSubmitWhenEmpty = true,
  className,
  inputClassName,
  buttonClassName,
  inputProps,
  buttonProps,
  ...containerProps
}: UserInputProps) {
  const {
    onKeyDown: inputOnKeyDown,
    className: inputPropsClassName,
    type: inputType,
    ...restInputProps
  } = inputProps ?? {};
  const {
    onClick: buttonOnClick,
    className: buttonPropsClassName,
    ...restButtonProps
  } = buttonProps ?? {};
  const isSubmitDisabled =
    disabled || (disableSubmitWhenEmpty && !value.trim());

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    inputOnKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isSubmitDisabled) {
        onSubmit?.(value);
      }
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    buttonOnClick?.(event);
    if (event.defaultPrevented || isSubmitDisabled) {
      return;
    }
    onSubmit?.(value);
  };

  return (
    <div
      {...containerProps}
      className={cn("flex items-center gap-2", className)}
    >
      <Input
        {...restInputProps}
        type={inputType ?? "text"}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(inputPropsClassName, inputClassName)}
      />
      <Button
        {...restButtonProps}
        onClick={handleClick}
        disabled={isSubmitDisabled}
        className={cn("text-primary-foreground", buttonPropsClassName, buttonClassName)}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
