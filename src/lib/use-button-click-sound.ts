import { useEffect } from "react";

import {
  getRuntimeAudioVolumes,
  hydrateRuntimeAudioVolumes,
  subscribeAudioVolumes,
} from "@/lib/audio-settings";

type AudioContextConstructor = new () => AudioContext;
type AudioContextWindow = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

let sharedAudioContext: AudioContext | null = null;
let sharedButtonSoundGain: GainNode | null = null;
let sharedButtonSoundBuffer: AudioBuffer | null = null;
let buttonSoundLoadPromise: Promise<AudioBuffer | null> | null = null;
let audioVolumeHydrationPromise: Promise<unknown> | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (sharedAudioContext) {
    return sharedAudioContext;
  }

  const audioWindow = window as AudioContextWindow;
  const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  sharedAudioContext = new AudioContextClass();
  sharedButtonSoundGain = sharedAudioContext.createGain();
  sharedButtonSoundGain.gain.value = getRuntimeAudioVolumes().SE;
  sharedButtonSoundGain.connect(sharedAudioContext.destination);
  subscribeAudioVolumes((volumes) => {
    if (sharedButtonSoundGain) {
      sharedButtonSoundGain.gain.value = volumes.SE;
    }
  });

  return sharedAudioContext;
}

function preloadButtonSound(): Promise<AudioBuffer | null> {
  if (sharedButtonSoundBuffer) {
    return Promise.resolve(sharedButtonSoundBuffer);
  }

  if (buttonSoundLoadPromise) {
    return buttonSoundLoadPromise;
  }

  const audioContext = getSharedAudioContext();
  if (!audioContext) {
    return Promise.resolve(null);
  }

  buttonSoundLoadPromise = fetch("/assets/sounds/button_confirm.ogg")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load button sound: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((audioData) => audioContext.decodeAudioData(audioData))
    .then((buffer) => {
      sharedButtonSoundBuffer = buffer;
      return buffer;
    })
    .catch((error) => {
      console.warn("Failed to preload button sound:", error);
      buttonSoundLoadPromise = null;
      return null;
    });

  return buttonSoundLoadPromise;
}

function hydrateAudioVolumesOnce(): Promise<unknown> {
  if (!audioVolumeHydrationPromise) {
    audioVolumeHydrationPromise = hydrateRuntimeAudioVolumes().catch(() => {
      audioVolumeHydrationPromise = null;
    });
  }

  return audioVolumeHydrationPromise;
}

async function playButtonSound(): Promise<void> {
  const audioContext = getSharedAudioContext();
  if (!audioContext || !sharedButtonSoundGain) {
    return;
  }

  const resumePromise =
    audioContext.state === "suspended" ? audioContext.resume() : null;
  const buffer = sharedButtonSoundBuffer ?? (await preloadButtonSound());
  if (!buffer || !sharedButtonSoundGain) {
    return;
  }

  await resumePromise?.catch(() => {});

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(sharedButtonSoundGain);
  source.addEventListener(
    "ended",
    () => {
      source.disconnect();
    },
    { once: true },
  );
  source.start();
}

export function useButtonClickSound() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    void hydrateAudioVolumesOnce();
    void preloadButtonSound();
  }, []);

  return () => void playButtonSound();
}
