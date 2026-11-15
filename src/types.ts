export type EngineMode = 'gemini' | 'ollama';

export type RegisterType = 'polite' | 'casual' | 'serious' | 'intimate' | 'whisper';

export type EmotionTag = string;

export type RelationshipStage = 'acquaintance' | 'trusted' | 'close';

export type MemoryCategory = 'preference' | 'fact' | 'project' | 'routine';

export type VoiceEngineMode = 'browser' | 'gemini';

export interface PersonaProfile {
  name: string;
  userName: string;
  city: string;
  relationshipStage: RelationshipStage;
  roleDescription: string;
  toneGuidelines: string;
  language: 'id' | 'en';
  autoSpeak: boolean;
  voiceEngine: VoiceEngineMode;
  speechRate: number;
  geminiVoiceName: 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
}

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: EmotionTag;
  thought?: string;
  engine: EngineMode;
  modelName: string;
  tokenEstimate: number;
  latencyMs?: number;
  createdAt: string;
}

export interface LocalModelPreset {
  id: string;
  name: string;
  ollamaTag: string;
  paramsBillions: number;
  quantization: 'Q4_K_M' | 'Q5_K_M' | 'Q8_0';
  weightsVramGb: number;
  kvPer1kCtxGb: number;
  defaultLayers: number;
  maxLayers: number;
  recommendedCtx: number;
  speedEstimate4Gb: string;
  notes: string;
}

export interface VramEstimate {
  modelWeightsOnGpuGb: number;
  modelWeightsOffloadRamGb: number;
  kvCacheGb: number;
  runtimeOverheadGb: number;
  totalVramUsedGb: number;
  totalSystemRamUsedGb: number;
  vramUtilizationPct: number;
  ramUtilizationPct: number;
  status: 'optimal' | 'tight' | 'spill';
  statusLabel: string;
  recommendation: string;
}

export interface AppConfigState {
  engine: EngineMode;
  geminiModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  ollamaBaseUrl: string;
  ollamaModel: string;
  numCtx: number;
  memoryTokenBudget: number;
}
