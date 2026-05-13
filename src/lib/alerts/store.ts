/**
 * Upstash Redis REST client (lightweight, edge-compatible).
 * Falls back to in-memory storage in dev if env vars are missing
 * (alerts only persist within a single server process).
 */
import type { Alert } from "./types";

const URL_ENV = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.UPSTASH_REDIS_REST_TOKEN;

const ALERTS_KEY = "ether:alerts:active";
const TRIGGERED_KEY = "ether:alerts:triggered";

const memStore = new Map<string, string>();

function hasUpstash() {
  return !!URL_ENV && !!TOKEN_ENV;
}

async function redis(command: string[]): Promise<unknown> {
  if (!hasUpstash()) {
    return runInMemory(command);
  }
  const res = await fetch(URL_ENV!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN_ENV!}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`upstash error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { result: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

function runInMemory(cmd: string[]): unknown {
  const [op, key, ...args] = cmd;
  if (op === "HSET") {
    const map = JSON.parse(memStore.get(key) ?? "{}");
    for (let i = 0; i < args.length; i += 2) {
      map[args[i]] = args[i + 1];
    }
    memStore.set(key, JSON.stringify(map));
    return args.length / 2;
  }
  if (op === "HGETALL") {
    const map = JSON.parse(memStore.get(key) ?? "{}");
    const flat: string[] = [];
    for (const k in map) {
      flat.push(k, map[k]);
    }
    return flat;
  }
  if (op === "HDEL") {
    const map = JSON.parse(memStore.get(key) ?? "{}");
    let n = 0;
    for (const f of args) {
      if (f in map) {
        delete map[f];
        n++;
      }
    }
    memStore.set(key, JSON.stringify(map));
    return n;
  }
  return null;
}

function flatToMap(flat: unknown): Record<string, string> {
  if (!Array.isArray(flat)) return {};
  const m: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) {
    m[String(flat[i])] = String(flat[i + 1]);
  }
  return m;
}

export async function listAlerts(): Promise<Alert[]> {
  const flat = await redis(["HGETALL", ALERTS_KEY]);
  const map = flatToMap(flat);
  return Object.values(map)
    .map((s) => {
      try {
        return JSON.parse(s) as Alert;
      } catch {
        return null;
      }
    })
    .filter((a): a is Alert => a !== null);
}

export async function saveAlert(alert: Alert): Promise<void> {
  await redis(["HSET", ALERTS_KEY, alert.id, JSON.stringify(alert)]);
}

export async function deleteAlert(id: string): Promise<void> {
  await redis(["HDEL", ALERTS_KEY, id]);
}

export async function markTriggered(alert: Alert): Promise<void> {
  await deleteAlert(alert.id);
  await redis([
    "HSET",
    TRIGGERED_KEY,
    alert.id,
    JSON.stringify({ ...alert, triggeredAt: Date.now() }),
  ]);
}

export { hasUpstash };
