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
      ? 'text-[#16A34A] border-[#BBF7D0] bg-[#F0FDF4]'
      : estimate.status === 'tight'
        ? 'text-[#D97706] border-[#FDE68A] bg-[#FFFBEB]'
        : 'text-[#DC2626] border-[#FECACA] bg-[#FEF2F2]';

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E2DDD3] pb-5">
          <div>
            <h2 className="text-xl font-semibold text-[#1E1D1A]">
              Profiler Efisiensi RAM 16GB & VRAM 4GB
            </h2>
            <p className="mt-1 text-sm text-[#625F57]">
              Simulasikan ukuran bobot model, KV-cache, dan offload layer agar OpenAmika versi ringan
              tetap lancar tanpa Live2D (~{HARDWARE_CEILING.live2dSavedVramGb} GB VRAM dihemat).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onApplyPreset(preset.ollamaTag, ctxValue)}
            className="h-10 px-4 text-sm font-medium bg-[#2D5A4C] text-white rounded-lg hover:bg-[#23473C] transition-colors whitespace-nowrap shrink-0"
          >
            Pakai Profil Ini di Chat
          </button>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-4">
            <div className="text-xs text-[#625F57]">Estimasi Pemakaian VRAM</div>
            <div className="mt-1 text-2xl font-semibold font-mono-tabular text-[#1E1D1A]">
              {estimate.totalVramUsedGb.toFixed(2)} / {HARDWARE_CEILING.vramGb.toFixed(1)} GB
            </div>
            <div className="mt-2 h-2 w-full bg-[#EDE9E0] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  estimate.status === 'optimal'
                    ? 'bg-[#2D5A4C]'
                    : estimate.status === 'tight'
                      ? 'bg-[#D97706]'
                      : 'bg-[#DC2626]'
                }`}
                style={{ width: `${Math.min(100, estimate.vramUtilizationPct)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-[#625F57] font-mono-tabular">
              Bobot {estimate.modelWeightsOnGpuGb.toFixed(2)} GB · KV {estimate.kvCacheGb.toFixed(2)} GB
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-4">
            <div className="text-xs text-[#625F57]">Estimasi RAM Sistem (16GB)</div>
            <div className="mt-1 text-2xl font-semibold font-mono-tabular text-[#1E1D1A]">
              {estimate.totalSystemRamUsedGb.toFixed(2)} / {HARDWARE_CEILING.ramGb.toFixed(1)} GB
            </div>
            <div className="mt-2 h-2 w-full bg-[#EDE9E0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#625F57] transition-all"
                style={{ width: `${Math.min(100, estimate.ramUtilizationPct)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-[#625F57] font-mono-tabular">
              Spillover bobot di RAM: {estimate.modelWeightsOffloadRamGb.toFixed(2)} GB
            </div>
          </div>

          <div className={`border rounded-xl p-4 flex flex-col justify-between ${statusColor}`}>
            <div className="text-xs font-medium">Status Kecocokan Perangkat</div>
            <div className="mt-1 text-base font-semibold">{estimate.statusLabel}</div>
            <p className="mt-1 text-xs leading-relaxed opacity-90">{estimate.recommendation}</p>
          </div>
        </div>

        {/* Two-column Preset Table + Tuning Sliders */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-7 bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2DDD3] bg-[#FAF9F5]">
              <h3 className="text-sm font-semibold text-[#1E1D1A]">
                Rekomendasi Model LLM Ringan (Tanpa Live2D)
              </h3>
            </div>
            <div className="divide-y divide-[#E2DDD3]">
              {LOCAL_MODEL_PRESETS.map((item) => {
                const active = item.id === preset.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPreset(item)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      active ? 'bg-[#F0F4F2]' : 'hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#1E1D1A]">{item.name}</span>
                      <span className="font-mono-tabular text-xs text-[#2D5A4C]">
                        {item.weightsVramGb.toFixed(2)} GB · {item.speedEstimate4Gb}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-xs text-[#625F57]">
                      {item.ollamaTag} · rekomendasi num_ctx {item.recommendedCtx}
                    </div>
                    <p className="mt-1 text-xs text-[#625F57] leading-relaxed">{item.notes}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-5 space-y-4">
            <div className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#1E1D1A]">Penyetelan Parameter</h3>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="num-ctx-slider" className="font-medium text-[#1E1D1A]">
                    Context Window (num_ctx)
                  </label>
                  <span className="font-mono-tabular font-semibold text-[#2D5A4C]">{ctxValue}</span>
                </div>
                <input
                  id="num-ctx-slider"
                  type="range"
                  min={1024}
                  max={8192}
                  step={1024}
                  value={ctxValue}
                  onChange={(e) => setCtxValue(Number(e.target.value))}
                  className="w-full accent-[#2D5A4C]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label htmlFor="gpu-layers-slider" className="font-medium text-[#1E1D1A]">
                    Layer di GPU (num_gpu)
                  </label>
                  <span className="font-mono-tabular font-semibold text-[#2D5A4C]">
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
                  className="w-full accent-[#2D5A4C]"
                />
              </div>

              <div>
                <label htmlFor="quant-select" className="block text-xs font-medium text-[#1E1D1A] mb-1.5">
                  Tingkat Kuantisasi
                </label>
                <select
                  id="quant-select"
                  value={quant}
                  onChange={(e) => setQuant(e.target.value as LocalModelPreset['quantization'])}
                  className="w-full h-10 px-3 text-sm bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg"
                >
                  <option value="Q4_K_M">Q4_K_M (Paling ramah 4GB VRAM)</option>
                  <option value="Q5_K_M">Q5_K_M (Lebih presisi, +19% VRAM)</option>
                  <option value="Q8_0">Q8_0 (Hampir lossless, +72% VRAM)</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#1E1D1A]">
                <input
                  type="checkbox"
                  checked={quantKv}
                  onChange={(e) => setQuantKv(e.target.checked)}
                  className="accent-[#2D5A4C]"
                />
                <span>Aktifkan Flash Attention + KV-Cache Q8_0 (hemat ~40% KV VRAM)</span>
              </label>
            </div>

            {/* Export Modelfile */}
            <div className="bg-[#FFFFFF] border border-[#E2DDD3] rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#1E1D1A]">Modelfile Siap Pakai</h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy('modelfile', modelfile)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#E2DDD3] rounded-md bg-[#F6F4EF] hover:bg-[#EDE9E0]"
                  >
                    {copied === 'modelfile' ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{copied === 'modelfile' ? 'Tersalin' : 'Salin'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadModelfile}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-[#E2DDD3] rounded-md bg-[#F6F4EF] hover:bg-[#EDE9E0]"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unduh</span>
                  </button>
                </div>
              </div>
              <pre className="p-3 text-xs font-mono-tabular bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg overflow-x-auto text-[#1E1D1A]">
                {modelfile}
              </pre>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium text-[#625F57]">
                    Perintah Jalankan Ollama (CORS + Hemat KV)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('cli', cliCommand)}
                    className="text-xs font-medium text-[#2D5A4C] hover:underline"
                  >
                    {copied === 'cli' ? 'Tersalin' : 'Salin perintah'}
                  </button>
                </div>
                <pre className="p-2.5 text-xs font-mono-tabular bg-[#F6F4EF] border border-[#E2DDD3] rounded-lg overflow-x-auto text-[#1E1D1A]">
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
