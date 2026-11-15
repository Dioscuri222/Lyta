import type { ChatMessage, EmotionTag, MemoryItem, PersonaProfile } from '../types.ts';
import {
  buildLytaSystemPrompt,
  extractDeepReply,
  extractStreamingPreview,
} from './lytaContract.ts';

export interface OllamaHealthResult {
  reachable: boolean;
  models: string[];
  error?: string;
}

export function normalizeOllamaUrl(url: string): string {
  return url.trim().replace(/\/+$/, '') || 'http://localhost:11434';
}

export async function checkOllamaHealth(baseUrl: string): Promise<OllamaHealthResult> {
  const cleanUrl = normalizeOllamaUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${cleanUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return { reachable: false, models: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models = (data.models ?? []).map((m) => m.name);
    return { reachable: true, models };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Timeout menghubungi Ollama lokal.'
        : 'Ollama lokal tidak terjangkau (pastikan Ollama berjalan dengan OLLAMA_ORIGINS="*").';
    return { reachable: false, models: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function buildLocalSystemPrompt(
  persona: PersonaProfile,
  memories: MemoryItem[],
  userText = '',
  recentThoughts: string[] = []
): string {
  return buildLytaSystemPrompt({
    persona,
    memories,
    userText,
    density: 'compact',
    recentThoughts,
  });
}

export function parseEmotionTag(rawText: string): {
  emotion: EmotionTag;
  content: string;
  thought?: string;
} {
  const extracted = extractDeepReply(rawText);
  return {
    emotion: extracted.tone,
    content: extracted.speech,
    thought: extracted.thought || undefined,
  };
}

export function parseStreamingPreview(rawText: string): {
  emotion: EmotionTag;
  content: string;
} {
  return extractStreamingPreview(rawText);
}

export async function streamOllamaChat(params: {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  numCtx: number;
  signal?: AbortSignal;
  onUpdate: (rawAccumulated: string) => void;
}): Promise<string> {
  const cleanUrl = normalizeOllamaUrl(params.baseUrl);
  const messages = [
    { role: 'system', content: params.systemPrompt },
    ...params.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: params.userMessage },
  ];

  const response = await fetch(`${cleanUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      stream: true,
      messages,
      options: {
        num_ctx: params.numCtx,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Ollama mengembalikan status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { message?: { content?: string } };
        if (parsed.message?.content) {
          fullText += parsed.message.content;
          params.onUpdate(fullText);
        }
      } catch {
        // Ignore partial NDJSON frame
      }
    }
  }

  return fullText;
}
