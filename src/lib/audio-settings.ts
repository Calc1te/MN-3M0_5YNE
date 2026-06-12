import { getAppConfig } from "@/lib/app-config";

export type AudioTag = "BGM" | "SE";

export interface AudioVolumes {
  BGM: number;
  SE: number;
}

const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
  BGM: 0.5,
  SE: 0.3,
};

const AUDIO_VOLUME_EVENT = "audio-volume-change";

let runtimeAudioVolumes: AudioVolumes = { ...DEFAULT_AUDIO_VOLUMES };

function clampVolume(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function getDefaultAudioVolumes(): AudioVolumes {
  return { ...DEFAULT_AUDIO_VOLUMES };
}

export function normalizeAudioVolumes(
  partial?: Partial<AudioVolumes>,
): AudioVolumes {
  return {
    BGM: clampVolume(partial?.BGM ?? DEFAULT_AUDIO_VOLUMES.BGM),
    SE: clampVolume(partial?.SE ?? DEFAULT_AUDIO_VOLUMES.SE),
  };
}

export function readAudioVolumesFromConfig(config: {
  Audio_Volume_BGM?: number;
  Audio_Volume_SE?: number;
}): AudioVolumes {
  return normalizeAudioVolumes({
    BGM: config.Audio_Volume_BGM,
    SE: config.Audio_Volume_SE,
  });
}

export function getRuntimeAudioVolumes(): AudioVolumes {
  return { ...runtimeAudioVolumes };
}

export function setRuntimeAudioVolumes(partial: Partial<AudioVolumes>): AudioVolumes {
  runtimeAudioVolumes = normalizeAudioVolumes({
    ...runtimeAudioVolumes,
    ...partial,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<AudioVolumes>(AUDIO_VOLUME_EVENT, {
        detail: runtimeAudioVolumes,
      }),
    );
  }

  return runtimeAudioVolumes;
}

export function subscribeAudioVolumes(
  listener: (volumes: AudioVolumes) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AudioVolumes>).detail;
    listener(normalizeAudioVolumes(detail));
  };

  window.addEventListener(AUDIO_VOLUME_EVENT, handler);
  return () => {
    window.removeEventListener(AUDIO_VOLUME_EVENT, handler);
  };
}

export async function hydrateRuntimeAudioVolumes(): Promise<AudioVolumes> {
  try {
    const config = await getAppConfig();
    return setRuntimeAudioVolumes(readAudioVolumesFromConfig(config));
  } catch (error) {
    console.error("Failed to load audio volumes:", error);
    return getRuntimeAudioVolumes();
  }
}

export function createTaggedAudio(tag: AudioTag, src: string): HTMLAudioElement {
  const audio = new Audio(src);
  audio.dataset.audioTag = tag;
  audio.volume = getRuntimeAudioVolumes()[tag];
  return audio;
}

export function applyTaggedAudioVolume(
  audio: HTMLAudioElement,
  tag: AudioTag,
  volumes = getRuntimeAudioVolumes(),
): void {
  audio.dataset.audioTag = tag;
  audio.volume = volumes[tag];
}
