import { invoke } from '@tauri-apps/api/core'

export type AiProvider = 'claude-cli' | 'codex-cli' | 'openai-compatible'
export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiStatus { claude: string | null; codex: string | null; hasKey: boolean }
export interface AiRequest { provider: AiProvider; system: string; messages: AiMessage[]; model?: string; baseUrl?: string; effort?: string }

/** The desktop shell runs every AI call; the browser preview cannot. */
export const aiAvailable = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Mirrors `efforts` in ai.rs; empty means the provider default. */
export const EFFORTS: Record<AiProvider, string[]> = {
  'claude-cli': ['low', 'medium', 'high', 'xhigh', 'max'],
  'codex-cli': ['minimal', 'low', 'medium', 'high', 'xhigh'],
  'openai-compatible': ['low', 'medium', 'high'],
}

export const aiStatus = () => invoke<AiStatus>('ai_status')
export const aiSetKey = (key: string | null) => invoke<void>('ai_set_key', { key })
export const aiChat = (request: AiRequest) => invoke<string>('ai_chat', { request })
