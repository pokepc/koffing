import { checkInput, fail, finish, report, resolveLimits } from "./limits";
import type {
  Diagnostic,
  Limits,
  Options,
  ParseResult,
  PokemonSet,
  SanitizeOptions,
  Stats,
  Team,
} from "./types";

const strings = [
  "species",
  "name",
  "item",
  "ability",
  "nature",
  "pokeball",
  "hpType",
  "teraType",
] as const;
const numbers = ["level", "happiness", "dynamaxLevel"] as const;
const flags = ["shiny", "gigantamax"] as const;
const stats = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const setKeys = new Set<string>([
  ...strings,
  ...numbers,
  ...flags,
  "gender",
  "evs",
  "ivs",
  "moves",
]);

function object(value: unknown, path: string, limits: Limits): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    fail("invalid-json", `${path} must be a plain object`);
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (keys.length > limits.maxDiagnostics + 32)
    fail("property-limit", `${path} contains too many properties`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor))
      fail("invalid-json", `${path} contains an accessor or symbol`);
    if (key.length > Math.max(32, limits.maxLineLength))
      fail("property-limit", `${path} contains an oversized property name`);
    result[key] = descriptor.value;
  }
  return result;
}

function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail("invalid-json", `${path} must be an array`);
  if (value.length > maximum) fail("collection-limit", `${path} exceeds ${maximum} entries`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    keys.some(
      (key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)),
    )
  )
    fail("invalid-json", `${path} contains non-index properties or holes`);
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor))
      fail("invalid-json", `${path} must not contain holes or accessors`);
    result.push(descriptor.value);
  }
  return result;
}

function text(value: unknown, path: string, limits: Limits, budget: { used: number }): string {
  if (
    typeof value !== "string" ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value) ||
    value !== value.trim()
  ) {
    fail("invalid-text", `${path} must be trimmed text without control characters`);
  }
  if (value.length > limits.maxLineLength)
    fail("line-limit", `${path} exceeds ${limits.maxLineLength} code units`);
  budget.used += value.length + 32;
  if (budget.used > limits.maxInputLength)
    fail("input-limit", "Aggregate data exceeds configured input limit");
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail("invalid-number", `${path} must be finite`);
  return value;
}

function unknownKeys(
  source: Record<string, unknown>,
  known: ReadonlySet<string>,
  path: string,
  diagnostics: Diagnostic[],
  limits: Limits,
): void {
  for (const key of Object.keys(source)) {
    if (!known.has(key))
      report(
        diagnostics,
        {
          code: "unknown-field",
          severity: "warning",
          path: `${path}.${key}`,
          message: `Unknown field ${path}.${key}`,
        },
        limits,
      );
  }
}

function readSet(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  limits: Limits,
  budget: { used: number },
): PokemonSet {
  const source = object(value, path, limits);
  budget.used += 512;
  if (budget.used > limits.maxInputLength)
    fail("input-limit", "Aggregate data exceeds configured input limit");
  unknownKeys(source, setKeys, path, diagnostics, limits);
  const species = text(source.species, `${path}.species`, limits, budget);
  if (!species) fail("invalid-species", `${path}.species is required`);
  const result: PokemonSet = { species, moves: [] };
  for (const key of strings)
    if (key !== "species" && source[key] !== undefined)
      result[key] = text(source[key], `${path}.${key}`, limits, budget);
  for (const key of numbers)
    if (source[key] !== undefined) result[key] = finite(source[key], `${path}.${key}`);
  for (const key of flags) {
    if (source[key] !== undefined) {
      if (typeof source[key] !== "boolean")
        fail("invalid-boolean", `${path}.${key} must be boolean`);
      result[key] = source[key];
    }
  }
  if (source.gender !== undefined) {
    if (
      source.gender !== "M" &&
      source.gender !== "F" &&
      source.gender !== "N" &&
      source.gender !== ""
    )
      fail("invalid-gender", `${path}.gender must be M, F, N or empty`);
    result.gender = source.gender;
  }
  for (const key of ["evs", "ivs"] as const) {
    if (source[key] === undefined) continue;
    const entries = object(source[key], `${path}.${key}`, limits);
    unknownKeys(entries, new Set(stats), `${path}.${key}`, diagnostics, limits);
    const values: Stats = {};
    for (const stat of stats)
      if (entries[stat] !== undefined)
        values[stat] = finite(entries[stat], `${path}.${key}.${stat}`);
    result[key] = values;
  }
  result.moves = array(source.moves, `${path}.moves`, limits.maxMoves).map((move, index) => {
    const name = text(move, `${path}.moves[${index}]`, limits, budget);
    if (!name) fail("invalid-move", `${path}.moves[${index}] cannot be empty`);
    return name;
  });
  return result;
}

/** Decode and copy known data only. Shape errors are fatal; unknown fields are diagnosed. */
export function parseJSON(input: unknown, options: Options = {}): ParseResult {
  const limits = resolveLimits(options);
  let value: unknown = input;
  if (typeof value === "string") {
    checkInput(value, limits);
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      fail("invalid-json", "Invalid JSON syntax");
    }
  }
  const diagnostics: Diagnostic[] = [];
  const budget = { used: 0 };
  let rawTeams: unknown[];
  if (Array.isArray(value)) rawTeams = [{ pokemon: value }];
  else {
    const source = object(value, "input", limits);
    if (Object.hasOwn(source, "teams")) {
      unknownKeys(source, new Set(["teams"]), "input", diagnostics, limits);
      rawTeams = array(source.teams, "teams", limits.maxTeams);
    } else if (Object.hasOwn(source, "pokemon")) rawTeams = [source];
    else rawTeams = [{ pokemon: [source] }];
  }
  if (rawTeams.length > limits.maxTeams) fail("collection-limit", "Too many teams");
  let total = 0;
  const teams = rawTeams.map((raw, index): Team => {
    const path = `teams[${index}]`;
    const source = object(raw, path, limits);
    unknownKeys(
      source,
      new Set(["name", "format", "folder", "pokemon"]),
      path,
      diagnostics,
      limits,
    );
    const members = array(source.pokemon, `${path}.pokemon`, limits.maxPokemon - total);
    total += members.length;
    const team: Team = {
      pokemon: members.map((member, i) =>
        readSet(member, `${path}.pokemon[${i}]`, diagnostics, limits, budget),
      ),
    };
    for (const key of ["name", "format", "folder"] as const)
      if (source[key] !== undefined)
        team[key] = text(source[key], `${path}.${key}`, limits, budget);
    return team;
  });
  for (const [index, team] of teams.entries())
    checkRanges(team.pokemon, `teams[${index}].pokemon`, diagnostics, limits);
  finish(diagnostics, options);
  return { teams, diagnostics };
}

/** Generic traditional-format checks, not species or format legality validation. */
function checkRanges(
  pokemon: readonly PokemonSet[],
  path: string,
  diagnostics: Diagnostic[],
  limits: Limits,
): void {
  const add = (code: string, path: string, message: string): void =>
    report(diagnostics, { code, severity: "warning", path, message }, limits);
  for (const [i, set] of pokemon.entries()) {
    const prefix = `${path}[${i}]`;
    const range = (
      value: number | undefined,
      min: number,
      max: number,
      path: string,
      code = "number-range",
    ): void => {
      if (value !== undefined && (!Number.isInteger(value) || value < min || value > max))
        add(code, path, `Expected an integer from ${min} to ${max}; value preserved`);
    };
    range(set.level, 1, 100, `${prefix}.level`);
    range(set.happiness, 0, 255, `${prefix}.happiness`);
    range(set.dynamaxLevel, 0, 10, `${prefix}.dynamaxLevel`);
    for (const stat of stats) {
      range(set.evs?.[stat], 0, 255, `${prefix}.evs.${stat}`, "stat-range");
      range(set.ivs?.[stat], 0, 31, `${prefix}.ivs.${stat}`, "stat-range");
    }
    if (Object.values(set.evs ?? {}).reduce((sum, ev) => sum + ev, 0) > 510)
      add("ev-total", `${prefix}.evs`, "Traditional EV total exceeds 510");
    if (set.moves.length > 4)
      add("move-count", `${prefix}.moves`, "Traditional sets contain at most four moves");
  }
}

export function validateTeam(pokemon: readonly PokemonSet[], options: Options = {}): Diagnostic[] {
  return parseJSON(pokemon, options).diagnostics;
}

/** Explicit, deterministic traditional-range sanitization; never mutates its input. */
export function sanitizeTeam(
  pokemon: readonly PokemonSet[],
  options: SanitizeOptions = {},
): { pokemon: PokemonSet[]; diagnostics: Diagnostic[] } {
  const maxLevel = options.maxLevel ?? 100;
  const maxMoves = options.maxMovesPerPokemon ?? 4;
  if (
    !Number.isSafeInteger(maxLevel) ||
    maxLevel < 1 ||
    !Number.isSafeInteger(maxMoves) ||
    maxMoves < 0
  )
    throw new TypeError("Sanitization limits must be valid nonnegative integers (maxLevel >= 1)");
  const parsed = parseJSON(pokemon, { ...options, mode: "permissive" });
  const result = parsed.teams[0]!.pokemon;
  const diagnostics = parsed.diagnostics;
  const limits = resolveLimits(options);
  const changed = (path: string): void =>
    report(
      diagnostics,
      { code: "sanitized", severity: "warning", path, message: `Sanitized ${path}` },
      limits,
    );
  const clamp = (value: number, min: number, max: number, path: string): number => {
    const next = Math.max(min, Math.min(max, Math.trunc(value)));
    if (next !== value) changed(path);
    return next;
  };
  for (const [i, set] of result.entries()) {
    const path = `pokemon[${i}]`;
    if (set.level !== undefined) set.level = clamp(set.level, 1, maxLevel, `${path}.level`);
    if (set.happiness !== undefined)
      set.happiness = clamp(set.happiness, 0, 255, `${path}.happiness`);
    if (set.dynamaxLevel !== undefined)
      set.dynamaxLevel = clamp(set.dynamaxLevel, 0, 10, `${path}.dynamaxLevel`);
    let evBudget = 510;
    for (const stat of stats) {
      if (set.evs?.[stat] !== undefined) {
        set.evs[stat] = clamp(set.evs[stat], 0, Math.min(255, evBudget), `${path}.evs.${stat}`);
        evBudget -= set.evs[stat];
      }
      if (set.ivs?.[stat] !== undefined)
        set.ivs[stat] = clamp(set.ivs[stat], 0, 31, `${path}.ivs.${stat}`);
    }
    if (set.moves.length > maxMoves) {
      set.moves = set.moves.slice(0, maxMoves);
      changed(`${path}.moves`);
    }
  }
  finish(diagnostics, options);
  return { pokemon: result, diagnostics };
}
