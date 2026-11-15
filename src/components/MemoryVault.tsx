import { useState } from 'react';
import { Pin, Plus, Search, Trash2, Pencil, Check, X } from 'lucide-react';
import type { MemoryCategory, MemoryItem } from '../types.ts';
import { estimateTokens } from '../lib/vramCalculator.ts';

interface MemoryVaultProps {
  memories: MemoryItem[];
  memoryTokenBudget: number;
  onUpdateBudget: (budget: number) => void;
  onAddMemory: (content: string, category: MemoryCategory, pinned: boolean) => Promise<void>;
  onUpdateMemory: (
    id: string,
    patch: Partial<Pick<MemoryItem, 'content' | 'category' | 'pinned'>>
  ) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preferensi',
  fact: 'Fakta Diri',
  project: 'Proyek',
  routine: 'Rutinitas',
};

export function MemoryVault({
  memories,
  memoryTokenBudget,
  onUpdateBudget,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
}: MemoryVaultProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | MemoryCategory>('all');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact');
  const [newPinned, setNewPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = memories.filter((m) => {
    const matchesCategory = filterCategory === 'all' || m.category === filterCategory;
    const matchesSearch =
      !search.trim() || m.content.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalTokens = memories.reduce((acc, m) => acc + estimateTokens(m.content), 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onAddMemory(newContent.trim(), newCategory, newPinned);
      setNewContent('');
      setNewPinned(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah memori.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editingText.trim()) return;
    try {
      await onUpdateMemory(id, { content: editingText.trim() });
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui memori.');
    }
  }

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#232B36] pb-5">
          <div>
            <h2 className="text-xl font-semibold text-[#F1F5F9]">Brankas Memori Jangka Panjang</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              Hanya memori tersemat dan paling relevan yang disuntikkan ke prompt agar konteks LLM lokal
              tetap hemat di VRAM 4GB.
            </p>
          </div>
          <div className="text-right font-mono-tabular text-xs text-[#94A3B8]">
            <div>Total tersimpan: {memories.length} entri</div>
            <div>Estimasi keseluruhan: ~{totalTokens} token</div>
          </div>
        </div>

        {/* Token Budget Control */}
        <section className="bg-[#11151C] border border-[#232B36] rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="memory-budget-slider" className="text-sm font-medium text-[#F1F5F9]">
              Batas Anggaran Token Memori per Prompt
            </label>
            <span className="font-mono-tabular text-sm font-semibold text-[#38BDF8]">
              {memoryTokenBudget} token
            </span>
          </div>
          <input
            id="memory-budget-slider"
            type="range"
            min={150}
            max={900}
            step={50}
            value={memoryTokenBudget}
            onChange={(e) => onUpdateBudget(Number(e.target.value))}
            className="mt-3 w-full accent-[#38BDF8]"
          />
          <p className="mt-2 text-xs text-[#94A3B8]">
            Disarankan 250 sampai 400 token untuk model lokal 3B pada num_ctx 4096 agar sisa ruang
            percakapan tetap lapang.
          </p>
        </section>

        {/* Add Memory Form */}
        <form
          onSubmit={handleAdd}
          className="bg-[#11151C] border border-[#232B36] rounded-xl p-4 sm:p-5 space-y-3"
        >
          <label htmlFor="new-memory-input" className="block text-sm font-medium text-[#F1F5F9]">
            Tambah Memori Baru
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="new-memory-input"
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Contoh: Aku menggunakan laptop RAM 16GB dan GPU 4GB VRAM."
              className="flex-1 h-11 px-3.5 text-sm bg-[#080A0D] text-[#F1F5F9] placeholder:text-[#94A3B8] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />
            <select
              aria-label="Kategori memori"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              className="h-11 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-lg"
            >
              <option value="fact">Fakta Diri</option>
              <option value="preference">Preferensi</option>
              <option value="project">Proyek</option>
              <option value="routine">Rutinitas</option>
            </select>
            <button
              type="submit"
              disabled={!newContent.trim() || submitting}
              className="h-11 px-4 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] rounded-lg hover:from-[#7DD3FC] hover:to-[#38BDF8] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Memori'}</span>
            </button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-[#94A3B8]">
            <input
              type="checkbox"
              checked={newPinned}
              onChange={(e) => setNewPinned(e.target.checked)}
              className="rounded accent-[#38BDF8]"
            />
            <span>Sematkan permanen (selalu ikut di setiap percakapan)</span>
          </label>
          {errorMsg && (
            <p role="alert" className="text-xs text-[#FCA5A5]">
              {errorMsg}
            </p>
          )}
        </form>

        {/* Filter & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap items-center gap-1 p-1 bg-[#11151C] border border-[#232B36] rounded-lg"
            role="tablist"
            aria-label="Filter kategori memori"
          >
            {(['all', 'fact', 'preference', 'project', 'routine'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={filterCategory === cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filterCategory === cat
                    ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {cat === 'all' ? 'Semua' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="memory-search" className="sr-only">
              Cari memori
            </label>
            <input
              id="memory-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kata kunci memori..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-[#11151C] text-[#F1F5F9] placeholder:text-[#94A3B8] border border-[#232B36] rounded-lg focus:border-[#38BDF8]"
            />
          </div>
        </div>

        {/* Memory List */}
        {filtered.length === 0 ? (
          <div className="bg-[#11151C] border border-[#232B36] rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-[#F1F5F9]">
              {memories.length === 0
                ? 'Belum ada memori jangka panjang tersimpan.'
                : 'Tidak ada memori yang cocok dengan filter saat ini.'}
            </p>
            <p className="mt-1 text-xs text-[#94A3B8]">
              Tambahkan fakta preferensi Anda di atas atau gunakan tombol Simpan Intisari Memori setelah
              berdiskusi.
            </p>
          </div>
        ) : (
          <div className="bg-[#11151C] border border-[#232B36] rounded-xl divide-y divide-[#232B36]">
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8] mb-1">
                      <span className="font-medium text-[#38BDF8]">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">~{estimateTokens(item.content)} token</span>
                      {item.pinned && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-[#F1F5F9]">Tersemat</span>
                        </>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingId(null);
                            if (e.key === 'Enter') void handleSaveEdit(item.id);
                          }}
                          className="flex-1 h-9 px-3 text-sm bg-[#080A0D] text-[#F1F5F9] border border-[#232B36] rounded-md"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(item.id)}
                          aria-label="Simpan perubahan"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#38BDF8] text-[#080A0D]"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Batal sunting"
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-[#232B36] text-[#94A3B8]"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-[#F1F5F9] leading-relaxed">{item.content}</p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateMemory(item.id, { pinned: !item.pinned })}
                        aria-label={item.pinned ? 'Lepas sematan memori' : 'Sematkan memori'}
                        aria-pressed={item.pinned}
                        className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors ${
                          item.pinned
                            ? 'bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9] text-[#080A0D] border-[#38BDF8]'
                            : 'bg-[#181E27] text-[#94A3B8] border-[#232B36] hover:text-[#F1F5F9]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingText(item.content);
                        }}
                        aria-label="Sunting memori"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#232B36] bg-[#181E27] text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteMemory(item.id)}
                        aria-label="Hapus memori"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-[#232B36] bg-[#181E27] text-[#94A3B8] hover:text-[#FCA5A5] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
