import type { PokemonSet, Stats, Team } from "./types";

const stats = [
  ["hp", "HP"],
  ["atk", "Atk"],
  ["def", "Def"],
  ["spa", "SpA"],
  ["spd", "SpD"],
  ["spe", "Spe"],
] as const;

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
  let title = set.name ? `${set.name} (${set.species})` : set.species;
  if (set.gender === "M" || set.gender === "F") title += ` (${set.gender})`;
  if (set.item) title += ` @ ${set.item}`;
  let output = title;
  const append = (label: string, value: string | number | undefined): void => {
    if (value !== undefined && (typeof value !== "number" || Number.isFinite(value)))
      output += `\n${label}: ${value}`;
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
      if (value !== undefined && Number.isFinite(value)) {
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
    const hidden = /^Hidden Power ([a-z]+)$/iu.exec(move);
    output += `\n- ${hidden ? `Hidden Power [${hidden[1]}]` : move}`;
  }
  return output;
}

/** Format trusted typed sets, like Showdown. Use parseJSON separately for untrusted data. */
export function exportTeam(pokemon: readonly PokemonSet[]): string {
  return pokemon.map(serializeSet).join("\n\n");
}

/** Collection export always includes headers, preserving team boundaries. */
export function exportTeams(teams: readonly Team[]): string {
  return teams
    .map((team) => {
      const metadata = `${team.format ? `[${team.format}] ` : ""}${team.folder ? `${team.folder}/` : ""}${team.name ?? ""}`;
      const body = team.pokemon.map(serializeSet).join("\n\n");
      if (teams.length === 1 && !metadata && body) return body;
      return `=== ${metadata} ===${body ? `\n\n${body}` : ""}`;
    })
    .join("\n\n");
}
