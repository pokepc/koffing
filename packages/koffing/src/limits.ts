import type { Diagnostic, Limits, Options } from "./types";

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxInputLength: 2_000_000,
  maxLineLength: 16_384,
  maxTeams: 1_000,
  maxPokemon: 10_000,
  maxMoves: 256,
  maxDiagnostics: 1_000,
});

export class KoffingError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message);
    this.name = "KoffingError";
    this.diagnostics = diagnostics;
  }
}

export function resolveLimits(options: Options = {}): Limits {
  if (options.mode !== undefined && options.mode !== "strict" && options.mode !== "permissive") {
    throw new TypeError("mode must be strict or permissive");
  }
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${key} must be a positive safe integer`);
  }
  return limits;
}

export function fail(code: string, message: string, line?: number): never {
  throw new KoffingError(message, [
    { code, message, severity: "error", ...(line === undefined ? {} : { line }) },
  ]);
}

export function checkInput(input: string, limits: Limits): void {
  if (typeof input !== "string") throw new TypeError("Input must be a string");
  if (input.length > limits.maxInputLength)
    fail("input-limit", `Input exceeds ${limits.maxInputLength} code units`);
}

export function finish(diagnostics: Diagnostic[], options: Options): void {
  if (options.mode === "strict" && diagnostics.length) {
    throw new KoffingError(diagnostics[0]!.message, diagnostics);
  }
}

export function report(diagnostics: Diagnostic[], diagnostic: Diagnostic, limits: Limits): void {
  if (diagnostics.length >= limits.maxDiagnostics)
    fail("diagnostic-limit", "Too many parsing issues", diagnostic.line);
  diagnostics.push(diagnostic);
}
