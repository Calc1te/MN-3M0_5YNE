import { useEffect, useRef, useState, type HTMLAttributes } from "react";

import { Textarea, type BitTextareaProps } from "@/components/ui/8bit/textarea";
import {
  applyTaggedAudioVolume,
  createTaggedAudio,
  hydrateRuntimeAudioVolumes,
  subscribeAudioVolumes,
} from "@/lib/audio-settings";
import {
  getDialogTypingIntervalMs,
  normalizeDialogTypingSpeed,
} from "@/lib/dialog-typing-speed";
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
  const typingIntervalMs = getDialogTypingIntervalMs(typingSpeed);
  const dialogTypingSpeed = normalizeDialogTypingSpeed(typingSpeed);
  const audioSrc = `/assets/sounds/Textsound_34_${dialogTypingSpeed}.ogg`;

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }

    const audio = createTaggedAudio("SE", audioSrc);
    audio.preload = "auto";
    audio.loop = true;
    audio.preservesPitch = true;
    audioRef.current = audio;
    void hydrateRuntimeAudioVolumes().then((volumes) => {
      if (audioRef.current === audio) {
        applyTaggedAudioVolume(audio, "SE", volumes);
      }
    });

    const unsubscribe = subscribeAudioVolumes((volumes) => {
      if (audioRef.current === audio) {
        applyTaggedAudioVolume(audio, "SE", volumes);
      }
    });

    return () => {
      unsubscribe();
      audio.pause();
      audio.currentTime = 0;
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!isSpeaking || !value.trim()) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {});
    }
  }, [audioSrc, isSpeaking, value]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSpeaking) {
      setRenderedValue(value);
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    if (!value.startsWith(renderedValue)) {
      setRenderedValue("");
      return;
    }

    if (renderedValue === value) {
      return;
    }

    typingTimerRef.current = window.setTimeout(() => {
      setRenderedValue(
        value.slice(0, Math.min(value.length, renderedValue.length + 1)),
      );
    }, typingIntervalMs);

    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, [
    typingIntervalMs,
    isSpeaking,
    renderedValue,
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
