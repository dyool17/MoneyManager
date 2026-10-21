import { invoke } from '@tauri-apps/api/core'

export type AiProvider = 'claude-cli' | 'codex-cli' | 'openai-compatible'
export interface AiMessage { role: 'user' | 'assistant'; content: string }
export interface AiStatus { claude: string | null; codex: string | null; hasKey: boolean }
export interface AiRequest { provider: AiProvider; system: string; messages: AiMessage[]; model?: string; baseUrl?: string }

/** The desktop shell runs every AI call; the browser preview cannot. */
export const aiAvailable = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const aiStatus = () => invoke<AiStatus>('ai_status')
export const aiSetKey = (key: string | null) => invoke<void>('ai_set_key', { key })
export const aiChat = (request: AiRequest) => invoke<string>('ai_chat', { request })
