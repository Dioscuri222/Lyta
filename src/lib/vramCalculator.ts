import type {
  LocalModelPreset,
  MemoryItem,
  PersonaProfile,
  VramEstimate,
} from '../types.ts';

export const HARDWARE_CEILING = {
  vramGb: 4.0,
  ramGb: 16.0,
  osAndBrowserRamGb: 5.2,
  live2dSavedVramGb: 0.9,
} as const;

export const LOCAL_MODEL_PRESETS: LocalModelPreset[] = [
  {
    id: 'qwen25-3b-q4',
    name: 'Qwen 2.5 3B Instruct',
    ollamaTag: 'qwen2.5:3b-instruct-q4_K_M',
    paramsBillions: 3.09,
    quantization: 'Q4_K_M',
    weightsVramGb: 1.93,
    kvPer1kCtxGb: 0.14,
    defaultLayers: 36,
    maxLayers: 36,
    recommendedCtx: 4096,
    speedEstimate4Gb: '28-42 tok/s',
    notes: 'Keseimbangan terbaik untuk Bahasa Indonesia, kepatuhan persona, dan muat penuh di VRAM 4GB.',
  },
  {
    id: 'llama32-3b-q4',
    name: 'Llama 3.2 3B Instruct',
    ollamaTag: 'llama3.2:3b-instruct-q4_K_M',
    paramsBillions: 3.21,
    quantization: 'Q4_K_M',
    weightsVramGb: 2.02,
    kvPer1kCtxGb: 0.11,
    defaultLayers: 28,
    maxLayers: 28,
    recommendedCtx: 4096,
    speedEstimate4Gb: '25-38 tok/s',
    notes: 'Gaya percakapan natural dengan KV-cache GQA yang sangat hemat untuk sesi panjang.',
  },
  {
    id: 'gemma2-2b-q4',
    name: 'Gemma 2 2B Instruct',
    ollamaTag: 'gemma2:2b-instruct-q4_K_M',
    paramsBillions: 2.61,
    quantization: 'Q4_K_M',
    weightsVramGb: 1.63,
    kvPer1kCtxGb: 0.13,
    defaultLayers: 26,
    maxLayers: 26,
    recommendedCtx: 4096,
    speedEstimate4Gb: '35-52 tok/s',
    notes: 'Sangat ringan dan responsif untuk laptop dengan aplikasi lain berjalan bersamaan.',
  },
  {
    id: 'qwen25-15b-q4',
    name: 'Qwen 2.5 1.5B Instruct',
    ollamaTag: 'qwen2.5:1.5b-instruct-q4_K_M',
    paramsBillions: 1.54,
    quantization: 'Q4_K_M',
    weightsVramGb: 0.99,
    kvPer1kCtxGb: 0.09,
    defaultLayers: 28,
    maxLayers: 28,
    recommendedCtx: 8192,
    speedEstimate4Gb: '55-75 tok/s',
    notes: 'Opsi ultra-ringan saat VRAM terpakai aplikasi lain atau butuh konteks 8K tetap penuh di GPU.',
  },
  {
    id: 'phi35-mini-q4',
    name: 'Phi-3.5 Mini 3.8B',
    ollamaTag: 'phi3.5:3.8b-mini-instruct-q4_K_M',
    paramsBillions: 3.82,
    quantization: 'Q4_K_M',
    weightsVramGb: 2.38,
    kvPer1kCtxGb: 0.16,
    defaultLayers: 32,
    maxLayers: 32,
    recommendedCtx: 2048,
    speedEstimate4Gb: '18-26 tok/s',
    notes: 'Penalaran lebih kuat, disarankan membatasi num_ctx ke 2048-3072 agar tidak tumpah ke RAM.',
  },
  {
    id: 'qwen25-7b-q4-ref',
    name: 'Qwen 2.5 7B (Pembanding Spillover)',
    ollamaTag: 'qwen2.5:7b-instruct-q4_K_M',
    paramsBillions: 7.61,
    quantization: 'Q4_K_M',
    weightsVramGb: 4.68,
    kvPer1kCtxGb: 0.22,
    defaultLayers: 18,
    maxLayers: 28,
    recommendedCtx: 2048,
    speedEstimate4Gb: '5-9 tok/s (CPU offload)',
    notes: 'Melebihi 4GB VRAM sehingga sebagian layer turun ke RAM 16GB; hanya untuk tugas non-realtime.',
  },
];

const QUANT_MULTIPLIER: Record<LocalModelPreset['quantization'], number> = {
  Q4_K_M: 1.0,
  Q5_K_M: 1.19,
  Q8_0: 1.72,
};

export function estimateVramUsage(
  preset: LocalModelPreset,
  numCtx: number,
  gpuLayers: number,
  quantization: LocalModelPreset['quantization'] = preset.quantization,
  quantizedKvCache = true
): VramEstimate {
  const clampedLayers = Math.max(0, Math.min(gpuLayers, preset.maxLayers));
  const gpuRatio = preset.maxLayers > 0 ? clampedLayers / preset.maxLayers : 1;
  const scaledWeightsGb = preset.weightsVramGb * QUANT_MULTIPLIER[quantization];

  const modelWeightsOnGpuGb = Number((scaledWeightsGb * gpuRatio).toFixed(2));
  const modelWeightsOffloadRamGb = Number((scaledWeightsGb * (1 - gpuRatio)).toFixed(2));

  // Flash Attention + q8_0 KV cache saves ~40% KV cache memory on Ollama.
  const kvFactor = quantizedKvCache ? 0.6 : 1.0;
  const rawKvGb = (numCtx / 1024) * preset.kvPer1kCtxGb * kvFactor;
  const kvOnGpuGb = Number((rawKvGb * gpuRatio).toFixed(2));
  const kvOnRamGb = Number((rawKvGb * (1 - gpuRatio)).toFixed(2));

  const runtimeOverheadGb = clampedLayers > 0 ? 0.42 : 0.0;
  const totalVramUsedGb = Number((modelWeightsOnGpuGb + kvOnGpuGb + runtimeOverheadGb).toFixed(2));
  const totalSystemRamUsedGb = Number(
    (HARDWARE_CEILING.osAndBrowserRamGb + modelWeightsOffloadRamGb + kvOnRamGb + 0.55).toFixed(2)
  );

  const vramUtilizationPct = Math.round((totalVramUsedGb / HARDWARE_CEILING.vramGb) * 100);
  const ramUtilizationPct = Math.round((totalSystemRamUsedGb / HARDWARE_CEILING.ramGb) * 100);

  let status: VramEstimate['status'] = 'optimal';
  let statusLabel = 'Optimal di VRAM 4GB';
  let recommendation =
    'Seluruh bobot dan KV-cache muat di GPU 4GB dengan ruang cadangan aman untuk tampilan desktop.';

  if (totalVramUsedGb > HARDWARE_CEILING.vramGb || modelWeightsOffloadRamGb > 0.25) {
    status = 'spill';
    statusLabel = 'Melebihi VRAM 4GB (Spill ke RAM)';
    recommendation =
      'Kurangi num_ctx ke 2048-4096, gunakan kuantisasi Q4_K_M, atau pilih model kelas 2B-3B agar tidak melambat.';
  } else if (totalVramUsedGb > 3.45) {
    status = 'tight';
    statusLabel = 'Ketat (Mendekati 4GB)';
    recommendation =
      'Masih muat di 4GB VRAM, namun tutup aplikasi GPU lain atau aktifkan KV-cache Q8_0 agar stabil.';
  }

  return {
    modelWeightsOnGpuGb,
    modelWeightsOffloadRamGb,
    kvCacheGb: Number(rawKvGb.toFixed(2)),
    runtimeOverheadGb,
    totalVramUsedGb,
    totalSystemRamUsedGb,
    vramUtilizationPct,
    ramUtilizationPct,
    status,
    statusLabel,
    recommendation,
  };
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 3.8));
}

export function selectRelevantMemories(
  memories: MemoryItem[],
  query: string,
  maxTokenBudget: number
): MemoryItem[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

  const scored = memories.map((item) => {
    const lower = item.content.toLowerCase();
    let score = item.pinned ? 1000 : 0;
    for (const w of words) {
      if (lower.includes(w)) score += 10;
    }
    if (item.category === 'preference') score += 3;
    return { item, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.item.updatedAt.localeCompare(a.item.updatedAt);
  });

  const chosen: MemoryItem[] = [];
  let usedTokens = 0;
  for (const entry of scored) {
    const cost = estimateTokens(entry.item.content) + 6;
    if (usedTokens + cost > maxTokenBudget && chosen.length > 0 && !entry.item.pinned) {
      continue;
    }
    if (usedTokens + cost > maxTokenBudget && !entry.item.pinned) {
      break;
    }
    chosen.push(entry.item);
    usedTokens += cost;
  }
  return chosen;
}

export function buildModelfileContent(
  preset: LocalModelPreset,
  numCtx: number,
  gpuLayers: number,
  persona: PersonaProfile
): string {
  const cleanSystem = `${persona.roleDescription} ${persona.toneGuidelines}`
    .replace(/"/g, '\\"')
    .trim();

  return [
    `FROM ${preset.ollamaTag}`,
    `PARAMETER num_ctx ${numCtx}`,
    `PARAMETER num_gpu ${gpuLayers}`,
    `PARAMETER num_thread 6`,
    `PARAMETER temperature 0.7`,
    `PARAMETER repeat_penalty 1.1`,
    `SYSTEM "${cleanSystem}"`,
  ].join('\n');
}

export function runSelfChecks(): { passed: boolean; details: string[] } {
  const details: string[] = [];
  const qwen3b = LOCAL_MODEL_PRESETS[0];
  const fit = estimateVramUsage(qwen3b, 4096, qwen3b.maxLayers, 'Q4_K_M', true);
  if (fit.status !== 'optimal' || fit.totalVramUsedGb >= 4.0) {
    throw new Error(`Expected Qwen 2.5 3B Q4_K_M @ 4096 to fit in 4GB VRAM, got ${fit.totalVramUsedGb}GB`);
  }
  details.push(`Qwen 3B @ 4096 ctx = ${fit.totalVramUsedGb} GB VRAM (${fit.status})`);

  const qwen7b = LOCAL_MODEL_PRESETS[5];
  const spill = estimateVramUsage(qwen7b, 4096, qwen7b.maxLayers, 'Q4_K_M', true);
  if (spill.status !== 'spill') {
    throw new Error(`Expected Qwen 2.5 7B to spill over 4GB VRAM, got ${spill.status}`);
  }
  details.push(`Qwen 7B @ 4096 ctx = ${spill.totalVramUsedGb} GB VRAM (${spill.status})`);

  const sampleMem: MemoryItem[] = [
    {
      id: '1',
      content: 'Pengguna memakai laptop RAM 16GB dan GPU RTX 3050 4GB VRAM.',
      category: 'fact',
      pinned: true,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
    {
      id: '2',
      content: 'Suka balasan ringkas berbahasa Indonesia tanpa basa-basi.',
      category: 'preference',
      pinned: false,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
  ];
  const selected = selectRelevantMemories(sampleMem, 'bahasa indonesia', 24);
  if (selected.length === 0 || selected[0].id !== '1') {
    throw new Error('Pinned memory must take precedence in token budget selection');
  }
  details.push(`Memory selector kept ${selected.length} item(s) within budget`);

  return { passed: true, details };
}
