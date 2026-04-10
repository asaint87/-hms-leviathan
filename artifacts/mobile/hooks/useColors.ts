import { Colors } from "@/constants/Colors";

/**
 * Returns design tokens for the current theme. Currently HMS Leviathan
 * has a single dark theme — this hook is a thin shim over Colors.ts that
 * exposes shadcn-style semantic names (background/foreground/primary/etc.)
 * for the scaffold pages (+not-found, ErrorFallback) that were generated
 * with that convention.
 *
 * The game UI itself reads Colors directly. Don't add new consumers of
 * this hook — use Colors directly instead.
 */
export function useColors() {
  return {
    background: Colors.bg,
    foreground: Colors.text,
    primary: Colors.amber,
    primaryForeground: Colors.bg,
    card: Colors.bgCard2,
    border: Colors.border,
    mutedForeground: Colors.textDim,
    radius: 8,
  };
}
