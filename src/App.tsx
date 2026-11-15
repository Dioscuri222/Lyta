import { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Database,
  Menu,
  MessageSquare,
  Sliders,
  X,
} from 'lucide-react';
import type {
  AppConfigState,
  ChatMessage,
  EmotionTag,
  MemoryCategory,
  MemoryItem,
  PersonaProfile,
} from './types.ts';
import { ChatWorkspace } from './components/ChatWorkspace.tsx';
import { MemoryVault } from './components/MemoryVault.tsx';
import { VramProfiler } from './components/VramProfiler.tsx';
import { PersonaSettings } from './components/PersonaSettings.tsx';
import {
  checkOllamaHealth,
  buildLocalSystemPrompt,
  parseEmotionTag,
  parseStreamingPreview,
  streamOllamaChat,
  type OllamaHealthResult,
} from './lib/ollamaClient.ts';
import {
  checkLlamaCppHealth,
  streamLlamaCppChat,
  type LlamaCppHealthResult,
} from './lib/llamaCppClient.ts';
import {
  AUTHENTIC_LYTA_ROLE_DESCRIPTION,
  AUTHENTIC_LYTA_TONE_GUIDELINES,
  DEFAULT_EMOTION,
} from './lib/lytaContract.ts';
import {
  estimateTokens,
  selectRelevantMemories,
} from './lib/vramCalculator.ts';
import { speakWithBrowserTts } from './lib/voiceUtils.ts';

type WorkspaceTab = 'chat' | 'memory' | 'profiler' | 'settings';

const DEFAULT_PERSONA: PersonaProfile = {
  name: 'Lyta',
  userName: 'Roommate',
  city: 'Jakarta',
  relationshipStage: 'close',
  roleDescription: AUTHENTIC_LYTA_ROLE_DESCRIPTION,
  toneGuidelines: AUTHENTIC_LYTA_TONE_GUIDELINES,
  language: 'id',
  autoSpeak: false,
  voiceEngine: 'browser',
  speechRate: 1.0,
  geminiVoiceName: 'Kore',
};

const DEFAULT_CONFIG: AppConfigState = {
  engine: 'gemini',
  geminiModel: 'gemini-4-hydrogen',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:3b-instruct-q4_K_M',
  llamaCppBaseUrl: 'http://localhost:8080',
  llamaCppModel: 'qwen2.5-3b-instruct-q4_k_m.gguf',
  numCtx: 4096,
  memoryTokenBudget: 350,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [persona, setPersona] = useState<PersonaProfile>(DEFAULT_PERSONA);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [config, setConfig] = useState<AppConfigState>(() => {
    try {
      const saved = localStorage.getItem('lyta_config') ?? localStorage.getItem('amika_lite_config');
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingEmotion, setStreamingEmotion] = useState<EmotionTag>(DEFAULT_EMOTION);
  const [chatError, setChatError] = useState<string | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractNotice, setExtractNotice] = useState<string | null>(null);

  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealthResult | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);

  const [llamaCppHealth, setLlamaCppHealth] = useState<LlamaCppHealthResult | null>(null);
  const [checkingLlamaCpp, setCheckingLlamaCpp] = useState(false);

  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem('lyta_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    void loadInitialState();
  }, []);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  async function loadInitialState() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Gagal memuat data ruang kerja dari server.');
      const data = (await res.json()) as {
        persona: PersonaProfile;
        memories: MemoryItem[];
        messages: ChatMessage[];
      };
      setPersona(data.persona);
      setMemories(data.memories);
      setMessages(data.messages);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckOllama() {
    setCheckingOllama(true);
    try {
      const result = await checkOllamaHealth(config.ollamaBaseUrl);
      setOllamaHealth(result);
    } finally {
      setCheckingOllama(false);
    }
  }

  async function handleCheckLlamaCpp() {
    setCheckingLlamaCpp(true);
    try {
      const result = await checkLlamaCppHealth(config.llamaCppBaseUrl);
      setLlamaCppHealth(result);
    } finally {
      setCheckingLlamaCpp(false);
    }
  }

  async function handleSavePersona(next: PersonaProfile) {
    const res = await fetch('/api/persona', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error('Gagal menyimpan pengaturan persona.');
    const updated = (await res.json()) as PersonaProfile;
    setPersona(updated);
  }

  async function handleToggleAutoSpeak() {
    await handleSavePersona({ ...persona, autoSpeak: !persona.autoSpeak });
  }

  async function handleAddMemory(content: string, category: MemoryCategory, pinned: boolean) {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category, pinned }),
    });
    const data = (await res.json()) as MemoryItem & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Gagal menambah memori.');
    setMemories((prev) => [data, ...prev]);
  }

  async function handleUpdateMemory(
    id: string,
    patch: Partial<Pick<MemoryItem, 'content' | 'category' | 'pinned'>>
  ) {
    const res = await fetch(`/api/memories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as MemoryItem & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Gagal memperbarui memori.');
    setMemories((prev) => prev.map((m) => (m.id === id ? data : m)));
  }

  async function handleDeleteMemory(id: string) {
    const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Gagal menghapus memori.');
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function maybeAutoSpeak(text: string) {
    if (!persona.autoSpeak || !text.trim()) return;
    if (persona.voiceEngine === 'gemini') {
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: persona.geminiVoiceName }),
        });
        const data = (await res.json()) as { audioBase64?: string };
        if (res.ok && data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          await audio.play();
          return;
        }
      } catch {
        // Fallback to zero-VRAM browser TTS if cloud TTS is unavailable
      }
    }
    speakWithBrowserTts(text, persona.language, persona.speechRate);
  }

  async function handleSendMessage(userText: string) {
    setChatError(null);
    setExtractNotice(null);
    setIsSending(true);
    setStreamingText('');
    setStreamingEmotion(DEFAULT_EMOTION);

    const controller = new AbortController();
    streamAbortRef.current = controller;

    if (config.engine === 'ollama') {
      const startedAt = Date.now();
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        engine: 'ollama',
        modelName: config.ollamaModel,
        tokenEstimate: estimateTokens(userText),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const relevant = selectRelevantMemories(memories, userText, config.memoryTokenBudget);
        const recentThoughts = messages
          .filter((m) => m.role === 'assistant' && m.thought)
          .slice(-2)
          .map((m) => m.thought as string);
        const systemPrompt = buildLocalSystemPrompt(persona, relevant, userText, recentThoughts);

        const rawReply = await streamOllamaChat({
          baseUrl: config.ollamaBaseUrl,
          model: config.ollamaModel,
          systemPrompt,
          history: messages,
          userMessage: userText,
          numCtx: config.numCtx,
          signal: controller.signal,
          onUpdate: (raw) => {
            const parsed = parseStreamingPreview(raw);
            setStreamingEmotion(parsed.emotion);
            setStreamingText(parsed.content);
          },
        });

        const { emotion, content, thought } = parseEmotionTag(rawReply);
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: content.trim() || 'Tidak ada respons dari model lokal.',
          emotion,
          thought,
          engine: 'ollama',
          modelName: config.ollamaModel,
          tokenEstimate: estimateTokens(content),
          latencyMs: Date.now() - startedAt,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        // Persist unified history to server JSON store
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userMsg),
        });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assistantMsg),
        });
        void maybeAutoSpeak(assistantMsg.content);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setChatError(
            err instanceof Error
              ? `${err.message} Pastikan Ollama berjalan lokal dengan OLLAMA_ORIGINS="*", atau beralih ke Gemini Hybrid.`
              : 'Gagal menghubungi Ollama lokal.'
          );
        }
      } finally {
        setIsSending(false);
        setStreamingText('');
        streamAbortRef.current = null;
      }
      return;
    }

    if (config.engine === 'llamacpp') {
      const startedAt = Date.now();
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        engine: 'llamacpp',
        modelName: config.llamaCppModel,
        tokenEstimate: estimateTokens(userText),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const relevant = selectRelevantMemories(memories, userText, config.memoryTokenBudget);
        const recentThoughts = messages
          .filter((m) => m.role === 'assistant' && m.thought)
          .slice(-2)
          .map((m) => m.thought as string);

        const rawReply = await streamLlamaCppChat({
          baseUrl: config.llamaCppBaseUrl,
          model: config.llamaCppModel,
          persona,
          memories: relevant,
          history: messages,
          userMessage: userText,
          numCtx: config.numCtx,
          recentThoughts,
          signal: controller.signal,
          onUpdate: (raw) => {
            const parsed = parseStreamingPreview(raw);
            setStreamingEmotion(parsed.emotion);
            setStreamingText(parsed.content);
          },
        });

        const { emotion, content, thought } = parseEmotionTag(rawReply);
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: content.trim() || 'Tidak ada respons dari llama-server lokal.',
          emotion,
          thought,
          engine: 'llamacpp',
          modelName: config.llamaCppModel,
          tokenEstimate: estimateTokens(content),
          latencyMs: Date.now() - startedAt,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userMsg),
        });
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assistantMsg),
        });
        void maybeAutoSpeak(assistantMsg.content);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setChatError(
            err instanceof Error
              ? `${err.message} Pastikan llama-server berjalan lewat start.bat, atau beralih ke Ollama / Gemini Hybrid.`
              : 'Gagal menghubungi llama-server lokal.'
          );
        }
      } finally {
        setIsSending(false);
        setStreamingText('');
        streamAbortRef.current = null;
      }
      return;
    }

    // Gemini Hybrid SSE path
    const optimisticUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      engine: 'gemini',
      modelName: config.geminiModel,
      tokenEstimate: estimateTokens(userText),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: userText,
          model: config.geminiModel,
          memoryTokenBudget: config.memoryTokenBudget,
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || 'Gagal menghubungi server Gemini.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim()) as {
            type: 'chunk' | 'done' | 'error';
            raw?: string;
            userMessage?: ChatMessage;
            assistantMessage?: ChatMessage;
            error?: string;
          };

          if (payload.type === 'chunk' && payload.raw) {
            const parsed = parseStreamingPreview(payload.raw);
            setStreamingEmotion(parsed.emotion);
            setStreamingText(parsed.content);
          } else if (payload.type === 'done' && payload.userMessage && payload.assistantMessage) {
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== optimisticUser.id),
              payload.userMessage!,
              payload.assistantMessage!,
            ]);
            void maybeAutoSpeak(payload.assistantMessage.content);
          } else if (payload.type === 'error') {
            throw new Error(payload.error || 'Streaming terhenti.');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setChatError(err instanceof Error ? err.message : 'Gagal mengirim pesan.');
      }
    } finally {
      setIsSending(false);
      setStreamingText('');
      streamAbortRef.current = null;
    }
  }

  function handleCancelStream() {
    streamAbortRef.current?.abort();
    setIsSending(false);
    setStreamingText('');
  }

  async function handleClearHistory() {
    const res = await fetch('/api/messages', { method: 'DELETE' });
    if (res.ok) {
      setMessages([]);
      setExtractNotice(null);
    }
  }

  async function handleExtractMemories() {
    setIsExtracting(true);
    setExtractNotice(null);
    setChatError(null);
    try {
      const res = await fetch('/api/memory/extract', { method: 'POST' });
      const data = (await res.json()) as { added?: MemoryItem[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal mengekstrak memori.');
      const added = data.added ?? [];
      if (added.length > 0) {
        setMemories((prev) => [...added, ...prev]);
        setExtractNotice(`${added.length} fakta baru ditambahkan ke brankas memori.`);
      } else {
        setExtractNotice('Tidak ditemukan fakta jangka panjang baru dari percakapan terakhir.');
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Gagal mengekstrak memori.');
    } finally {
      setIsExtracting(false);
    }
  }

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: typeof MessageSquare }> = [
    { id: 'chat', label: 'Percakapan', icon: MessageSquare },
    { id: 'memory', label: 'Memori', icon: Database },
    { id: 'profiler', label: 'Profiler VRAM 4GB', icon: Cpu },
    { id: 'settings', label: 'Persona & Suara', icon: Sliders },
  ];

  const activeTitle = navItems.find((i) => i.id === activeTab)?.label ?? 'Percakapan';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0E1622] via-[#0B0F16] to-[#080A0D] border-r border-[#232B36] text-[#F1F5F9]">
      <div className="h-14 px-5 flex items-center justify-between border-b border-[#232B36]">
        <span className="font-display text-base font-semibold tracking-tight bg-gradient-to-r from-[#7DD3FC] to-[#0EA5E9] bg-clip-text text-transparent whitespace-nowrap shrink-0">
          Lyta
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Tutup menu navigasi"
          className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#181E27]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Engine Switcher */}
      <div className="p-4 border-b border-[#232B36]">
        <div className="text-xs font-medium text-[#94A3B8] mb-2">Mode Otak AI</div>
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#080A0D] border border-[#232B36] rounded-lg" role="group" aria-label="Pilih mode engine AI">
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, engine: 'gemini' }))}
            aria-pressed={config.engine === 'gemini'}
            className={`py-1.5 px-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              config.engine === 'gemini'
                ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Gemini
          </button>
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, engine: 'ollama' }))}
            aria-pressed={config.engine === 'ollama'}
            className={`py-1.5 px-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              config.engine === 'ollama'
                ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            Ollama
          </button>
          <button
            type="button"
            onClick={() => setConfig((prev) => ({ ...prev, engine: 'llamacpp' }))}
            aria-pressed={config.engine === 'llamacpp'}
            className={`py-1.5 px-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              config.engine === 'llamacpp'
                ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D]'
                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
            }`}
          >
            llama.cpp
          </button>
        </div>
        <div className="mt-2.5 text-xs text-[#94A3B8] font-mono-tabular truncate">
          {config.engine === 'gemini'
            ? config.geminiModel
            : config.engine === 'ollama'
              ? config.ollamaModel
              : config.llamaCppModel}
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Navigasi utama" className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-gradient-to-r from-[#38BDF8]/15 to-[#0EA5E9]/5 text-[#7DD3FC] border border-[#38BDF8]/30'
                  : 'text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#181E27]/60 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#080A0D] bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.10)_0%,_rgba(14,165,233,0.03)_38%,_#080A0D_75%)] text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-[260px] shrink-0 h-full">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="w-[260px] h-full shadow-lg">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Tutup latar belakang menu"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-black/60"
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <header className="h-14 shrink-0 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-[#232B36] bg-[#080A0D]/80">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[#232B36] bg-[#11151C] text-[#F1F5F9]"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <h1 className="font-display text-base font-semibold text-[#F1F5F9] truncate">
              {activeTitle}
            </h1>
          </div>
        </header>

        <main className="flex-1 min-h-0">
          {loading ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="text-sm text-[#94A3B8]">Memuat ruang kerja Lyta...</div>
            </div>
          ) : loadError ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center gap-3">
              <p className="text-sm text-[#FCA5A5]">{loadError}</p>
              <button
                type="button"
                onClick={loadInitialState}
                className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] rounded-lg hover:from-[#7DD3FC] hover:to-[#38BDF8]"
              >
                Muat Ulang
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'chat' && (
                <ChatWorkspace
                  messages={messages}
                  persona={persona}
                  memories={memories}
                  config={config}
                  isSending={isSending}
                  streamingText={streamingText}
                  streamingEmotion={streamingEmotion}
                  errorBanner={chatError}
                  onDismissError={() => setChatError(null)}
                  onSendMessage={handleSendMessage}
                  onCancelStream={handleCancelStream}
                  onClearHistory={handleClearHistory}
                  onExtractMemories={handleExtractMemories}
                  isExtracting={isExtracting}
                  extractNotice={extractNotice}
                  onToggleAutoSpeak={handleToggleAutoSpeak}
                />
              )}
              {activeTab === 'memory' && (
                <MemoryVault
                  memories={memories}
                  memoryTokenBudget={config.memoryTokenBudget}
                  onUpdateBudget={(budget) =>
                    setConfig((prev) => ({ ...prev, memoryTokenBudget: budget }))
                  }
                  onAddMemory={handleAddMemory}
                  onUpdateMemory={handleUpdateMemory}
                  onDeleteMemory={handleDeleteMemory}
                />
              )}
              {activeTab === 'profiler' && (
                <VramProfiler
                  selectedOllamaModel={config.ollamaModel}
                  numCtx={config.numCtx}
                  persona={persona}
                  engine={config.engine}
                  onApplyPreset={(ollamaTag, nextCtx, targetEngine) => {
                    const ggufName = `${ollamaTag.replace(':', '-').toLowerCase()}.gguf`;
                    setConfig((prev) => ({
                      ...prev,
                      engine: targetEngine,
                      ollamaModel: targetEngine === 'ollama' ? ollamaTag : prev.ollamaModel,
                      llamaCppModel: targetEngine === 'llamacpp' ? ggufName : prev.llamaCppModel,
                      numCtx: nextCtx,
                    }));
                    setActiveTab('chat');
                  }}
                />
              )}
              {activeTab === 'settings' && (
                <PersonaSettings
                  persona={persona}
                  config={config}
                  ollamaHealth={ollamaHealth}
                  checkingOllama={checkingOllama}
                  llamaCppHealth={llamaCppHealth}
                  checkingLlamaCpp={checkingLlamaCpp}
                  onSavePersona={handleSavePersona}
                  onChangeConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
                  onCheckOllama={handleCheckOllama}
                  onCheckLlamaCpp={handleCheckLlamaCpp}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
