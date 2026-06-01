import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
  Name: string;
  Last_Activated: number;
  Base_Dir: string;
  Bar_Root_Parent: string;
  API_Key: string;
  Chat_Base_URL: string;
  Chat_Model: string;
  Embedding_Base_URL: string;
  Embedding_Model: string;
  Setup_Completed: boolean;
  Remember_On_Exit: boolean;
}

export interface InitialSetupStatus {
  completed: boolean;
  config: AppConfig;
}

export interface RuntimeLlmConfig {
  apiKey: string;
  chatBaseUrl: string;
  chatModel: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
}

export const isFriendMode = import.meta.env.VITE_FRIEND_MODE === "true";
export const simulateFirstInstall =
  import.meta.env.VITE_SIMULATE_FIRST_INSTALL === "true";

export function buildDefaultAppConfig(): AppConfig {
  return {
    Name: "User",
    Last_Activated: 0,
    Base_Dir: "",
    Bar_Root_Parent: "",
    API_Key: "",
    Chat_Base_URL: "",
    Chat_Model: "",
    Embedding_Base_URL: "",
    Embedding_Model: "",
    Setup_Completed: false,
    Remember_On_Exit: false,
  };
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<AppConfig> {
  return invoke<AppConfig>("save_app_config", { config });
}

export async function completeInitialSetup(
  config: AppConfig,
): Promise<AppConfig> {
  return invoke<AppConfig>("complete_initial_setup", { config });
}

export async function getInitialSetupStatus(): Promise<InitialSetupStatus> {
  return invoke<InitialSetupStatus>("get_initial_setup_status");
}

export async function getRuntimeLlmConfig(): Promise<RuntimeLlmConfig> {
  if (isFriendMode) {
    return getEnvLlmConfig();
  }

  const config = await getAppConfig();
  const env = getEnvLlmConfig();
  return {
    apiKey: config.API_Key.trim() || env.apiKey,
    chatBaseUrl: config.Chat_Base_URL.trim() || env.chatBaseUrl,
    chatModel: config.Chat_Model.trim() || env.chatModel,
    embeddingBaseUrl:
      config.Embedding_Base_URL.trim() || env.embeddingBaseUrl,
    embeddingModel: config.Embedding_Model.trim() || env.embeddingModel,
  };
}

function getEnvLlmConfig(): RuntimeLlmConfig {
  return {
    apiKey: import.meta.env.VITE_BARTENDER_LLM_API_KEY || "",
    chatBaseUrl: import.meta.env.VITE_BARTENDER_URL || "",
    chatModel: import.meta.env.VITE_BARTENDER_MODEL || "",
    embeddingBaseUrl: import.meta.env.VITE_EMBD_URL || "",
    embeddingModel: import.meta.env.VITE_EMBD_MODEL || "",
  };
}
