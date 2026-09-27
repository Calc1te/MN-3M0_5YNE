import { invoke } from "@tauri-apps/api/core";
import {
  changeBartenderState,
  getBartenderState,
  onBartenderStateChange,
} from "@/uiControllers/bartender";

export interface SmokedTempFile {
  file_name: string;
  path: string;
}

let smokedFile: SmokedTempFile | null = null;
let smokingInFlight: Promise<SmokedTempFile> | null = null;
const listeners = new Set<(file: SmokedTempFile | null) => void>();

export function getSmokedTempFile(): SmokedTempFile | null {
  return smokedFile;
}

export function onSmokedTempFileChange(
  listener: (file: SmokedTempFile | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSmokedTempFile(file: SmokedTempFile | null): void {
  smokedFile = file;
  for (const listener of listeners) listener(file);
}

export function showSmokedTempFile(file: SmokedTempFile): void {
  setSmokedTempFile(file);
  changeBartenderState("smoking");
}

export async function performSmoking(): Promise<SmokedTempFile> {
  if (smokingInFlight) return smokingInFlight;
  if (getBartenderState() === "smoking" && smokedFile) return smokedFile;

  smokingInFlight = invoke<SmokedTempFile>("smoke_temp_file")
    .then((file) => {
      showSmokedTempFile(file);
      return file;
    })
    .finally(() => {
      smokingInFlight = null;
    });
  return smokingInFlight;
}

onBartenderStateChange((state) => {
  if (state !== "smoking" && smokedFile) setSmokedTempFile(null);
});
