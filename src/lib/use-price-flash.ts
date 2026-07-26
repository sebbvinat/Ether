"use client";

/**
 * §10 — devuelve la clase de destello que corresponde al último cambio de
 * precio: verde si subió, rojo si bajó, nada si no cambió.
 *
 * La clase se limpia sola a los 400ms (lo que dura la animación) para que un
 * cambio posterior vuelva a dispararla — sin eso, el mismo className quedaría
 * puesto y el navegador no re-ejecutaría el keyframe.
 */

import { useEffect, useRef, useState } from "react";

export function usePriceFlash(price: number | null | undefined): string {
  const [flash, setFlash] = useState<"" | "price-flash-up" | "price-flash-down">("");
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (price == null || !Number.isFinite(price)) return;
    const prev = prevRef.current;
    prevRef.current = price;
    if (prev === null || price === prev) return;
    setFlash(price > prev ? "price-flash-up" : "price-flash-down");
    const t = setTimeout(() => setFlash(""), 400);
    return () => clearTimeout(t);
  }, [price]);

  return flash;
}
