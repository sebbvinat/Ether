/**
 * Wave 18.15 — cliente Supabase.
 *
 * Dos factories:
 *  - `getServerSupabase()`: usa SERVICE_KEY (bypass RLS). SOLO en API routes.
 *    Nunca importar en client components.
 *  - `getPublicSupabase()`: usa el ANON key para lecturas desde el cliente
 *    (opcional — hoy no lo usamos porque las lecturas van vía nuestra
 *    API route también). Queda listo si en el futuro queremos leer directo.
 *
 * Env vars requeridas:
 *  - SUPABASE_URL (público)
 *  - SUPABASE_SERVICE_KEY (secret — nunca commitear)
 *  - SUPABASE_ANON_KEY (público, opcional — solo si getPublicSupabase se usa)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (serverClient) return serverClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are required",
    );
  }
  serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

/** True si las creds de server están configuradas (para chequear en cron). */
export function serverSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}
