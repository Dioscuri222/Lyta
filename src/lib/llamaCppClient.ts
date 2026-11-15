import type { ChatMessage, MemoryItem, PersonaProfile } from '../types.ts';
import { buildLytaSystemPrompt } from './lytaContract.ts';
import { estimateTokens } from './vramCalculator.ts';

export interface LlamaCppHealthResult {
  reachable: boolean;
  status?: string;
  models: string[];
  error?: string;
}

export function normalizeLlamaCppUrl(url: string): string {
  return url.trim().replace(/\/+$/, '') || 'http://localhost:8080';
}

export function buildLlamaServerCli(opts: {
  modelPath: string;
  ctxSize: number;
  gpuLayers: number;
  quantKv: boolean;
  port?: number;
}): string {
  const parts = [
    'llama-server',
    `-m "${opts.modelPath}"`,
    `-c ${opts.ctxSize}`,
    `-ngl ${opts.gpuLayers}`,
  ];
  if (opts.quantKv) {
    parts.push('-fa on', '-ctk q8_0', '-ctv q8_0');
  }
  parts.push('--host 127.0.0.1', `--port ${opts.port ?? 8080}`);
  return parts.join(' ');
}

export async function checkLlamaCppHealth(baseUrl: string): Promise<LlamaCppHealthResult> {
  const cleanUrl = normalizeLlamaCppUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const healthRes = await fetch(`${cleanUrl}/health`, { signal: controller.signal });
    if (healthRes.status === 503) {
      return {
        reachable: false,
        status: 'loading',
        models: [],
        error: 'llama-server sedang memuat model ke VRAM/RAM. Tunggu beberapa detik lalu coba lagi.',
      };
    }
    if (!healthRes.ok) {
      return { reachable: false, models: [], error: `HTTP ${healthRes.status}` };
    }
    const healthData = (await healthRes.json().catch(() => ({}))) as { status?: string };

    let models: string[] = [];
    try {
      const modelsRes = await fetch(`${cleanUrl}/v1/models`, { signal: controller.signal });
      if (modelsRes.ok) {
        const modelsData = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
        models = (modelsData.data ?? []).map((m) => m.id || '').filter(Boolean);
      }
    } catch {
      // Optional /v1/models metadata
    }

    return {
      reachable: true,
      status: healthData.status ?? 'ok',
      models,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Timeout menghubungi llama-server lokal.'
        : 'llama-server tidak terjangkau (pastikan start.bat atau llama-server --port 8080 sudah berjalan).';
    return { reachable: false, models: [], error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function extractOpenAiSseDelta(rawLine: string): { done: boolean; delta: string } {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith('data:')) {
    return { done: false, delta: '' };
  }
  const payload = trimmed.slice(5).trim();
  if (!payload) return { done: false, delta: '' };
  if (payload === '[DONE]') {
    return { done: true, delta: '' };
  }
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; text?: string }>;
    };
    const piece = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? '';
    return { done: false, delta: piece };
  } catch {
    return { done: false, delta: '' };
  }
}

export function fitHistoryToContextBudget(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  numCtx: number,
  replyReserve = 420
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const maxPromptTokens = Math.max(512, numCtx - replyReserve);
  let usedTokens = estimateTokens(systemPrompt) + estimateTokens(userMessage) + 24;
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let i = history.length - 1; i >= 0 && kept.length < 10; i--) {
    const m = history[i];
    const cost = estimateTokens(m.content) + 8;
    if (usedTokens + cost > maxPromptTokens) break;
    kept.unshift({ role: m.role, content: m.content });
    usedTokens += cost;
  }

  return [
    { role: 'system', content: systemPrompt },
    ...kept,
    { role: 'user', content: userMessage },
  ];
}

export async function streamLlamaCppChat(params: {
  baseUrl: string;
  model: string;
  persona: PersonaProfile;
  memories: MemoryItem[];
  history: ChatMessage[];
  userMessage: string;
  numCtx: number;
  recentThoughts?: string[];
  signal?: AbortSignal;
  onUpdate: (rawAccumulated: string) => void;
}): Promise<string> {
  const cleanUrl = normalizeLlamaCppUrl(params.baseUrl);
  const systemPrompt = buildLytaSystemPrompt({
    persona: params.persona,
    memories: params.memories,
    userText: params.userMessage,
    density: 'compact',
    recentThoughts: params.recentThoughts,
  });

  const messages = fitHistoryToContextBudget(
    systemPrompt,
    params.history,
    params.userMessage,
    params.numCtx
  );

  const response = await fetch(`${cleanUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model || 'local-model',
      stream: true,
      messages,
      temperature: 0.7,
      max_tokens: Math.min(512, Math.max(192, Math.floor(params.numCtx / 6))),
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `llama-server mengembalikan status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const parsed = extractOpenAiSseDelta(line);
      if (parsed.delta) {
        fullText += parsed.delta;
        params.onUpdate(fullText);
      }
      if (parsed.done) {
        return fullText;
      }
    }
  }

  return fullText;
}

export function runLlamaCppSelfChecks(): { passed: boolean; details: string[] } {
  const details: string[] = [];

  const cli = buildLlamaServerCli({
    modelPath: 'models\\qwen2.5-3b-instruct-q4_k_m.gguf',
    ctxSize: 4096,
    gpuLayers: 36,
    quantKv: true,
    port: 8080,
  });
  if (!cli.includes('-c 4096') || !cli.includes('-ngl 36') || !cli.includes('-fa on -ctk q8_0 -ctv q8_0')) {
    throw new Error(`Invalid llama-server CLI generated: ${cli}`);
  }
  details.push('llama-server CLI flag generation verified');

  const sseChunk = extractOpenAiSseDelta('data: {"choices":[{"delta":{"content":"Halo "}}]}');
  const sseDone = extractOpenAiSseDelta('data: [DONE]');
  if (sseChunk.delta !== 'Halo ' || !sseDone.done) {
    throw new Error('SSE delta parser failed');
  }
  details.push('OpenAI-compatible SSE chunk & [DONE] parsing verified');

  const longHistory: ChatMessage[] = Array.from({ length: 12 }, (_, idx) => ({
    id: String(idx),
    role: idx % 2 === 0 ? 'user' : 'assistant',
    content: 'Pesan panjang '.repeat(40),
    engine: 'llamacpp',
    modelName: 'test.gguf',
    tokenEstimate: 150,
    createdAt: '2026-11-15T00:00:00Z',
  }));
  const fitted = fitHistoryToContextBudget('System prompt pendek', longHistory, 'Halo', 2048);
  const totalEst = fitted.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  if (totalEst > 2048) {
    throw new Error(`Context budget exceeded: ${totalEst}`);
  }
  details.push(`History budget fitter kept ${fitted.length - 2} turns within 2048 ctx`);

  return { passed: true, details };
}
