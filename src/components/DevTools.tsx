"use client";

import dynamic from "next/dynamic";

/**
 * Agentation (the design feedback overlay) is a local development tool only.
 * In production builds this whole branch is dropped, so the package is never
 * shipped to visitors.
 */
const Agentation =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((m) => m.Agentation), { ssr: false })
    : () => null;

export function DevTools() {
  return <Agentation />;
}
