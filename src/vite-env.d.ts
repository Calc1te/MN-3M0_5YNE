/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BARTENDER_LLM_API: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}