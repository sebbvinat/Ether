"use client";

/**
 * G3 — el lado React del lock de sesión (ver `session-lock.ts` para el porqué).
 *
 * Devuelve `status`:
 *   - "checking": todavía esperando respuesta, no escribir nada.
 *   - "owner": esta pestaña manda.
 *   - "taken": la tiene otra; hay que ofrecer tomar el control.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHANNEL_NAME,
  CLAIM_TIMEOUT_MS,
  REPROBE_MS,
  lockSupported,
  newClaim,
  shouldYieldTo,
  type ClaimId,
  type LockMessage,
} from "./session-lock";

export type LockStatus = "checking" | "owner" | "taken";

export function useSessionLock(sessionId: string | undefined): {
  status: LockStatus;
  /** Fuerza el control para esta pestaña: la otra pasa a "taken". */
  takeOver: () => void;
} {
  const [status, setStatus] = useState<LockStatus>("checking");
  const chanRef = useRef<BroadcastChannel | null>(null);
  const claimRef = useRef<ClaimId | null>(null);
  const statusRef = useRef<LockStatus>("checking");
  statusRef.current = status;

  useEffect(() => {
    if (!sessionId) return;
    if (!lockSupported()) {
      // Sin BroadcastChannel no hay guard posible; mejor dejar trabajar que
      // bloquear una sesión por una API que falta.
      setStatus("owner");
      return;
    }

    const chan = new BroadcastChannel(CHANNEL_NAME);
    chanRef.current = chan;
    const mine = newClaim(Date.now());
    claimRef.current = mine;
    setStatus("checking");

    const onMessage = (e: MessageEvent<LockMessage>) => {
      const msg = e.data;
      if (!msg || msg.sessionId !== sessionId) return;
      const current = claimRef.current;
      if (!current || msg.claim.tabId === current.tabId) return;

      if (msg.type === "held") {
        setStatus("taken");
        return;
      }
      if (msg.type === "claim") {
        // Alguien más quiere la sesión. Si le gano, se lo hago saber; si no,
        // le cedo. Las dos pestañas miran el mismo par y llegan a la misma
        // conclusión, así que no puede pasar que las dos cedan.
        if (shouldYieldTo(current, msg.claim)) {
          setStatus("taken");
        } else if (statusRef.current !== "taken") {
          chan.postMessage({ type: "held", sessionId, claim: current } satisfies LockMessage);
        }
        return;
      }
      if (msg.type === "release" && statusRef.current === "taken") {
        // La dueña se fue: reclamar de nuevo.
        const fresh = newClaim(Date.now());
        claimRef.current = fresh;
        setStatus("checking");
        chan.postMessage({ type: "claim", sessionId, claim: fresh } satisfies LockMessage);
        setTimeout(() => {
          if (statusRef.current === "checking") setStatus("owner");
        }, CLAIM_TIMEOUT_MS);
      }
    };

    chan.addEventListener("message", onMessage);
    chan.postMessage({ type: "claim", sessionId, claim: mine } satisfies LockMessage);
    const timer = setTimeout(() => {
      // Nadie contestó: la sesión es nuestra.
      if (statusRef.current === "checking") setStatus("owner");
    }, CLAIM_TIMEOUT_MS);

    // Cerrar una pestaña no garantiza que el `release` llegue: el navegador
    // puede desmantelarla antes de entregarlo. Por eso la pestaña bloqueada no
    // se queda esperando ese mensaje — vuelve a preguntar cada tanto y se
    // queda con la sesión cuando ya no contesta nadie.
    const reprobe = setInterval(() => {
      if (statusRef.current !== "taken") return;
      const fresh = newClaim(Date.now());
      claimRef.current = fresh;
      setStatus("checking");
      chan.postMessage({ type: "claim", sessionId, claim: fresh } satisfies LockMessage);
      setTimeout(() => {
        if (statusRef.current === "checking") setStatus("owner");
      }, CLAIM_TIMEOUT_MS);
    }, REPROBE_MS);

    const release = () => {
      const c = claimRef.current;
      if (c && statusRef.current === "owner") {
        chan.postMessage({ type: "release", sessionId, claim: c } satisfies LockMessage);
      }
    };
    // `pagehide` cubre el cierre y también el bfcache, donde `unload` no corre.
    window.addEventListener("pagehide", release);

    return () => {
      clearTimeout(timer);
      clearInterval(reprobe);
      release();
      window.removeEventListener("pagehide", release);
      chan.removeEventListener("message", onMessage);
      chan.close();
      chanRef.current = null;
      claimRef.current = null;
    };
  }, [sessionId]);

  const takeOver = useCallback(() => {
    const chan = chanRef.current;
    if (!chan || !sessionId) return;
    // Un claim con `at` de ahora pierde contra los viejos, así que para
    // ganarle a la dueña actual hay que reclamar desde el principio del tiempo.
    const forced: ClaimId = { ...newClaim(0), at: 0 };
    claimRef.current = forced;
    setStatus("owner");
    chan.postMessage({ type: "claim", sessionId, claim: forced } satisfies LockMessage);
  }, [sessionId]);

  return { status, takeOver };
}
