import { invoke } from "@tauri-apps/api/core";

export async function getStoredApiKey(): Promise<string> {
  return invoke<string>("get_api_key");
}

export async function saveStoredApiKey(apiKey: string): Promise<string> {
  return invoke<string>("set_api_key", { apiKey });
}

export async function getRuntimeApiKey(): Promise<string> {
  const storedApiKey = await getStoredApiKey();
  return storedApiKey.trim() || import.meta.env.VITE_BARTENDER_LLM_API_KEY || "";
}
