import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { invoke } from "@tauri-apps/api/core"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function saveUserName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("Name cannot be empty")
  }
  return invoke<string>("set_user_name", { name: trimmed })
}
