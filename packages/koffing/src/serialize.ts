import { parseJSON } from "./data";
import { checkInput, fail, resolveLimits } from "./limits";
import type { Options, PokemonSet, Stats, Team } from "./types";

const stats = [
  ["hp", "HP"],
  ["atk", "Atk"],
  ["def", "Def"],
  ["spa", "SpA"],
  ["spd", "SpD"],
  ["spe", "Spe"],
] as const;

function representable(value: string | undefined, forbidden: RegExp, path: string): void {
  if (value !== undefined && forbidden.test(value))
    fail("unrepresentable-text", `${path} contains ambiguous Showdown delimiters`);
}

// Stat syntax does not accept exponent notation, although finite JS numbers do.
function decimal(value: number): string {
  const source = String(value);
  if (!/[eE]/u.test(source)) return source;
  const [mantissa, exponentText] = source.split(/[eE]/u);
  const negative = mantissa!.startsWith("-");
  const unsigned = negative ? mantissa!.slice(1) : mantissa!;
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole! + fraction;
  const point = whole!.length + Number(exponentText);
  const expanded =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? `${digits}${"0".repeat(point - digits.length)}`
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${negative ? "-" : ""}${expanded}`;
}

function serializeSet(set: PokemonSet): string {
  for (const key of [
    "species",
    "name",
    "item",
    "ability",
    "nature",
    "pokeball",
    "hpType",
    "teraType",
    "gender",
  ] as const) {
    const value = set[key];
    if (typeof value === "string") {
      representable(value, /\|/u, key);
      if (value === "" && key !== "gender" && key !== "name" && key !== "item")
        fail("unrepresentable-text", `${key} cannot be exported as empty text`);
    }
  }
  representable(set.species, /[@()|\[\]=]/u, "species");
  representable(set.name, /[@()|\[\]=]/u, "name");
  representable(set.item, /[@:]/u, "item");
  representable(set.nature, /[:@]|^[-~]/u, "nature");
  if (set.item && /^No Item$/iu.test(set.item))
    fail("unrepresentable-text", "No Item is reserved for an absent item");
  if (set.species.includes(":") && set.species !== "Type: Null")
    fail("unrepresentable-text", "species contains an ambiguous colon");
  representable(set.name, /:/u, "name");
  for (const value of [set.species, set.name]) {
    if (
      value &&
      (/^[-~]/u.test(value) || /\sNature$/iu.test(value) || /^(Shiny|Gigantamax)$/iu.test(value))
    )
      fail("unrepresentable-text", "Identity is ambiguous with a Showdown detail");
  }
  if (/^[-~]/u.test(set.species))
    fail("unrepresentable-text", "species cannot start with a move marker");
  let title = set.name ? `${set.name} (${set.species})` : set.species;
  if (set.gender === "M" || set.gender === "F") title += ` (${set.gender})`;
  if (set.item) title += ` @ ${set.item}`;
  let output = title;
  const append = (label: string, value: string | number | undefined): void => {
    if (value !== undefined) output += `\n${label}: ${value}`;
  };
  append("Ability", set.ability);
  append("Level", set.level);
  if (set.gender === "N" || set.gender === "") append("Gender", set.gender);
  if (set.shiny !== undefined) append("Shiny", set.shiny ? "Yes" : "No");
  append("Happiness", set.happiness);
  append("Pokeball", set.pokeball);
  append("Hidden Power", set.hpType);
  append("Dynamax Level", set.dynamaxLevel);
  if (set.gigantamax !== undefined) append("Gigantamax", set.gigantamax ? "Yes" : "No");
  append("Tera Type", set.teraType);
  const appendStats = (label: string, values: Stats | undefined): void => {
    if (values === undefined) return;
    let entries = "";
    for (const [key, name] of stats) {
      const value = values[key];
      if (value !== undefined) {
        if (entries) entries += " / ";
        entries += `${decimal(value)} ${name}`;
      }
    }
    if (entries) append(label, entries);
  };
  appendStats("EVs", set.evs);
  if (set.nature) output += `\n${set.nature} Nature`;
  appendStats("IVs", set.ivs);
  for (const move of set.moves) {
    representable(move, /\|/u, "move");
    const hidden = /^Hidden Power ([a-z]+)$/iu.exec(move);
    output += `\n- ${hidden ? `Hidden Power [${hidden[1]}]` : move}`;
  }
  return output;
}

function checkedOutput(output: string, options: Options): string {
  const limits = resolveLimits(options);
  checkInput(output, limits);
  for (let start = 0; start < output.length;) {
    const newline = output.indexOf("\n", start);
    const end = newline < 0 ? output.length : newline;
    if (end - start > limits.maxLineLength)
      fail("line-limit", "Serialized line exceeds configured limit");
    start = end + 1;
  }
  return output;
}

/** Validate again at the boundary, including plain objects changed after parsing. */
export function exportTeam(pokemon: readonly PokemonSet[], options: Options = {}): string {
  const result = parseJSON(pokemon, options);
  if (result.diagnostics.some((diagnostic) => diagnostic.code === "unknown-field"))
    fail("unknown-field", "Cannot serialize unknown fields without data loss");
  return checkedOutput(result.teams[0]!.pokemon.map(serializeSet).join("\n\n"), options);
}

/** Collection export always includes headers, preserving team boundaries. */
export function exportTeams(teams: readonly Team[], options: Options = {}): string {
  const result = parseJSON({ teams }, options);
  if (result.diagnostics.some((diagnostic) => diagnostic.code === "unknown-field"))
    fail("unknown-field", "Cannot serialize unknown fields without data loss");
  const output = result.teams
    .map((team) => {
      representable(team.name, /[\[\]=/|]/u, "team.name");
      representable(team.format, /[\[\]=/|]/u, "team.format");
      representable(team.folder, /[\[\]=|]/u, "team.folder");
      const metadata = `${team.format ? `[${team.format}] ` : ""}${team.folder ? `${team.folder}/` : ""}${team.name ?? ""}`;
      const body = team.pokemon.map(serializeSet).join("\n\n");
      if (result.teams.length === 1 && !metadata && body) return body;
      return `=== ${metadata} ===${body ? `\n\n${body}` : ""}`;
    })
    .join("\n\n");
  return checkedOutput(output, options);
}
