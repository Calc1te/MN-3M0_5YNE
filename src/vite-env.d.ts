/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BARTENDER_LLM_API_KEY?: string;
    readonly VITE_BARTENDER_URL?: string;
    readonly VITE_BARTENDER_MODEL?: string;
    readonly VITE_EMBD_URL?: string;
    readonly VITE_EMBD_MODEL?: string;
    readonly VITE_FRIEND_MODE?: string;
    readonly VITE_SIMULATE_FIRST_INSTALL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
