import { useEffect, useRef } from "react";

import {
  applyTaggedAudioVolume,
  createTaggedAudio,
  hydrateRuntimeAudioVolumes,
  subscribeAudioVolumes,
} from "@/lib/audio-settings";

export function useButtonClickSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }

    const audio = createTaggedAudio("SE", "/assets/sounds/button_confirm.ogg");
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

  return () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  };
}
