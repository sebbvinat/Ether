"use client";

import { useState } from "react";
import { FolderOpen, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChartStore } from "@/lib/store/chart-store";
import { getInstrument } from "@/lib/instruments";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function WorkspacesDialog({ open, onOpenChange }: Props) {
  const workspaces = useChartStore((s) => s.workspaces);
  const saveWorkspace = useChartStore((s) => s.saveWorkspace);
  const loadWorkspace = useChartStore((s) => s.loadWorkspace);
  const deleteWorkspace = useChartStore((s) => s.deleteWorkspace);
  const [name, setName] = useState("");

  function save() {
    const n = name.trim();
    if (!n) return;
    saveWorkspace(n);
    setName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <FolderOpen className="h-4 w-4" />
            Workspaces / Plantillas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 border-b border-tv-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-tv-text-muted">
            Guardar configuración actual
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre (ej: BTC scalping)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="bg-tv-bg"
            />
            <button
              onClick={save}
              disabled={!name.trim()}
              className="flex items-center gap-1 rounded bg-tv-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-tv-blue/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Guardar
            </button>
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {workspaces.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Sin workspaces guardados
            </div>
          )}
          {workspaces
            .slice()
            .reverse()
            .map((w) => (
              <div
                key={w.id}
                className="group flex items-center justify-between border-b border-tv-border px-4 py-2 text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-tv-text">{w.name}</span>
                  <span className="text-[10px] text-tv-text-muted">
                    {getInstrument(w.symbol).displayName} · {w.timeframe} ·{" "}
                    {w.layout} ·{" "}
                    {new Date(w.savedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      loadWorkspace(w.id);
                      onOpenChange(false);
                    }}
                    className="rounded bg-tv-panel-hover px-2 py-1 text-[10px] font-semibold text-tv-text hover:bg-tv-blue/20"
                  >
                    Cargar
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Borrar "${w.name}"?`))
                        deleteWorkspace(w.id);
                    }}
                    className="rounded p-1 text-tv-text-muted hover:text-tv-red"
                    aria-label="Borrar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
