import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Square, Volume2, VolumeX, RotateCcw, BookmarkPlus } from 'lucide-react';
import type {
  AppConfigState,
  ChatMessage,
  EmotionTag,
  MemoryItem,
  PersonaProfile,
} from '../types.ts';
import {
  isBrowserSttSupported,
  speakWithBrowserTts,
  startBrowserStt,
  stopAllAudio,
  type SttSession,
} from '../lib/voiceUtils.ts';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  persona: PersonaProfile;
  memories: MemoryItem[];
  config: AppConfigState;
  isSending: boolean;
  streamingText: string;
  streamingEmotion: EmotionTag;
  errorBanner: string | null;
  onDismissError: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onCancelStream: () => void;
  onClearHistory: () => Promise<void>;
  onExtractMemories: () => Promise<void>;
  isExtracting: boolean;
  extractNotice: string | null;
  onToggleAutoSpeak: () => Promise<void>;
}

const EMOTION_LABEL: Record<EmotionTag, string> = {
  tenang: 'Tenang',
  hangat: 'Hangat',
  fokus: 'Fokus',
  penasaran: 'Penasaran',
  antusias: 'Antusias',
};

const QUICK_STARTERS = [
  'Bantu aku memilih model Ollama paling ringan untuk RAM 16GB dan VRAM 4GB.',
  'Ingat bahwa aku lebih suka penjelasan teknis yang singkat dan terstruktur.',
  'Buatkan rutinitas belajar 45 menit malam ini tanpa distraksi.',
];

export function ChatWorkspace({
  messages,
  persona,
  memories,
  config,
  isSending,
  streamingText,
  streamingEmotion,
  errorBanner,
  onDismissError,
  onSendMessage,
  onCancelStream,
  onClearHistory,
  onExtractMemories,
  isExtracting,
  extractNotice,
  onToggleAutoSpeak,
}: ChatWorkspaceProps) {
  const [draft, setDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isRecordingCloudStt, setIsRecordingCloudStt] = useState(false);

  const sttSessionRef = useRef<SttSession | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const browserSttAvailable = isBrowserSttSupported();
  const pinnedMemories = memories.filter((m) => m.pinned);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  useEffect(() => {
    return () => {
      sttSessionRef.current?.stop();
      stopAllAudio();
      audioRef.current?.pause();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    setVoiceError(null);
    await onSendMessage(text);
  }

  async function handleSpeakMessage(msgId: string, text: string) {
    setVoiceError(null);
    if (speakingMessageId === msgId) {
      stopAllAudio();
      audioRef.current?.pause();
      setSpeakingMessageId(null);
      return;
    }

    stopAllAudio();
    audioRef.current?.pause();

    if (persona.voiceEngine === 'gemini') {
      try {
        setSpeakingMessageId(msgId);
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: persona.geminiVoiceName }),
        });
        const data = (await res.json()) as { audioBase64?: string; error?: string };
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Gagal memuat suara Gemini TTS.');
        }
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeakingMessageId(null);
        audio.onerror = () => setSpeakingMessageId(null);
        await audio.play();
        return;
      } catch (err) {
        setSpeakingMessageId(null);
        setVoiceError(err instanceof Error ? err.message : 'Gagal memutar TTS cloud.');
        return;
      }
    }

    const ok = speakWithBrowserTts(
      text,
      persona.language,
      persona.speechRate,
      () => setSpeakingMessageId(msgId),
      () => setSpeakingMessageId(null)
    );
    if (!ok) {
      setVoiceError('Browser ini tidak mendukung sintesis suara lokal.');
    }
  }

  function handleToggleMic() {
    setVoiceError(null);

    if (isListening) {
      sttSessionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (isRecordingCloudStt) {
      mediaRecorderRef.current?.stop();
      setIsRecordingCloudStt(false);
      return;
    }

    if (browserSttAvailable) {
      const session = startBrowserStt({
        lang: persona.language,
        onTranscript: (text, isFinal) => {
          setDraft(text);
          if (isFinal) {
            setIsListening(false);
          }
        },
        onError: (msg) => {
          setVoiceError(msg);
          setIsListening(false);
        },
        onEnd: () => setIsListening(false),
      });
      if (session) {
        sttSessionRef.current = session;
        setIsListening(true);
        return;
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Perangkat atau browser tidak mendukung input mikrofon.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const result = String(reader.result ?? '');
            const base64 = result.split(',')[1];
            if (!base64) return;
            try {
              const res = await fetch('/api/voice/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm' }),
              });
              const data = (await res.json()) as { text?: string; error?: string };
              if (!res.ok) throw new Error(data.error || 'Gagal mentranskripsi suara.');
              if (data.text) setDraft((prev) => (prev ? `${prev} ${data.text}` : data.text!));
            } catch (err) {
              setVoiceError(err instanceof Error ? err.message : 'Gagal mentranskripsi audio.');
            }
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecordingCloudStt(true);
      })
      .catch(() => {
        setVoiceError('Izin mikrofon ditolak atau tidak tersedia.');
      });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[#232B36] bg-gradient-to-r from-[#0D1015] to-[#0E1726]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#94A3B8]">
          <span className="font-medium text-[#F1F5F9]">{persona.name}</span>
          <span aria-hidden="true">/</span>
          <span className="font-mono-tabular">
            Memori aktif: {memories.length} ({pinnedMemories.length} tersemat)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              persona.autoSpeak
                ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] border-[#38BDF8]'
                : 'bg-[#11151C] text-[#F1F5F9] border-[#232B36] hover:bg-[#181E27]'
            }`}
            aria-pressed={persona.autoSpeak}
          >
            {persona.autoSpeak ? (
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{persona.autoSpeak ? 'Suara Otomatis: Aktif' : 'Suara Otomatis: Mati'}</span>
          </button>

          <button
            type="button"
            onClick={onExtractMemories}
            disabled={isExtracting || messages.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#232B36] bg-[#11151C] text-[#F1F5F9] hover:bg-[#181E27] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
            <span>{isExtracting ? 'Mengekstrak...' : 'Simpan Intisari Memori'}</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              disabled={isSending}
              aria-label="Bersihkan riwayat percakapan"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#232B36] bg-[#11151C] text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#181E27] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Bersihkan</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {(errorBanner || voiceError || extractNotice) && (
        <div className="px-4 sm:px-6 pt-3 space-y-2">
          {errorBanner && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm bg-[#450A0A]/70 border border-[#991B1B] text-[#FCA5A5] rounded-lg"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="text-xs font-medium underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}
          {voiceError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-4 py-2 text-xs bg-[#451A03]/60 border border-[#92400E] text-[#FCD34D] rounded-lg"
            >
              <span>{voiceError}</span>
              <button type="button" onClick={() => setVoiceError(null)} className="underline shrink-0">
                Tutup
              </button>
            </div>
          )}
          {extractNotice && (
            <div className="px-4 py-2 text-xs bg-[#082F49] border border-[#0284C7] text-[#BAE6FD] rounded-lg">
              {extractNotice}
            </div>
          )}
        </div>
      )}

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
        {messages.length === 0 && !streamingText ? (
          <div className="max-w-2xl mx-auto py-8 sm:py-12">
            <h2 className="text-xl font-semibold text-[#F1F5F9] text-balance">
              Mulai percakapan bersama {persona.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
              Fokus pada percakapan teks, memori jangka panjang yang ringkas, dan interaksi suara
              ringan tanpa membebani GPU.
            </p>

            <div className="mt-6 space-y-2">
              <p className="text-xs font-medium text-[#94A3B8]">Contoh prompt cepat</p>
              <div className="grid gap-2">
                {QUICK_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => onSendMessage(starter)}
                    className="text-left px-4 py-3 text-sm text-[#F1F5F9] bg-[#11151C] border border-[#232B36] rounded-lg hover:border-[#38BDF8] hover:bg-[#181E27] transition-colors"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <article
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1 text-xs text-[#94A3B8]">
                    <span className="font-medium text-[#F1F5F9]">
                      {isUser ? 'Anda' : persona.name}
                    </span>
                    {!isUser && msg.emotion && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#38BDF8]">Nada: {EMOTION_LABEL[msg.emotion]}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {msg.engine === 'gemini' ? 'Gemini' : 'Ollama'} ({msg.modelName})
                    </span>
                    {msg.latencyMs ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{(msg.latencyMs / 1000).toFixed(1)}s</span>
                      </>
                    ) : null}
                  </div>

                  <div
                    className={`max-w-[90%] sm:max-w-[82%] px-4 py-3 rounded-xl text-[15px] leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-gradient-to-br from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] font-medium'
                        : 'bg-gradient-to-b from-[#131922] to-[#0F131A] text-[#F1F5F9] border border-[#232B36]'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {!isUser && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSpeakMessage(msg.id, msg.content)}
                        className="inline-flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#38BDF8] transition-colors"
                      >
                        {speakingMessageId === msg.id ? (
                          <>
                            <Square className="w-3 h-3" aria-hidden="true" />
                            <span>Hentikan suara</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Bacakan</span>
                          </>
                        )}
                      </button>
                      <span className="text-xs text-[#94A3B8] font-mono-tabular">
                        ~{msg.tokenEstimate} token
                      </span>
                    </div>
                  )}
                </article>
              );
            })}

            {isSending && (
              <article className="flex flex-col items-start">
                <div className="flex items-center gap-2 mb-1 text-xs text-[#94A3B8]">
                  <span className="font-medium text-[#F1F5F9]">{persona.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#38BDF8]">Nada: {EMOTION_LABEL[streamingEmotion]}</span>
                  <span aria-hidden="true">·</span>
                  <span>Menulis...</span>
                </div>
                <div className="max-w-[90%] sm:max-w-[82%] px-4 py-3 rounded-xl text-[15px] leading-relaxed bg-[#11151C] text-[#F1F5F9] border border-[#232B36] whitespace-pre-wrap">
                  {streamingText || 'Memproses konteks dan memori relevan...'}
                </div>
              </article>
            )}

            <div ref={listEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[#232B36] bg-[#0D1015] px-4 sm:px-6 py-3.5">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <label htmlFor="chat-composer" className="sr-only">
            Tulis pesan untuk {persona.name}
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleToggleMic}
              aria-label={
                isListening || isRecordingCloudStt
                  ? 'Hentikan rekaman mikrofon'
                  : 'Rekam suara ke teks'
              }
              className={`h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-lg border transition-colors ${
                isListening || isRecordingCloudStt
                  ? 'bg-[#EF4444] text-white border-[#EF4444]'
                  : 'bg-[#181E27] text-[#F1F5F9] border-[#232B36] hover:border-[#38BDF8]'
              }`}
            >
              {isListening || isRecordingCloudStt ? (
                <MicOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Mic className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <textarea
              id="chat-composer"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e);
                }
              }}
              placeholder={
                config.engine === 'ollama'
                  ? `Tulis pesan untuk ${persona.name} via ${config.ollamaModel}...`
                  : `Tulis pesan untuk ${persona.name} via ${config.geminiModel}...`
              }
              className="flex-1 min-h-[44px] max-h-36 resize-y px-3.5 py-2.5 text-sm bg-[#11151C] text-[#F1F5F9] placeholder:text-[#94A3B8] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />

            {isSending ? (
              <button
                type="button"
                onClick={onCancelStream}
                className="h-11 px-4 inline-flex items-center gap-1.5 text-sm font-medium bg-[#181E27] text-[#F1F5F9] border border-[#232B36] rounded-lg hover:border-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hentikan</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="h-11 px-4 inline-flex items-center gap-1.5 text-sm font-medium bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] rounded-lg hover:from-[#7DD3FC] hover:to-[#38BDF8] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>Kirim</span>
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8]">
            <span>
              Mode aktif: {config.engine === 'gemini' ? 'Gemini Hybrid' : 'Ollama Lokal'} · Anggaran memori:{' '}
              <span className="font-mono-tabular text-[#F1F5F9]">{config.memoryTokenBudget}</span> token
            </span>
            <span>Enter untuk kirim, Shift+Enter untuk baris baru</span>
          </div>
        </form>
      </div>
    </div>
  );
}
