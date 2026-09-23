import { checkInput, fail, finish, report, resolveLimits } from "./limits";
import type { Diagnostic, Options, ParseResult, PokemonSet, StatID, Stats, Team } from "./types";

const stats: Readonly<Record<string, StatID>> = {
  hp: "hp",
  atk: "atk",
  attack: "atk",
  def: "def",
  defense: "def",
  spa: "spa",
  spatk: "spa",
  specialattack: "spa",
  spd: "spd",
  spdef: "spd",
  specialdefense: "spd",
  spe: "spe",
  speed: "spe",
};
const numericFields = new Map<string, "level" | "happiness" | "dynamaxLevel">([
  ["level", "level"],
  ["happiness", "happiness"],
  ["friendship", "happiness"],
  ["dynamax level", "dynamaxLevel"],
]);
const stringFields = new Map<
  string,
  "ability" | "item" | "name" | "species" | "teraType" | "hpType" | "pokeball"
>([
  ["ability", "ability"],
  ["trait", "ability"],
  ["item", "item"],
  ["nickname", "name"],
  ["species", "species"],
  ["tera type", "teraType"],
  ["hidden power", "hpType"],
  ["pokeball", "pokeball"],
  ["ball", "pokeball"],
]);
const natureStats: StatID[] = ["atk", "def", "spe", "spa", "spd"];
const natures: string[][] = [
  ["Hardy", "Lonely", "Brave", "Adamant", "Naughty"],
  ["Bold", "Docile", "Relaxed", "Impish", "Lax"],
  ["Timid", "Hasty", "Serious", "Jolly", "Naive"],
  ["Modest", "Mild", "Quiet", "Bashful", "Rash"],
  ["Calm", "Gentle", "Sassy", "Careful", "Quirky"],
];

/** Parse Showdown text without silently clamping values or dropping extra moves. */
export function parse(input: string, options: Options = {}): ParseResult {
  const limits = resolveLimits(options);
  checkInput(input, limits);
  const teams: Team[] = [];
  const diagnostics: Diagnostic[] = [];
  let team: Team | undefined;
  let pokemon: PokemonSet | undefined;
  let count = 0;
  let seen = new Set<string>();
  let explicitHpType = false;
  let explicitHappiness = false;
  let explicitNature = false;
  let increased: StatID | undefined;
  let decreased: StatID | undefined;
  let lineNumber = 0;
  const warn = (code: string, message: string): void => {
    report(diagnostics, { code, message, severity: "warning", line: lineNumber }, limits);
  };
  const duplicate = (key: string): void => {
    if (seen.has(key)) warn("duplicate-field", `Repeated ${key}; the last value takes precedence`);
    seen.add(key);
  };
  const addTeam = (value: Team): void => {
    if (teams.length >= limits.maxTeams) fail("team-limit", "Too many teams", lineNumber);
    teams.push(value);
    team = value;
  };
  const move = (value: string): void => {
    if (!pokemon) return;
    if (!value) {
      warn("invalid-move", "Move name is empty");
      return;
    }
    if (pokemon.moves.length >= limits.maxMoves) fail("move-limit", "Too many moves", lineNumber);
    const hidden = /^Hidden Power\s*\[([^\]]+)\]$/i.exec(value);
    if (hidden) {
      value = `Hidden Power ${hidden[1]!.trim()}`;
      if (!explicitHpType) pokemon.hpType = hidden[1]!.trim();
    }
    pokemon.moves.push(value);
    if (pokemon.moves.length === 5)
      warn("move-count", "More than four moves; all moves were preserved");
    if (/^Frustration$/i.test(value) && !explicitHappiness) pokemon.happiness = 0;
  };
  // Scan lines directly so the input-size limit also bounds temporary allocation.
  for (let start = 0; start <= input.length;) {
    let end = start;
    while (end < input.length && input[end] !== "\n" && input[end] !== "\r") end++;
    lineNumber++;
    if (end - start > limits.maxLineLength) fail("line-limit", "Line is too long", lineNumber);
    const rawLine = input.slice(start, end);
    const line = rawLine.replace(/\t/g, " ").trim();
    const separator = input[end];
    start = end + (separator === "\r" && input[end + 1] === "\n" ? 2 : 1);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]/.test(rawLine) || line.includes("\t")) {
      warn("invalid-character", "Control characters are not allowed");
      continue;
    }
    if (!line || /^-{3,}$/.test(line)) {
      pokemon = undefined;
      continue;
    }
    if (line.includes("|"))
      fail(
        "unsupported-packed-format",
        "Packed teams are not supported; import Showdown text instead",
        lineNumber,
      );
    const header = /^===\s*(.*?)\s*===$/.exec(line);
    if (header) {
      const value: Team = { pokemon: [] };
      let title = header[1]!.trim();
      const format = /^\[([^\]]+)\]\s*/.exec(title);
      if (format) {
        value.format = format[1]!.trim();
        title = title.slice(format[0].length);
      }
      const slash = title.lastIndexOf("/");
      if (slash >= 0) {
        value.folder = title.slice(0, slash).trim();
        title = title.slice(slash + 1).trim();
      }
      if (title) value.name = title;
      addTeam(value);
      pokemon = undefined;
      continue;
    }
    if (line.startsWith("===")) {
      warn("invalid-header", "Malformed team header");
      pokemon = undefined;
      continue;
    }
    const detail = /^([^:]+):\s*(.*)$/.exec(line);
    const nature = detail || line.includes("@") ? null : /^(.*?)\s+Nature$/i.exec(line);
    const bare = /^(Shiny|Gigantamax)$/i.exec(line);
    if (!pokemon) {
      const typeNullHeader =
        /^(?:[^:]*\()?Type: Null\)?(?:\s+\([MFN]\))?(?:\s+\[[^\]]+\])?(?:\s+@\s+.+)?$/i.test(line);
      if (line.startsWith("-") || (detail && !typeNullHeader) || nature || bare) {
        warn("orphan-detail", "Pokémon detail appears before a Pokémon header");
        continue;
      }
      let identity = line;
      let item: string | undefined;
      const at = identity.lastIndexOf(" @ ");
      if (at >= 0) {
        item = identity.slice(at + 3).trim();
        identity = identity.slice(0, at).trim();
      }
      let ability: string | undefined;
      const bracket = /\s*\[([^\]]+)\]$/.exec(identity);
      if (bracket) {
        ability = bracket[1]!.trim();
        identity = identity.slice(0, bracket.index).trim();
      }
      let gender: "M" | "F" | "N" | undefined;
      const sex = /\s*\(([MFN])\)$/.exec(identity);
      if (sex) {
        gender = sex[1] as "M" | "F" | "N";
        identity = identity.slice(0, sex.index).trim();
      }
      const named = /^(.*?)\s*\(([^()]+)\)$/.exec(identity);
      const species = (named ? named[2]! : identity).trim();
      if (!species || /[\[\]@()=]/.test(species)) {
        warn("invalid-header", "Malformed Pokémon header");
        continue;
      }
      if (count >= limits.maxPokemon) fail("pokemon-limit", "Too many Pokémon", lineNumber);
      count++;
      pokemon = { species, moves: [] };
      if (named?.[1]?.trim()) pokemon.name = named[1].trim();
      if (item && !/^No Item$/i.test(item)) pokemon.item = item;
      if (ability) pokemon.ability = ability;
      if (gender) pokemon.gender = gender;
      if (!team) addTeam({ pokemon: [] });
      team!.pokemon.push(pokemon);
      seen = new Set(Object.keys(pokemon).filter((key) => key !== "moves"));
      explicitHpType = false;
      explicitHappiness = false;
      explicitNature = false;
      increased = undefined;
      decreased = undefined;
      continue;
    }
    const bracketDetail = /^\[([^\]]+)\](?:\s*@\s*(.+))?$/.exec(line);
    if (bracketDetail) {
      duplicate("ability");
      pokemon.ability = bracketDetail[1]!.trim();
      if (bracketDetail[2]) {
        duplicate("item");
        if (/^No Item$/i.test(bracketDetail[2])) delete pokemon.item;
        else pokemon.item = bracketDetail[2].trim();
      }
      continue;
    }
    if (/^[-~]\s*/.test(line)) {
      move(line.replace(/^[-~]\s*/, ""));
      continue;
    }
    if (nature) {
      duplicate("nature");
      pokemon.nature = nature[1]!.trim();
      explicitNature = true;
      continue;
    }
    const key = (detail?.[1] ?? bare?.[1] ?? "").trim().toLowerCase();
    const value = detail?.[2]?.trim() ?? "Yes";
    if (key === "move") {
      move(value);
      continue;
    }
    if (key === "evs" || key === "ivs") {
      duplicate(key);
      const values: Stats = {};
      let conflictingModifiers = false;
      if (key === "evs") {
        increased = undefined;
        decreased = undefined;
        if (!explicitNature) delete pokemon.nature;
      }
      for (const entry of value.split("/")) {
        const match =
          /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([+-]?)\s+([a-z .]+)\s*$/i.exec(entry);
        const statName = match?.[3]!.toLowerCase().replace(/[ .]/g, "");
        const stat = statName && Object.hasOwn(stats, statName) ? stats[statName] : undefined;
        if (!match || !stat || !Number.isFinite(Number(match[1]))) {
          warn("invalid-stat", `Invalid ${key} entry: ${entry.trim()}`);
          continue;
        }
        if (values[stat] !== undefined)
          warn("duplicate-stat", `Repeated ${stat}; the last value takes precedence`);
        values[stat] = Number(match[1]);
        const max = key === "ivs" ? 31 : 255;
        if (!Number.isInteger(values[stat]) || values[stat]! < 0 || values[stat]! > max)
          warn("stat-range", `${stat} is outside the traditional ${key} range; value preserved`);
        if (match[2]) {
          if (key !== "evs" || stat === "hp")
            warn("invalid-nature-modifier", "Nature modifiers apply only to non-HP EVs");
          else if (match[2] === "+") {
            if (increased) {
              conflictingModifiers = true;
              warn("invalid-nature-modifier", "More than one increased stat");
            }
            increased = stat;
          } else {
            if (decreased) {
              conflictingModifiers = true;
              warn("invalid-nature-modifier", "More than one decreased stat");
            }
            decreased = stat;
          }
        }
      }
      pokemon[key] = values;
      if (key === "evs" && Object.values(values).reduce((sum, number) => sum + number, 0) > 510)
        warn("ev-total", "EV total exceeds 510; values preserved");
      if (key === "evs" && increased && increased === decreased) {
        conflictingModifiers = true;
        warn("invalid-nature-modifier", "The same stat cannot be increased and decreased");
      }
      if (key === "evs" && !explicitNature && !conflictingModifiers && increased && decreased)
        pokemon.nature = natures[natureStats.indexOf(increased)]![natureStats.indexOf(decreased)]!;
      continue;
    }
    const numberKey = numericFields.get(key);
    if (numberKey) {
      duplicate(numberKey);
      const number = Number(value);
      if (!value || !Number.isFinite(number)) {
        warn("invalid-number", `Invalid ${key}`);
        continue;
      }
      pokemon[numberKey] = number;
      if (numberKey === "happiness") explicitHappiness = true;
      const min = numberKey === "level" ? 1 : 0;
      const max = numberKey === "level" ? 100 : numberKey === "happiness" ? 255 : 10;
      if (!Number.isInteger(number) || number < min || number > max)
        warn("number-range", `${key} is outside its traditional range; value preserved`);
      continue;
    }
    if (key === "shiny" || key === "gigantamax") {
      duplicate(key);
      if (!/^(yes|no|true|false)$/i.test(value)) warn("invalid-boolean", `Invalid ${key}`);
      else pokemon[key] = /^(yes|true)$/i.test(value);
      continue;
    }
    if (key === "gender") {
      duplicate("gender");
      if (value === "M" || value === "F" || value === "N" || value === "") pokemon.gender = value;
      else warn("invalid-gender", "Gender must be M, F, N or empty");
      continue;
    }
    const stringKey = stringFields.get(key);
    if (stringKey) {
      duplicate(stringKey);
      if (!value) {
        warn("empty-field", `Empty ${key}`);
        continue;
      }
      if (stringKey === "item" && /^No Item$/i.test(value)) delete pokemon.item;
      else pokemon[stringKey] = value;
      if (stringKey === "hpType") explicitHpType = true;
      continue;
    }
    warn("unknown-line", `Unrecognized line: ${line}`);
  }
  finish(diagnostics, options);
  return { teams, diagnostics };
}
