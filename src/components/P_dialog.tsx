import { useEffect, useRef, useState, type HTMLAttributes } from "react";

import { Textarea, type BitTextareaProps } from "@/components/ui/8bit/textarea";
import {
  applyTaggedAudioVolume,
  createTaggedAudio,
  hydrateRuntimeAudioVolumes,
  subscribeAudioVolumes,
} from "@/lib/audio-settings";
import { getDialogTypingIntervalMs } from "@/lib/dialog-typing-speed";
import { cn } from "@/lib/utils";

export type PDialogProps = Omit<BitTextareaProps, "value"> & {
  value: string;
  containerClassName?: string;
  label?: string;
  isSpeaking?: boolean;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  typingSpeed?: string;
};

export default function PDialog({
  value,
  label,
  isSpeaking = false,
  containerClassName,
  containerProps,
  typingSpeed,
  readOnly = true,
  className,
  ...props
}: PDialogProps) {
  const [renderedValue, setRenderedValue] = useState(value);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const soundIndexRef = useRef(0);
  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const typingIntervalMs = getDialogTypingIntervalMs(typingSpeed);
  const typingChunkSize = isMacPlatform ? 3 : 1;
  const effectiveTypingIntervalMs = isMacPlatform
    ? Math.max(typingIntervalMs - 12, 16)
    : typingIntervalMs;

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }

    const audio = createTaggedAudio("SE", "/assets/sounds/Textsound_34.ogg");
    audio.preload = "auto";
    audioRef.current = audio;
    void hydrateRuntimeAudioVolumes().then((volumes) => {
      if (audioRef.current) {
        applyTaggedAudioVolume(audioRef.current, "SE", volumes);
      }
    });

    const unsubscribe = subscribeAudioVolumes((volumes) => {
      if (audioRef.current) {
        applyTaggedAudioVolume(audioRef.current, "SE", volumes);
      }
    });

    return () => {
      unsubscribe();
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSpeaking) {
      setRenderedValue(value);
      soundIndexRef.current = 0;
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    if (!value.startsWith(renderedValue)) {
      setRenderedValue("");
      soundIndexRef.current = 0;
      return;
    }

    if (renderedValue === value) {
      return;
    }

    const playTypingSound = (char: string) => {
      if (!char.trim()) {
        return;
      }

      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const totalNotes = 35;
      const clipDuration = 3.671655 / totalNotes;
      const nextIndex = soundIndexRef.current % totalNotes;
      soundIndexRef.current += 1;

      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
      }

      audio.pause();
      audio.currentTime = nextIndex * clipDuration;
      void audio.play().catch(() => {});
      pauseTimerRef.current = window.setTimeout(() => {
        audio.pause();
      }, clipDuration * 1000);
    };

    typingTimerRef.current = window.setTimeout(() => {
      const nextChar = value.charAt(renderedValue.length);
      setRenderedValue(
        value.slice(0, Math.min(value.length, renderedValue.length + typingChunkSize)),
      );
      playTypingSound(nextChar);
    }, effectiveTypingIntervalMs);

    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [
    effectiveTypingIntervalMs,
    isSpeaking,
    renderedValue,
    typingChunkSize,
    value,
  ]);

  if (!renderedValue.trim()) {
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
        value={renderedValue}
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
