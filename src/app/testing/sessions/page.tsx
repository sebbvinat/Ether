"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTestingStore } from "@/lib/store/testing-store";
import { SessionCard } from "@/components/testing/SessionCard";
import { NewSessionDialog } from "@/components/testing/NewSessionDialog";

export default function SessionsPage() {
  const sessions = useTestingStore((s) => s.sessions);
  const deleteSession = useTestingStore((s) => s.deleteSession);
  const duplicateSession = useTestingStore((s) => s.duplicateSession);
  const renameSession = useTestingStore((s) => s.renameSession);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = query
    ? sessions.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.symbol.toLowerCase().includes(query.toLowerCase()),
      )
    : sessions;

  function handleRename(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    const name = window.prompt("Nuevo nombre:", cur.name);
    if (name && name.trim()) renameSession(id, name.trim());
  }
  async function handleDuplicate(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    const newName = window.prompt("Nombre de la copia:", `${cur.name} (copia)`);
    if (!newName) return;
    await duplicateSession(id, newName.trim());
  }
  async function handleDelete(id: string) {
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    if (
      !window.confirm(
        `¿Borrar "${cur.name}"? Se perderán los trades y journal de esta sesión.`,
      )
    )
      return;
    await deleteSession(id);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-tv-text">Sesiones</h1>
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-tv-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-tv-blue/90"
        >
          <Plus className="h-4 w-4" />
          Nueva sesión
        </button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-tv-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o símbolo..."
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-tv-border p-8 text-center text-sm text-tv-text-muted">
          {sessions.length === 0
            ? "Aún no tenés sesiones. Creá la primera."
            : "Sin resultados para esa búsqueda."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              onPlay={() => router.push(`/testing/sessions/${s.id}/chart`)}
              onRename={() => handleRename(s.id)}
              onDuplicate={() => handleDuplicate(s.id)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </div>
      )}

      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => router.push(`/testing/sessions/${id}/chart`)}
      />
    </div>
  );
}
