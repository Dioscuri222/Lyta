import { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { AppConfigState, PersonaProfile, RelationshipStage } from '../types.ts';
import type { OllamaHealthResult } from '../lib/ollamaClient.ts';
import type { LlamaCppHealthResult } from '../lib/llamaCppClient.ts';
import {
  AUTHENTIC_LYTA_ROLE_DESCRIPTION,
  AUTHENTIC_LYTA_TONE_GUIDELINES,
} from '../lib/lytaContract.ts';

interface PersonaSettingsProps {
  persona: PersonaProfile;
  config: AppConfigState;
  ollamaHealth: OllamaHealthResult | null;
  checkingOllama: boolean;
  llamaCppHealth: LlamaCppHealthResult | null;
  checkingLlamaCpp: boolean;
  onSavePersona: (next: PersonaProfile) => Promise<void>;
  onChangeConfig: (patch: Partial<AppConfigState>) => void;
  onCheckOllama: () => Promise<void>;
  onCheckLlamaCpp: () => Promise<void>;
}

export function PersonaSettings({
  persona,
  config,
  ollamaHealth,
  checkingOllama,
  llamaCppHealth,
  checkingLlamaCpp,
  onSavePersona,
  onChangeConfig,
  onCheckOllama,
  onCheckLlamaCpp,
}: PersonaSettingsProps) {
  const [form, setForm] = useState<PersonaProfile>(persona);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setForm(persona);
  }, [persona]);

  function handleRestoreAuthenticDefaults() {
    setForm((prev) => ({
      ...prev,
      name: 'Lyta',
      roleDescription: AUTHENTIC_LYTA_ROLE_DESCRIPTION,
      toneGuidelines: AUTHENTIC_LYTA_TONE_GUIDELINES,
    }));
  }

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
        <div className="border-b border-[#232B36] pb-5">
          <h2 className="text-xl font-semibold text-[#F1F5F9]">Persona, Suara & Koneksi Hybrid</h2>
          <p className="mt-1 text-sm text-[#94A3B8]">
            Atur kepribadian Lyta, preferensi suara nol-VRAM, serta endpoint Ollama lokal pada
            komputer Anda.
          </p>
        </div>

        {/* Hybrid Engine & Ollama Connection */}
        <section className="bg-[#11151C] border border-[#232B36] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#F1F5F9]">Koneksi Backend Hybrid</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="gemini-model-select" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
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
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Seimbang & Cepat)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Hemat)</option>
              </select>
            </div>

            <div>
              <label htmlFor="ollama-url-input" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Endpoint Ollama Lokal
              </label>
              <div className="flex gap-2">
                <input
                  id="ollama-url-input"
                  type="url"
                  value={config.ollamaBaseUrl}
                  onChange={(e) => onChangeConfig({ ollamaBaseUrl: e.target.value })}
                  placeholder="http://localhost:11434"
                  className="flex-1 h-10 px-3 text-sm font-mono-tabular bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
                />
                <button
                  type="button"
                  onClick={onCheckOllama}
                  disabled={checkingOllama}
                  aria-label="Uji koneksi Ollama lokal"
                  className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-[#232B36] rounded-lg bg-[#181E27] text-[#F1F5F9] hover:border-[#38BDF8]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingOllama ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Uji</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="ollama-model-input" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
              Tag Model Ollama Lokal
            </label>
            <input
              id="ollama-model-input"
              type="text"
              value={config.ollamaModel}
              onChange={(e) => onChangeConfig({ ollamaModel: e.target.value })}
              placeholder="qwen2.5:3b-instruct-q4_K_M"
              className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />
          </div>

          {ollamaHealth && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                ollamaHealth.reachable
                  ? 'bg-[#082F49]/60 border-[#0284C7] text-[#BAE6FD]'
                  : 'bg-[#451A03]/60 border-[#92400E] text-[#FCD34D]'
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

          {/* llama.cpp (llama-server) Settings */}
          <div className="pt-4 border-t border-[#232B36] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="llamacpp-url-input" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                  Endpoint llama.cpp (llama-server)
                </label>
                <div className="flex gap-2">
                  <input
                    id="llamacpp-url-input"
                    type="url"
                    value={config.llamaCppBaseUrl}
                    onChange={(e) => onChangeConfig({ llamaCppBaseUrl: e.target.value })}
                    placeholder="http://localhost:8080"
                    className="flex-1 h-10 px-3 text-sm font-mono-tabular bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
                  />
                  <button
                    type="button"
                    onClick={onCheckLlamaCpp}
                    disabled={checkingLlamaCpp}
                    aria-label="Uji koneksi llama-server lokal"
                    className="h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-[#232B36] rounded-lg bg-[#181E27] text-[#F1F5F9] hover:border-[#38BDF8]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingLlamaCpp ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>Uji</span>
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="llamacpp-model-input" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                  Nama Model / File GGUF (llama.cpp)
                </label>
                <input
                  id="llamacpp-model-input"
                  type="text"
                  value={config.llamaCppModel}
                  onChange={(e) => onChangeConfig({ llamaCppModel: e.target.value })}
                  placeholder="qwen2.5-3b-instruct-q4_k_m.gguf"
                  className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
                />
              </div>
            </div>

            <p className="text-xs text-[#94A3B8]">
              Context size <span className="font-mono-tabular text-[#F1F5F9]">llama-server</span> dikunci
              saat startup melalui flag <span className="font-mono-tabular text-[#F1F5F9]">-c 4096 -fa on -ctk q8_0 -ctv q8_0</span> di{' '}
              <span className="font-mono-tabular text-[#F1F5F9]">start.bat</span>.
            </p>

            {llamaCppHealth && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  llamaCppHealth.reachable
                    ? 'bg-[#082F49]/60 border-[#0284C7] text-[#BAE6FD]'
                    : 'bg-[#451A03]/60 border-[#92400E] text-[#FCD34D]'
                }`}
              >
                {llamaCppHealth.reachable ? (
                  <div>
                    Terhubung ke llama-server ({llamaCppHealth.status ?? 'ok'}). Model aktif:{' '}
                    <span className="font-mono-tabular">
                      {llamaCppHealth.models.length > 0 ? llamaCppHealth.models.join(', ') : config.llamaCppModel}
                    </span>
                  </div>
                ) : (
                  <div>{llamaCppHealth.error}</div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Persona & Voice Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#11151C] border border-[#232B36] rounded-xl p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-[#F1F5F9]">Identitas Lyta & Suara</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="persona-name" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Nama Panggilan Karakter
              </label>
              <input
                id="persona-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label htmlFor="persona-lang" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Bahasa Default (Otomatis Mengikuti Anda)
              </label>
              <select
                id="persona-lang"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as 'id' | 'en' })}
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
              >
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="persona-user-name" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Nama Panggilan Anda
              </label>
              <input
                id="persona-user-name"
                type="text"
                value={form.userName}
                onChange={(e) => setForm({ ...form, userName: e.target.value })}
                placeholder="Roommate"
                required
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label htmlFor="persona-city" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Kota Tempat Tinggal
              </label>
              <input
                id="persona-city"
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Jakarta"
                required
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label htmlFor="persona-rel-stage" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Tahap Kedekatan
              </label>
              <select
                id="persona-rel-stage"
                value={form.relationshipStage}
                onChange={(e) =>
                  setForm({ ...form, relationshipStage: e.target.value as RelationshipStage })
                }
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
              >
                <option value="acquaintance">Kenalan Baru Discord</option>
                <option value="trusted">Teman Terpercaya</option>
                <option value="close">Teman Sekamar Dekat</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="persona-role" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
              Deskripsi Peran
            </label>
            <textarea
              id="persona-role"
              rows={2}
              value={form.roleDescription}
              onChange={(e) => setForm({ ...form, roleDescription: e.target.value })}
              className="w-full p-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />
          </div>

          <div>
            <label htmlFor="persona-tone" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
              Panduan Gaya Bicara
            </label>
            <textarea
              id="persona-tone"
              rows={2}
              value={form.toneGuidelines}
              onChange={(e) => setForm({ ...form, toneGuidelines: e.target.value })}
              className="w-full p-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#232B36]">
            <div>
              <label htmlFor="voice-engine-select" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                Mesin Suara (TTS)
              </label>
              <select
                id="voice-engine-select"
                value={form.voiceEngine}
                onChange={(e) =>
                  setForm({ ...form, voiceEngine: e.target.value as PersonaProfile['voiceEngine'] })
                }
                className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
              >
                <option value="browser">Web Speech Browser (0 MB VRAM, Instan)</option>
                <option value="gemini">Gemini Flash Lite TTS (Suara Cloud Alami)</option>
              </select>
            </div>

            {form.voiceEngine === 'browser' ? (
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="speech-rate-slider" className="font-medium text-[#F1F5F9]">
                    Kecepatan Bicara Browser
                  </label>
                  <span className="font-mono-tabular text-[#38BDF8]">{form.speechRate.toFixed(1)}x</span>
                </div>
                <input
                  id="speech-rate-slider"
                  type="range"
                  min={0.8}
                  max={1.4}
                  step={0.1}
                  value={form.speechRate}
                  onChange={(e) => setForm({ ...form, speechRate: Number(e.target.value) })}
                  className="w-full accent-[#38BDF8]"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="gemini-voice-select" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
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
                  className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {savedNotice ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#38BDF8]">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Pengaturan persona tersimpan</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleRestoreAuthenticDefaults}
                  className="text-xs font-medium text-[#94A3B8] hover:text-[#38BDF8] transition-colors"
                >
                  Pulihkan persona autentik Lyta
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 text-sm font-medium bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] rounded-lg hover:from-[#7DD3FC] hover:to-[#38BDF8] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
