import { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { LocalModelPreset, PersonaProfile } from '../types.ts';
import {
  HARDWARE_CEILING,
  LOCAL_MODEL_PRESETS,
  buildModelfileContent,
  estimateVramUsage,
} from '../lib/vramCalculator.ts';

interface VramProfilerProps {
  selectedOllamaModel: string;
  numCtx: number;
  persona: PersonaProfile;
  onApplyPreset: (ollamaTag: string, numCtx: number) => void;
}

export function VramProfiler({
  selectedOllamaModel,
  numCtx,
  persona,
  onApplyPreset,
}: VramProfilerProps) {
  const initialPreset =
    LOCAL_MODEL_PRESETS.find((p) => p.ollamaTag === selectedOllamaModel) ?? LOCAL_MODEL_PRESETS[0];

  const [presetId, setPresetId] = useState(initialPreset.id);
  const [ctxValue, setCtxValue] = useState(numCtx);
  const [quant, setQuant] = useState<LocalModelPreset['quantization']>(initialPreset.quantization);
  const [gpuLayers, setGpuLayers] = useState(initialPreset.maxLayers);
  const [quantKv, setQuantKv] = useState(true);
  const [copied, setCopied] = useState<'modelfile' | 'cli' | null>(null);

  const preset = useMemo(
    () => LOCAL_MODEL_PRESETS.find((p) => p.id === presetId) ?? LOCAL_MODEL_PRESETS[0],
    [presetId]
  );

  const estimate = useMemo(
    () => estimateVramUsage(preset, ctxValue, gpuLayers, quant, quantKv),
    [preset, ctxValue, gpuLayers, quant, quantKv]
  );

  const modelfile = useMemo(
    () => buildModelfileContent(preset, ctxValue, gpuLayers, persona),
    [preset, ctxValue, gpuLayers, persona]
  );

  const cliCommand = `OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_ORIGINS="*" ollama serve`;

  function handleSelectPreset(next: LocalModelPreset) {
    setPresetId(next.id);
    setQuant(next.quantization);
    setGpuLayers(next.defaultLayers);
    setCtxValue(next.recommendedCtx);
  }

  async function handleCopy(kind: 'modelfile' | 'cli', text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }

  function handleDownloadModelfile() {
    const blob = new Blob([modelfile], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Modelfile';
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusColor =
    estimate.status === 'optimal'
      ? 'text-[#BAE6FD] border-[#0284C7] bg-[#082F49]/60'
      : estimate.status === 'tight'
        ? 'text-[#FCD34D] border-[#92400E] bg-[#451A03]/60'
        : 'text-[#FCA5A5] border-[#991B1B] bg-[#450A0A]/60';

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232B36] pb-5">
          <div>
            <h2 className="text-xl font-semibold text-[#F1F5F9]">
              Profiler Efisiensi RAM 16GB & VRAM 4GB
            </h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Simulasikan ukuran bobot model, KV-cache, dan offload layer agar Lyta tetap lancar
              tanpa Live2D (~{HARDWARE_CEILING.live2dSavedVramGb} GB VRAM dihemat).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onApplyPreset(preset.ollamaTag, ctxValue)}
            className="h-10 px-4 text-sm font-medium bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] rounded-lg hover:from-[#7DD3FC] hover:to-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
          >
            Pakai Profil Ini di Chat
          </button>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#11151C] border border-[#232B36] rounded-xl p-4">
            <div className="text-xs text-[#94A3B8]">Estimasi Pemakaian VRAM</div>
            <div className="mt-1 text-2xl font-semibold font-mono-tabular text-[#F1F5F9]">
              {estimate.totalVramUsedGb.toFixed(2)} / {HARDWARE_CEILING.vramGb.toFixed(1)} GB
            </div>
            <div className="mt-2 h-2 w-full bg-[#181E27] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  estimate.status === 'optimal'
                    ? 'bg-gradient-to-r from-[#38BDF8] to-[#0284C7]'
                    : estimate.status === 'tight'
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#EF4444]'
                }`}
                style={{ width: `${Math.min(100, estimate.vramUtilizationPct)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-[#94A3B8] font-mono-tabular">
              Bobot {estimate.modelWeightsOnGpuGb.toFixed(2)} GB · KV {estimate.kvCacheGb.toFixed(2)} GB
            </div>
          </div>

          <div className="bg-[#11151C] border border-[#232B36] rounded-xl p-4">
            <div className="text-xs text-[#94A3B8]">Estimasi RAM Sistem (16GB)</div>
            <div className="mt-1 text-2xl font-semibold font-mono-tabular text-[#F1F5F9]">
              {estimate.totalSystemRamUsedGb.toFixed(2)} / {HARDWARE_CEILING.ramGb.toFixed(1)} GB
            </div>
            <div className="mt-2 h-2 w-full bg-[#181E27] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7DD3FC] to-[#0EA5E9] transition-all"
                style={{ width: `${Math.min(100, estimate.ramUtilizationPct)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-[#94A3B8] font-mono-tabular">
              Spillover bobot di RAM: {estimate.modelWeightsOffloadRamGb.toFixed(2)} GB
            </div>
          </div>

          <div className={`border rounded-xl p-4 flex flex-col justify-between ${statusColor}`}>
            <div className="text-xs font-medium">Status Kecocokan Perangkat</div>
            <div className="mt-1 text-base font-semibold">{estimate.statusLabel}</div>
            <p className="mt-1 text-xs leading-relaxed opacity-95">{estimate.recommendation}</p>
          </div>
        </div>

        {/* Two-column Preset Table + Tuning Sliders */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-[#11151C] border border-[#232B36] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#232B36] bg-[#0D1015]">
              <h3 className="text-sm font-semibold text-[#F1F5F9]">
                Rekomendasi Model LLM Ringan untuk Lyta
              </h3>
            </div>
            <div className="divide-y divide-[#232B36]">
              {LOCAL_MODEL_PRESETS.map((item) => {
                const active = item.id === preset.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPreset(item)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      active
                        ? 'bg-gradient-to-r from-[#0E1E2E] to-[#11151C]'
                        : 'hover:bg-[#181E27]/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#F1F5F9]">{item.name}</span>
                      <span className="font-mono-tabular text-xs text-[#38BDF8]">
                        {item.weightsVramGb.toFixed(2)} GB · {item.speedEstimate4Gb}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-[#94A3B8]">
                      {item.ollamaTag} · rekomendasi num_ctx {item.recommendedCtx}
                    </div>
                    <p className="mt-1 text-xs text-[#94A3B8] leading-relaxed">{item.notes}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-5 space-y-4">
            <div className="bg-[#11151C] border border-[#232B36] rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#F1F5F9]">Penyetelan Parameter</h3>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="num-ctx-slider" className="font-medium text-[#F1F5F9]">
                    Context Window (num_ctx)
                  </label>
                  <span className="font-mono-tabular font-semibold text-[#38BDF8]">{ctxValue}</span>
                </div>
                <input
                  id="num-ctx-slider"
                  type="range"
                  min={1024}
                  max={8192}
                  step={1024}
                  value={ctxValue}
                  onChange={(e) => setCtxValue(Number(e.target.value))}
                  className="w-full accent-[#38BDF8]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="gpu-layers-slider" className="font-medium text-[#F1F5F9]">
                    Layer di GPU (num_gpu)
                  </label>
                  <span className="font-mono-tabular font-semibold text-[#38BDF8]">
                    {gpuLayers} / {preset.maxLayers}
                  </span>
                </div>
                <input
                  id="gpu-layers-slider"
                  type="range"
                  min={0}
                  max={preset.maxLayers}
                  step={1}
                  value={gpuLayers}
                  onChange={(e) => setGpuLayers(Number(e.target.value))}
                  className="w-full accent-[#38BDF8]"
                />
              </div>

              <div>
                <label htmlFor="quant-select" className="block text-xs font-medium text-[#F1F5F9] mb-1.5">
                  Tingkat Kuantisasi
                </label>
                <select
                  id="quant-select"
                  value={quant}
                  onChange={(e) => setQuant(e.target.value as LocalModelPreset['quantization'])}
                  className="w-full h-10 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
                >
                  <option value="Q4_K_M">Q4_K_M (Paling ramah 4GB VRAM)</option>
                  <option value="Q5_K_M">Q5_K_M (Lebih presisi, +19% VRAM)</option>
                  <option value="Q8_0">Q8_0 (Hampir lossless, +72% VRAM)</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#F1F5F9]">
                <input
                  type="checkbox"
                  checked={quantKv}
                  onChange={(e) => setQuantKv(e.target.checked)}
                  className="accent-[#38BDF8]"
                />
                <span>Aktifkan Flash Attention + KV-Cache Q8_0 (hemat ~40% KV VRAM)</span>
              </label>
            </div>

            {/* Export Modelfile */}
            <div className="bg-[#11151C] border border-[#232B36] rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#F1F5F9]">Modelfile Siap Pakai</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy('modelfile', modelfile)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#232B36] rounded-md bg-[#181E27] text-[#F1F5F9] hover:border-[#38BDF8]"
                  >
                    {copied === 'modelfile' ? (
                      <Check className="w-3.5 h-3.5 text-[#38BDF8]" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copied === 'modelfile' ? 'Tersalin' : 'Salin'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadModelfile}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#232B36] rounded-md bg-[#181E27] text-[#F1F5F9] hover:border-[#38BDF8]"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unduh</span>
                  </button>
                </div>
              </div>
              <pre className="p-3 text-xs font-mono-tabular bg-[#080A0D] border border-[#232B36] rounded-lg overflow-x-auto text-[#F1F5F9]">
                {modelfile}
              </pre>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium text-[#94A3B8]">
                    Perintah Jalankan Ollama (CORS + Hemat KV)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('cli', cliCommand)}
                    className="text-xs font-medium text-[#38BDF8] hover:underline"
                  >
                    {copied === 'cli' ? 'Tersalin' : 'Salin perintah'}
                  </button>
                </div>
                <pre className="p-2.5 text-xs font-mono-tabular bg-[#080A0D] border border-[#232B36] rounded-lg overflow-x-auto text-[#F1F5F9]">
                  {cliCommand}
                </pre>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
