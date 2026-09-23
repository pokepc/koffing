import { parseJSON } from "./data";
import { finish, KoffingError, report, resolveLimits } from "./limits";
import type { Diagnostic, Options, ParseResult } from "./types";
import species from "./lookups/species.json";
import moves from "./lookups/moves.json";
import items from "./lookups/items.json";
import abilities from "./lookups/abilities.json";
import natures from "./lookups/natures.json";
import pokeballs from "./lookups/pokeballs.json";
import types from "./lookups/types.json";

export interface ValidationResult {
  /** Passing these checks does not establish game or format legality. */
  valid: boolean;
  diagnostics: Diagnostic[];
}

const tables = {
  species: new Set<string>(species),
  moves: new Set<string>(moves),
  item: new Set<string>(items),
  ability: new Set<string>(abilities),
  nature: new Set<string>(natures),
  pokeball: new Set<string>(pokeballs),
  hpType: new Set<string>(types.filter((type) => !["normal", "fairy", "stellar"].includes(type))),
  teraType: new Set<string>(types),
};

/** Showdown identifier spelling: display names and IDs are equivalent, not aliases. */
const id = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Opt-in identifier and traditional team sanity checks on any parseJSON input shape.
 * Does not mutate input or infer missing values. Shape failures stop at the first error.
 * Resource-limit violations always throw; strict mode throws on any diagnostic.
 */
export function validate(input: unknown, options: Options = {}): ValidationResult {
  const limits = resolveLimits(options);
  let parsed: ParseResult;
  try {
    parsed = parseJSON(input, { ...options, mode: "permissive" });
  } catch (error) {
    if (
      !(error instanceof KoffingError) ||
      error.diagnostics.some((issue) => issue.code.endsWith("-limit"))
    )
      throw error;
    finish(error.diagnostics, options);
    return { valid: false, diagnostics: error.diagnostics };
  }
  const diagnostics: Diagnostic[] = parsed.diagnostics.map((issue) => ({
    ...issue,
    severity: "error",
  }));
  const add = (code: string, path: string, message: string): void => {
    report(diagnostics, { code, severity: "error", path, message }, limits);
  };
  if (parsed.teams.length === 0) add("team-count", "teams", "Expected at least one team");
  for (const [teamIndex, team] of parsed.teams.entries()) {
    const teamPath = `teams[${teamIndex}].pokemon`;
    if (team.pokemon.length < 1 || team.pokemon.length > 6)
      add("team-size", teamPath, "Traditional teams contain one to six Pokémon");
    for (const [setIndex, set] of team.pokemon.entries()) {
      const path = `${teamPath}[${setIndex}]`;
      for (const field of [
        "species",
        "item",
        "ability",
        "nature",
        "pokeball",
        "hpType",
        "teraType",
      ] as const) {
        const value = set[field];
        // Empty optional strings represent unspecified fields in Showdown sets.
        if (value && !tables[field].has(id(value)))
          add("unknown-identifier", `${path}.${field}`, `Unknown ${field} identifier: ${value}`);
      }
      if (set.moves.length === 0) add("move-count", `${path}.moves`, "Expected at least one move");
      const seen = new Set<string>();
      for (const [index, move] of set.moves.entries()) {
        const moveID = id(move);
        if (!tables.moves.has(moveID))
          add("unknown-identifier", `${path}.moves[${index}]`, `Unknown move identifier: ${move}`);
        // Hidden Power variants are one move, even when their type differs.
        const duplicateID =
          /^hiddenpower(?:bug|dark|dragon|electric|fighting|fire|flying|ghost|grass|ground|ice|poison|psychic|rock|steel|water)?$/.test(
            moveID,
          )
            ? "hiddenpower"
            : moveID;
        if (seen.has(duplicateID))
          add("duplicate-move", `${path}.moves[${index}]`, `Duplicate move: ${move}`);
        seen.add(duplicateID);
      }
    }
  }
  finish(diagnostics, options);
  return { valid: diagnostics.length === 0, diagnostics };
}
