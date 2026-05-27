"use client";

/**
 * Wave 21 — Dialog para editar el journal entry de un trade cerrado.
 *
 * Notas markdown · Tags chips · Confidence slider (0-100) · Rating 1-5 ⭐ ·
 * Checklist editable.
 *
 * El screenshot gallery queda para Wave futura (necesita IDB blob storage).
 */

import { useEffect, useState } from "react";
import { Star, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useTestingStore,
  type ChecklistItem,
  type Trade,
} from "@/lib/store/testing-store";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trade: Trade | null;
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function JournalDialog({ open, onOpenChange, trade }: Props) {
  const detail = useTestingStore((s) => s.activeDetail);
  const upsert = useTestingStore((s) => s.upsertJournal);
  const remove = useTestingStore((s) => s.deleteJournal);

  const existing = trade?.id ? detail?.journals?.[trade.id] : undefined;
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [rating, setRating] = useState<number>(0);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemLabel, setNewItemLabel] = useState("");

  useEffect(() => {
    if (open && trade) {
      setNotes(existing?.notes ?? "");
      setTags(existing?.tags ?? trade.tags ?? []);
      setConfidence(existing?.confidence ?? 50);
      setRating(existing?.rating ?? 0);
      setChecklist(existing?.checklist ?? []);
      setTagInput("");
      setNewItemLabel("");
    }
  }, [open, trade, existing]);

  if (!trade) return null;

  async function handleSave() {
    if (!trade) return;
    await upsert(trade.id, {
      notes,
      tags,
      confidence,
      rating: rating || undefined,
      checklist,
      screenshotIds: [],
    });
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!trade) return;
    if (!confirm("¿Borrar este journal entry?")) return;
    await remove(trade.id);
    onOpenChange(false);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  function addChecklistItem() {
    const label = newItemLabel.trim();
    if (!label) return;
    setChecklist([...checklist, { id: uid(), label, checked: false }]);
    setNewItemLabel("");
  }

  const tradePnLClass = trade.realizedPnL >= 0 ? "text-tv-green" : "text-tv-red";
  const sideClass = trade.side === "buy" ? "text-tv-green" : "text-tv-red";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <span>Journal del trade</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", sideClass, trade.side === "buy" ? "bg-tv-green/15" : "bg-tv-red/15")}>
                {trade.side === "buy" ? "Long" : "Short"}
              </span>
              <span className="font-mono text-[11px] text-tv-text-muted">
                {trade.entry.toFixed(2)} → {trade.closePrice.toFixed(2)}
              </span>
              <span className={cn("font-mono text-[11px]", tradePnLClass)}>
                {trade.realizedPnL >= 0 ? "+" : ""}${trade.realizedPnL.toFixed(2)}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Notas */}
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="¿Por qué entraste? ¿Qué viste? ¿Qué harías diferente?"
              className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[12px] text-tv-text"
            />
          </Field>

          {/* Rating + Confidence */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rating del setup (post-trade)">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(rating === n ? 0 : n)}
                    className="p-0.5"
                  >
                    <Star
                      className={cn(
                        "h-5 w-5",
                        n <= rating
                          ? "fill-tv-yellow text-tv-yellow"
                          : "text-tv-border",
                      )}
                    />
                  </button>
                ))}
                <span className="ml-1 text-[10px] text-tv-text-muted">
                  {rating > 0 ? `${rating}/5` : "—"}
                </span>
              </div>
            </Field>
            <Field label={`Convicción pre-trade: ${confidence}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(parseInt(e.target.value, 10))}
                className="w-full accent-tv-blue"
              />
            </Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded bg-tv-blue/15 px-1.5 py-0.5 text-[11px] text-tv-blue"
                >
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="hover:text-tv-red"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Tag + Enter…"
                className="flex-1 min-w-[120px] rounded border border-tv-border bg-tv-bg px-2 py-1 text-[11px] text-tv-text"
              />
            </div>
          </Field>

          {/* Checklist */}
          <Field label="Checklist">
            <div className="flex flex-col gap-1">
              {checklist.length === 0 && (
                <p className="text-[10px] text-tv-text-muted">
                  Agregá items: "Esperé confirmación", "RR ≥ 2", "Outside session bias"…
                </p>
              )}
              {checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-[11px] text-tv-text">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) =>
                      setChecklist(
                        checklist.map((c) =>
                          c.id === item.id ? { ...c, checked: e.target.checked } : c,
                        ),
                      )
                    }
                  />
                  <span className={item.checked ? "" : "text-tv-text"}>{item.label}</span>
                  <button
                    onClick={() => setChecklist(checklist.filter((c) => c.id !== item.id))}
                    className="ml-auto text-tv-text-muted hover:text-tv-red"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </label>
              ))}
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  placeholder="Nuevo item + Enter…"
                  className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-[11px] text-tv-text"
                />
                <button
                  onClick={addChecklistItem}
                  className="rounded border border-tv-border px-2 py-1 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                >
                  Agregar
                </button>
              </div>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-tv-border px-4 py-2.5">
          {existing ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 rounded border border-tv-border px-3 py-1.5 text-[11px] text-tv-red hover:bg-tv-red/10"
            >
              <Trash2 className="h-3 w-3" />
              Borrar
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded border border-tv-border px-3 py-1.5 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="rounded bg-tv-blue px-4 py-1.5 text-[11px] font-medium text-white hover:bg-tv-blue/90"
            >
              Guardar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
