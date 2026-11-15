import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { ChatMessage, EmotionTag, MemoryCategory, MemoryItem, PersonaProfile } from './src/types.ts';
import { estimateTokens, selectRelevantMemories } from './src/lib/vramCalculator.ts';

const PORT = 3000;
const LEGACY_STORE_PATH = path.resolve(process.cwd(), 'data', 'amika-store.json');
const STORE_PATH = path.resolve(process.cwd(), 'data', 'lyta-store.json');

interface StoreData {
  persona: PersonaProfile;
  memories: MemoryItem[];
  messages: ChatMessage[];
}

const DEFAULT_STORE: StoreData = {
  persona: {
    name: 'Lyta',
    roleDescription:
      'Pendamping AI personal yang ringan, tenang, dan praktis. Dirancang agar tetap responsif tanpa rendering Live2D.',
    toneGuidelines:
      'Jawab secara jelas, alami, dan ringkas tanpa basa-basi berlebih. Fokus membantu produktivitas, ide, dan obrolan harian.',
    language: 'id',
    autoSpeak: false,
    voiceEngine: 'browser',
    speechRate: 1.0,
    geminiVoiceName: 'Kore',
  },
  memories: [],
  messages: [],
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      persona: { ...DEFAULT_STORE.persona, ...(parsed.persona ?? {}) },
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    try {
      const legacyRaw = await fs.readFile(LEGACY_STORE_PATH, 'utf-8');
      const legacyParsed = JSON.parse(legacyRaw) as Partial<StoreData>;
      const migratedPersona = { ...DEFAULT_STORE.persona, ...(legacyParsed.persona ?? {}) };
      if (migratedPersona.name === 'Amika' || migratedPersona.name === 'Amika Lite') {
        migratedPersona.name = 'Lyta';
      }
      const migrated: StoreData = {
        persona: migratedPersona,
        memories: Array.isArray(legacyParsed.memories) ? legacyParsed.memories : [],
        messages: Array.isArray(legacyParsed.messages) ? legacyParsed.messages : [],
      };
      await writeStore(migrated);
      return migrated;
    } catch {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf-8');
      return structuredClone(DEFAULT_STORE);
    }
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function parseEmotionPrefix(rawText: string): { emotion: EmotionTag; content: string } {
  const match = rawText.match(/^\s*\[EMOTION:(tenang|hangat|fokus|penasaran|antusias)\]\s*/i);
  if (!match) {
    return { emotion: 'tenang', content: rawText.trim() };
  }
  const emotion = match[1].toLowerCase() as EmotionTag;
  return {
    emotion,
    content: rawText.slice(match[0].length).trim(),
  };
}

function buildSystemInstruction(
  persona: PersonaProfile,
  selectedMemories: MemoryItem[]
): string {
  const langLine =
    persona.language === 'id'
      ? 'Gunakan Bahasa Indonesia yang natural kecuali pengguna menulis dalam bahasa lain.'
      : 'Respond in natural English unless the user writes in another language.';

  const memoryLines =
    selectedMemories.length > 0
      ? selectedMemories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
      : '- Belum ada memori tersimpan.';

  return [
    `Nama kamu adalah ${persona.name}.`,
    `Peran: ${persona.roleDescription}`,
    `Gaya bicara: ${persona.toneGuidelines}`,
    langLine,
    'Jangan menulis aksi panggung Live2D seperti *tersenyum lebar* atau kode ekspresi berlebihan.',
    'Awali baris pertama jawabanmu TEPAT dengan salah satu tag berikut lalu spasi: [EMOTION:tenang] | [EMOTION:hangat] | [EMOTION:fokus] | [EMOTION:penasaran] | [EMOTION:antusias].',
    'Memori Jangka Panjang Pengguna (gunakan secara alami hanya jika relevan):',
    memoryLines,
  ].join('\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/state', async (_req, res) => {
    try {
      const store = await readStore();
      res.json(store);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal membaca store.' });
    }
  });

  app.put('/api/persona', async (req, res) => {
    try {
      const store = await readStore();
      store.persona = { ...store.persona, ...req.body };
      await writeStore(store);
      res.json(store.persona);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan persona.' });
    }
  });

  app.post('/api/memories', async (req, res) => {
    try {
      const content = String(req.body?.content ?? '').trim();
      const category = (req.body?.category ?? 'fact') as MemoryCategory;
      const pinned = Boolean(req.body?.pinned);
      if (!content) {
        return res.status(400).json({ error: 'Isi memori tidak boleh kosong.' });
      }
      const store = await readStore();
      const now = new Date().toISOString();
      const item: MemoryItem = {
        id: crypto.randomUUID(),
        content,
        category,
        pinned,
        createdAt: now,
        updatedAt: now,
      };
      store.memories.unshift(item);
      await writeStore(store);
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menambah memori.' });
    }
  });

  app.patch('/api/memories/:id', async (req, res) => {
    try {
      const store = await readStore();
      const target = store.memories.find((m) => m.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'Memori tidak ditemukan.' });
      }
      if (typeof req.body?.content === 'string') {
        const trimmed = req.body.content.trim();
        if (!trimmed) return res.status(400).json({ error: 'Isi memori tidak boleh kosong.' });
        target.content = trimmed;
      }
      if (typeof req.body?.category === 'string') {
        target.category = req.body.category as MemoryCategory;
      }
      if (typeof req.body?.pinned === 'boolean') {
        target.pinned = req.body.pinned;
      }
      target.updatedAt = new Date().toISOString();
      await writeStore(store);
      res.json(target);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui memori.' });
    }
  });

  app.delete('/api/memories/:id', async (req, res) => {
    try {
      const store = await readStore();
      const before = store.memories.length;
      store.memories = store.memories.filter((m) => m.id !== req.params.id);
      if (store.memories.length === before) {
        return res.status(404).json({ error: 'Memori tidak ditemukan.' });
      }
      await writeStore(store);
      res.json({ deleted: req.params.id });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghapus memori.' });
    }
  });

  app.post('/api/messages', async (req, res) => {
    try {
      const msg = req.body as Partial<ChatMessage>;
      if (!msg?.content || !msg?.role) {
        return res.status(400).json({ error: 'Data pesan tidak lengkap.' });
      }
      const store = await readStore();
      const saved: ChatMessage = {
        id: msg.id ?? crypto.randomUUID(),
        role: msg.role,
        content: msg.content,
        emotion: msg.emotion,
        engine: msg.engine ?? 'ollama',
        modelName: msg.modelName ?? 'local',
        tokenEstimate: msg.tokenEstimate ?? estimateTokens(msg.content),
        latencyMs: msg.latencyMs,
        createdAt: msg.createdAt ?? new Date().toISOString(),
      };
      store.messages.push(saved);
      if (store.messages.length > 80) {
        store.messages = store.messages.slice(-80);
      }
      await writeStore(store);
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menyimpan pesan.' });
    }
  });

  app.delete('/api/messages', async (_req, res) => {
    try {
      const store = await readStore();
      store.messages = [];
      await writeStore(store);
      res.json({ cleared: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghapus riwayat.' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY belum dikonfigurasi pada server. Cek Settings > Secrets atau beralih ke mode Ollama Lokal.',
      });
    }

    const userText = String(req.body?.message ?? '').trim();
    const requestedModel =
      req.body?.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
    const memoryTokenBudget = Number(req.body?.memoryTokenBudget ?? 350);

    if (!userText) {
      return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
    }

    const startedAt = Date.now();
    try {
      const store = await readStore();
      const selectedMemories = selectRelevantMemories(store.memories, userText, memoryTokenBudget);
      const systemInstruction = buildSystemInstruction(store.persona, selectedMemories);

      // Keep last 10 turns so context remains compact and fast
      const recentHistory = store.messages.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const config =
        requestedModel === 'gemini-4-hydrogen'
          ? {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            }
          : {
              systemInstruction,
            };

      const stream = await ai.models.generateContentStream({
        model: requestedModel,
        contents: [...recentHistory, { role: 'user', parts: [{ text: userText }] }],
        config,
      });

      let rawFull = '';
      for await (const chunk of stream) {
        const piece = chunk.text ?? '';
        if (piece) {
          rawFull += piece;
          res.write(`data: ${JSON.stringify({ type: 'chunk', raw: rawFull })}\n\n`);
        }
      }

      const { emotion, content } = parseEmotionPrefix(rawFull);
      const latencyMs = Date.now() - startedAt;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        engine: 'gemini',
        modelName: requestedModel,
        tokenEstimate: estimateTokens(userText),
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: content || 'Maaf, tidak ada respons yang dihasilkan.',
        emotion,
        engine: 'gemini',
        modelName: requestedModel,
        tokenEstimate: estimateTokens(content),
        latencyMs,
        createdAt: new Date().toISOString(),
      };

      store.messages.push(userMsg, assistantMsg);
      if (store.messages.length > 80) {
        store.messages = store.messages.slice(-80);
      }
      await writeStore(store);

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          usedMemoryIds: selectedMemories.map((m) => m.id),
        })}\n\n`
      );
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghubungi Gemini API.';
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/memory/extract', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Ekstraksi otomatis membutuhkan GEMINI_API_KEY di server. Anda tetap bisa menambah memori secara manual.',
      });
    }

    try {
      const store = await readStore();
      const recent = store.messages.slice(-6);
      if (recent.length === 0) {
        return res.json({ added: [] });
      }

      const transcript = recent
        .map((m) => `${m.role === 'user' ? 'Pengguna' : store.persona.name}: ${m.content}`)
        .join('\n');

      const existingList = store.memories.map((m) => `- ${m.content}`).join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          'Ekstrak maksimal 3 fakta jangka panjang atau preferensi penting tentang pengguna dari transkrip berikut.',
          'Abaikan sapaan umum atau hal sementara. Jangan ulangi memori yang sudah ada.',
          'Memori yang sudah ada:',
          existingList || '(kosong)',
          'Transkrip:',
          transcript,
        ].join('\n'),
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING, description: 'Kalimat fakta ringkas tentang pengguna.' },
                category: {
                  type: Type.STRING,
                  description: 'Salah satu dari: preference, fact, project, routine',
                },
              },
              required: ['content', 'category'],
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
        content: string;
        category: string;
      }>;

      const validCategories = new Set<MemoryCategory>(['preference', 'fact', 'project', 'routine']);
      const added: MemoryItem[] = [];
      const now = new Date().toISOString();

      for (const entry of parsed.slice(0, 3)) {
        const clean = entry.content?.trim();
        if (!clean) continue;
        const duplicate = store.memories.some(
          (m) => m.content.toLowerCase() === clean.toLowerCase()
        );
        if (duplicate) continue;

        const category = validCategories.has(entry.category as MemoryCategory)
          ? (entry.category as MemoryCategory)
          : 'fact';

        const item: MemoryItem = {
          id: crypto.randomUUID(),
          content: clean,
          category,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        };
        store.memories.unshift(item);
        added.push(item);
      }

      if (added.length > 0) {
        await writeStore(store);
      }

      res.json({ added });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal mengekstrak memori.',
      });
    }
  });

  app.post('/api/voice/tts', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY tidak tersedia untuk TTS cloud. Gunakan TTS Browser (0 MB VRAM).',
      });
    }

    const text = String(req.body?.text ?? '').trim();
    const voiceName = String(req.body?.voiceName ?? 'Kore');
    if (!text) {
      return res.status(400).json({ error: 'Teks TTS kosong.' });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 800) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ error: 'Model TTS tidak mengembalikan audio.' });
      }
      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal membuat audio TTS.' });
    }
  });

  app.post('/api/voice/transcribe', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY tidak tersedia untuk transkripsi cloud.',
      });
    }

    const audioBase64 = String(req.body?.audioBase64 ?? '');
    const mimeType = String(req.body?.mimeType ?? 'audio/webm');
    if (!audioBase64) {
      return res.status(400).json({ error: 'Data audio kosong.' });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: 'Transkripsikan audio ini secara akurat dalam bahasa aslinya tanpa komentar tambahan.' },
          ],
        },
      });
      res.json({ text: (response.text ?? '').trim() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal mentranskripsi audio.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lyta server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
