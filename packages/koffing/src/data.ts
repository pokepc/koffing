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
const statKeys = new Set<string>(stats);
const teamKeys = new Set(["name", "format", "folder", "pokemon"]);
const collectionKeys = new Set(["teams"]);
const setKeys = new Set<string>([
  ...strings,
  ...numbers,
  ...flags,
  "gender",
  "evs",
  "ivs",
  "sps",
  "moves",
]);

function objectKeys(value: unknown, path: string, limits: Limits): (string | symbol)[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    fail("invalid-json", `${path} must be a plain object`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > limits.maxDiagnostics + 32)
    fail("property-limit", `${path} contains too many properties`);
  return keys;
}

function property(value: object, key: string | symbol, path: string, limits: Limits): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
  if (typeof key !== "string" || !("value" in descriptor))
    fail("invalid-json", `${path} contains an accessor or symbol`);
  if (key.length > Math.max(32, limits.maxLineLength))
    fail("property-limit", `${path} contains an oversized property name`);
  return descriptor.value;
}

function object(value: unknown, path: string, limits: Limits): Record<string, unknown> {
  const keys = objectKeys(value, path, limits);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    result[key as string] = property(value as object, key, path, limits);
  }
  return result;
}

function array(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail("invalid-json", `${path} must be an array`);
  if (value.length > maximum) fail("collection-limit", `${path} exceeds ${maximum} entries`);
  const keys = Reflect.ownKeys(value);
  // Every index is checked below. Exactly length + 1 own keys then leaves room
  // only for those indices and the mandatory length property.
  if (keys.length !== value.length + 1)
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
  const keys = objectKeys(value, path, limits);
  budget.used += 512;
  if (budget.used > limits.maxInputLength)
    fail("input-limit", "Aggregate data exceeds configured input limit");
  const result: PokemonSet = { species: "", moves: [] };
  let hasMoves = false;
  // Validate each own descriptor and copy directly into the final whitelist shape.
  // Never read through the source, invoke a getter, or trust an earlier parse.
  for (const rawKey of keys) {
    const entry = property(value as object, rawKey, path, limits);
    const key = rawKey as keyof PokemonSet;
    if (!setKeys.has(key)) {
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
      continue;
    }
    if (entry === undefined && key !== "species" && key !== "moves") continue;
    switch (key) {
      case "species":
      case "name":
      case "item":
      case "ability":
      case "nature":
      case "pokeball":
      case "hpType":
      case "teraType":
        result[key] = text(entry, `${path}.${key}`, limits, budget);
        break;
      case "level":
      case "happiness":
      case "dynamaxLevel":
        result[key] = finite(entry, `${path}.${key}`);
        break;
      case "shiny":
      case "gigantamax":
        if (typeof entry !== "boolean") fail("invalid-boolean", `${path}.${key} must be boolean`);
        result[key] = entry;
        break;
      case "gender":
        if (entry !== "M" && entry !== "F" && entry !== "N" && entry !== "")
          fail("invalid-gender", `${path}.gender must be M, F, N or empty`);
        result.gender = entry;
        break;
      case "evs":
      case "ivs":
      case "sps": {
        const statPath = `${path}.${key}`;
        const values: Stats = {};
        for (const rawStat of objectKeys(entry, statPath, limits)) {
          const number = property(entry as object, rawStat, statPath, limits);
          const stat = rawStat as keyof Stats;
          if (!statKeys.has(stat)) {
            report(
              diagnostics,
              {
                code: "unknown-field",
                severity: "warning",
                path: `${statPath}.${stat}`,
                message: `Unknown field ${statPath}.${stat}`,
              },
              limits,
            );
          } else if (number !== undefined) {
            values[stat] = finite(number, `${statPath}.${stat}`);
          }
        }
        result[key] = values;
        break;
      }
      case "moves": {
        hasMoves = true;
        const moves = array(entry, `${path}.moves`, limits.maxMoves);
        for (let index = 0; index < moves.length; index++) {
          const name = text(moves[index], `${path}.moves[${index}]`, limits, budget);
          if (!name) fail("invalid-move", `${path}.moves[${index}] cannot be empty`);
        }
        result.moves = moves as string[];
        break;
      }
    }
  }
  if (!result.species) fail("invalid-species", `${path}.species is required`);
  if (!hasMoves) fail("invalid-json", `${path}.moves must be an array`);
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
      unknownKeys(source, collectionKeys, "input", diagnostics, limits);
      rawTeams = array(source.teams, "teams", limits.maxTeams);
    } else if (Object.hasOwn(source, "pokemon")) rawTeams = [source];
    else rawTeams = [{ pokemon: [source] }];
  }
  if (rawTeams.length > limits.maxTeams) fail("collection-limit", "Too many teams");
  let total = 0;
  const teams = rawTeams.map((raw, index): Team => {
    const path = `teams[${index}]`;
    const source = object(raw, path, limits);
    unknownKeys(source, teamKeys, path, diagnostics, limits);
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
      field: string,
      code = "number-range",
    ): void => {
      if (value !== undefined && (!Number.isInteger(value) || value < min || value > max))
        add(
          code,
          `${prefix}.${field}`,
          `Expected an integer from ${min} to ${max}; value preserved`,
        );
    };
    range(set.level, 1, 100, "level");
    range(set.happiness, 0, 255, "happiness");
    range(set.dynamaxLevel, 0, 10, "dynamaxLevel");
    let evTotal = 0;
    let spTotal = 0;
    for (const stat of stats) {
      const ev = set.evs?.[stat];
      const iv = set.ivs?.[stat];
      const sp = set.sps?.[stat];
      if (ev !== undefined) {
        evTotal += ev;
        range(ev, 0, 255, `evs.${stat}`, "stat-range");
      }
      if (iv !== undefined) range(iv, 0, 31, `ivs.${stat}`, "stat-range");
      if (sp !== undefined) {
        spTotal += sp;
        range(sp, 0, 32, `sps.${stat}`, "stat-range");
      }
    }
    if (evTotal > 510) add("ev-total", `${prefix}.evs`, "Traditional EV total exceeds 510");
    if (spTotal > 66) add("sp-total", `${prefix}.sps`, "Stat point total exceeds 66");
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
    let spBudget = 66;
    for (const stat of stats) {
      if (set.evs?.[stat] !== undefined) {
        set.evs[stat] = clamp(set.evs[stat], 0, Math.min(255, evBudget), `${path}.evs.${stat}`);
        evBudget -= set.evs[stat];
      }
      if (set.sps?.[stat] !== undefined) {
        set.sps[stat] = clamp(set.sps[stat], 0, Math.min(32, spBudget), `${path}.sps.${stat}`);
        spBudget -= set.sps[stat];
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
