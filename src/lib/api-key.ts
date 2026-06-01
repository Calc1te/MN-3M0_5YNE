import { invoke } from "@tauri-apps/api/core";
import { getRuntimeLlmConfig, isFriendMode } from "@/lib/app-config";

export async function getStoredApiKey(): Promise<string> {
  return invoke<string>("get_api_key");
}

export async function saveStoredApiKey(apiKey: string): Promise<string> {
  return invoke<string>("set_api_key", { apiKey });
}

export async function getRuntimeApiKey(): Promise<string> {
  if (isFriendMode) {
    return import.meta.env.VITE_BARTENDER_LLM_API_KEY || "";
  }

  const config = await getRuntimeLlmConfig();
  return config.apiKey;
}
