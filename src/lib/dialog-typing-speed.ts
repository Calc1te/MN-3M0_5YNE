export const DIALOG_TYPING_SPEED_VALUES = ["slow", "medium", "fast"] as const;

export type DialogTypingSpeed = (typeof DIALOG_TYPING_SPEED_VALUES)[number];

export const DEFAULT_DIALOG_TYPING_SPEED: DialogTypingSpeed = "fast";

const DIALOG_TYPING_INTERVALS: Record<DialogTypingSpeed, number> = {
  slow: 72,
  medium: 52,
  fast: 34,
};

export function isDialogTypingSpeed(value: string): value is DialogTypingSpeed {
  return DIALOG_TYPING_SPEED_VALUES.includes(value as DialogTypingSpeed);
}

export function normalizeDialogTypingSpeed(
  value?: string | null,
): DialogTypingSpeed {
  return value && isDialogTypingSpeed(value)
    ? value
    : DEFAULT_DIALOG_TYPING_SPEED;
}

export function getDialogTypingIntervalMs(speed?: string | null): number {
  return DIALOG_TYPING_INTERVALS[normalizeDialogTypingSpeed(speed)];
}
