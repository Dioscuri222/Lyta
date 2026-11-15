import { useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { AppConfigState, PersonaProfile } from '../types.ts';
import type { OllamaHealthResult } from '../lib/ollamaClient.ts';

interface PersonaSettingsProps {
  persona: PersonaProfile;
  config: AppConfigState;
  ollamaHealth: OllamaHealthResult | null;
  checkingOllama: boolean;
  onSavePersona: (next: PersonaProfile) => Promise<void>;
  onChangeConfig: (patch: Partial<AppConfigState>) => void;
  onCheckOllama: () => Promise<void>;
}

export function PersonaSettings({
  persona,
  config,
  ollamaHealth,
  checkingOllama,
  onSavePersona,
  onChangeConfig,
  onCheckOllama,
}: PersonaSettingsProps) {
  const [form, setForm] = useState<PersonaProfile>(persona);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSavePersona(form);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="border-b border-[#E2DDD3] pb-5">
          <h2 className="text-xl font-semibold text-[#1E1D1A]">Persona, Suara & Koneksi Hybrid</h2>
          <p className="mt-1 text-sm text-[#625F57]">
            Atur kepribadian companion, preferensi suara nol-VRAM, serta endpoint Ollama lokal pada
            komputer Anda.
          </p>
        </div>

        {/* Hybrid Engine & Ollama Connection */}
        <section className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#1E1D1A]">Koneksi Backend Hybrid</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gemini-model-select" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                Model Gemini Cloud (Server-Side)
              </label>
              <select
                id="gemini-model-select"
                value={config.geminiModel}
                onChange={(e) =>
                  onChangeConfig({
                    geminiModel: e.target.value as AppConfigState['geminiModel'],
                  })
                }
                className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Seimbang & Cepat)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Hemat)</option>
              </select>
            </div>

            <div>
              <label htmlFor="ollama-url-input" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                Endpoint Ollama Lokal
              </label>
              <div className="flex gap-2">
                <input
                  id="ollama-url-input"
                  type="url"
                  value={config.ollamaBaseUrl}
                  onChange={(e) => onChangeConfig({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="flex-1 h-10 px-3 text-sm font-mono-tabular bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
                />
                <button
                  type="button"
                  onClick={onCheckOllama}
                  disabled={checkingOllama}
                  aria-label="Uji koneksi Ollama lokal"
                  className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-[#E2DDD3] rounded-lg bg-[#F6F4EF] hover:bg-[#EDE9E0]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingOllama ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Uji</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="ollama-model-input" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
              Tag Model Ollama Lokal
            </label>
            <input
              id="ollama-model-input"
              type="text"
              value={config.ollamaModel}
              onChange={(e) => onChangeConfig({ ollamaModel: e.target.value })}
              placeholder="qwen2.5:3b-instruct-q4_K_M"
              className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
            />
          </div>

          {ollamaHealth && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                ollamaHealth.reachable
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                  : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
              }`}
            >
              {ollamaHealth.reachable ? (
                <div>
                  Terhubung ke Ollama lokal. Model terpasang:{' '}
                  <span className="font-mono-tabular">
                    {ollamaHealth.models.length > 0 ? ollamaHealth.models.join(', ') : '(belum ada model)'}
                  </span>
                </div>
              ) : (
                <div>
                  {ollamaHealth.error} Jika Ollama berjalan di PC Anda, jalankan dengan{' '}
                  <code className="font-mono-tabular">OLLAMA_ORIGINS="*"</code> atau gunakan mode
                  Gemini Hybrid.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Persona & Voice Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-[#1E1D1A]">Identitas Companion & Suara</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="persona-name" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                Nama Companion
              </label>
              <input
                id="persona-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="persona-lang" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                Bahasa Utama
              </label>
              <select
                id="persona-lang"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as 'id' | 'en' })}
                className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="persona-role" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
              Deskripsi Peran
            </label>
            <textarea
              id="persona-role"
              rows={2}
              value={form.roleDescription}
              onChange={(e) => setForm({ ...form, roleDescription: e.target.value })}
              className="w-full p-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
            />
          </div>

          <div>
            <label htmlFor="persona-tone" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
              Panduan Gaya Bicara
            </label>
            <textarea
              id="persona-tone"
              rows={2}
              value={form.toneGuidelines}
              onChange={(e) => setForm({ ...form, toneGuidelines: e.target.value })}
              className="w-full p-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2DDD3]">
            <div>
              <label htmlFor="voice-engine-select" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                Mesin Suara (TTS)
              </label>
              <select
                id="voice-engine-select"
                value={form.voiceEngine}
                onChange={(e) =>
                  setForm({ ...form, voiceEngine: e.target.value as PersonaProfile['voiceEngine'] })
                }
                className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
              >
                <option value="browser">Web Speech Browser (0 MB VRAM, Instan)</option>
                <option value="gemini">Gemini Flash Lite TTS (Suara Cloud Alami)</option>
              </select>
            </div>

            {form.voiceEngine === 'browser' ? (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="speech-rate-slider" className="font-medium text-[#1E1D1A]">
                    Kecepatan Bicara Browser
                  </label>
                  <span className="font-mono-tabular">{form.speechRate.toFixed(1)}x</span>
                </div>
                <input
                  id="speech-rate-slider"
                  type="range"
                  min={0.8}
                  max={1.4}
                  step={0.1}
                  value={form.speechRate}
                  onChange={(e) => setForm({ ...form, speechRate: Number(e.target.value) })}
                  className="w-full accent-[#2D5A4C]"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="gemini-voice-select" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                  Karakter Suara Gemini TTS
                </label>
                <select
                  id="gemini-voice-select"
                  value={form.geminiVoiceName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      geminiVoiceName: e.target.value as PersonaProfile['geminiVoiceName'],
                    })
                  }
                  className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
                >
                  <option value="Kore">Kore (Hangat & Tenang)</option>
                  <option value="Zephyr">Zephyr (Ringan & Jernih)</option>
                  <option value="Puck">Puck (Cerah)</option>
                  <option value="Charon">Charon (Rendah & Stabil)</option>
                  <option value="Fenrir">Fenrir (Tegas)</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A]">
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Pengaturan persona tersimpan</span>
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 text-sm font-medium bg-[#2D5A4C] text-white rounded-lg hover:bg-[#23473C] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
