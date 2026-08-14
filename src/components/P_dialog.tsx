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
  const audioPlayPromiseRef = useRef<Promise<void> | null>(null);
  const audioPlaybackGenerationRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const typingIntervalMs = getDialogTypingIntervalMs(typingSpeed);
  const dialogTypingSpeed = normalizeDialogTypingSpeed(typingSpeed);
  const audioSrc = `/assets/sounds/Textsound_34_${dialogTypingSpeed}.ogg`;
  const shouldPlayAudio = isSpeaking && Boolean(value.trim());

  // Keep this in sync during render so a pending play() can see a newer
  // isSpeaking/value state even before its effect runs.
  const shouldPlayAudioRef = useRef(shouldPlayAudio);
  shouldPlayAudioRef.current = shouldPlayAudio;

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
      audioPlaybackGenerationRef.current += 1;
      audioPlayPromiseRef.current = null;
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

    if (!shouldPlayAudio) {
      audioPlaybackGenerationRef.current += 1;
      audioPlayPromiseRef.current = null;
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    if (!audio.paused || audioPlayPromiseRef.current) {
      return;
    }

    const generation = ++audioPlaybackGenerationRef.current;
    const playPromise = audio.play();
    audioPlayPromiseRef.current = playPromise;
    void playPromise
      .then(() => {
        if (
          audioPlaybackGenerationRef.current !== generation ||
          !shouldPlayAudioRef.current
        ) {
          audio.pause();
          audio.currentTime = 0;
        }
      })
      .catch(() => {})
      .finally(() => {
        if (audioPlayPromiseRef.current === playPromise) {
          audioPlayPromiseRef.current = null;
        }
      });
  }, [audioSrc, shouldPlayAudio]);

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
