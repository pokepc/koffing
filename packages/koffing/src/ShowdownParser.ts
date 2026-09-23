import { Pokemon, type PokemonStat, type PokemonStats } from "./Pokemon";
import { PokemonTeam } from "./PokemonTeam";
import { PokemonTeamSet } from "./PokemonTeamSet";

function clamp(value: string, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(Number(value))));
}

function parseName(line: string): Pokemon {
  const pokemon = new Pokemon();
  const itemIndex = line.indexOf("@");
  let title = (itemIndex < 0 ? line : line.slice(0, itemIndex)).trim();
  if (itemIndex >= 0) pokemon.item = line.slice(itemIndex + 1).trim() || undefined;
  const gender = /\s*\(([MF])\)$/iu.exec(title);
  if (gender) {
    pokemon.gender = gender[1]?.toUpperCase() === "M" ? "M" : "F";
    title = title.slice(0, gender.index).trim();
  }
  const nickname = /^(.*?)\s+\(([^()]+)\)$/u.exec(title);
  if (nickname) {
    pokemon.nickname = nickname[1]?.trim() || undefined;
    pokemon.name = nickname[2]?.trim();
  } else {
    pokemon.name = title || undefined;
  }
  return pokemon;
}

function parseDetail(line: string, pokemon: Pokemon): void {
  const move = /^[-~]\s*(.+)$/u.exec(line);
  if (move?.[1]) {
    if (pokemon.moves.length < 4) pokemon.moves.push(move[1].trim());
    return;
  }
  const nature = /^(.+?)\s+Nature$/iu.exec(line);
  if (nature?.[1]) {
    pokemon.nature = nature[1];
    return;
  }
  const field = /^([^:]+):\s*(.*)$/u.exec(line);
  if (!field?.[1] || field[2] === undefined) return;
  const key = field[1].toLowerCase();
  const value = field[2].trim();
  if (!value) return;
  switch (key) {
    case "ability":
    case "trait":
      pokemon.ability = value;
      break;
    case "pokeball":
    case "ball":
      pokemon.pokeball = value;
      break;
    case "tera type":
      pokemon.teraType = value;
      break;
    case "shiny":
    case "gigantamax":
      if (/^(yes|no)$/iu.test(value)) pokemon[key] = /^yes$/iu.test(value) || undefined;
      break;
    case "level":
    case "happiness":
    case "friendship":
    case "dynamax level": {
      if (!/^-?\d+(?:\.\d+)?$/u.test(value) || !Number.isFinite(Number(value))) break;
      if (key === "level") pokemon.level = clamp(value, 1, 100);
      else if (key === "dynamax level") pokemon.dynamaxLevel = clamp(value, 0, 10);
      else pokemon.happiness = clamp(value, 0, 255);
      break;
    }
    case "evs":
    case "ivs": {
      const values: PokemonStats = { ...pokemon[key] };
      for (const entry of value.split("/")) {
        const stat = /^(-?\d+)\s+(hp|atk|def|spa|spd|spe)$/iu.exec(entry.trim());
        if (stat?.[1] && stat[2] && Number.isFinite(Number(stat[1]))) {
          values[stat[2].toLowerCase() as PokemonStat] = clamp(
            stat[1],
            0,
            key === "evs" ? 255 : 31,
          );
        }
      }
      if (Object.keys(values).length) pokemon[key] = values;
      break;
    }
  }
}

/** Parses Showdown exports, retaining named teams and ignoring unsupported detail lines. */
export class ShowdownParser {
  code: string;

  constructor(code: string) {
    if (typeof code !== "string") throw new TypeError("Showdown input must be a string");
    this.code = code.trim();
  }

  parse(): PokemonTeamSet {
    const teams: PokemonTeam[] = [];
    let team: PokemonTeam | undefined;
    let pokemon: Pokemon | undefined;
    const flush = (): void => {
      if (!pokemon?.name) {
        pokemon = undefined;
        return;
      }
      if (!team) {
        team = new PokemonTeam();
        teams.push(team);
      }
      team.pokemon.push(pokemon);
      pokemon = undefined;
    };
    for (const rawLine of this.code.split(/\r?\n/u)) {
      const line = rawLine.trim();
      const header = /^===\s*\[([^\]]+)\]\s*(.*?)\s*===$/u.exec(line);
      if (header) {
        // Flush before changing teams, including exports without a blank separator.
        flush();
        const title = header[2] || "Untitled";
        const slash = title.indexOf("/");
        team = new PokemonTeam(
          header[1]?.trim(),
          slash < 0 ? title : title.slice(slash + 1).trim(),
          slash < 0 ? undefined : title.slice(0, slash).trim(),
        );
        teams.push(team);
      } else if (!line || /^[- ]+$/u.test(line)) {
        flush();
      } else if (!pokemon) {
        pokemon = parseName(line);
      } else {
        parseDetail(line, pokemon);
      }
    }
    flush();
    return new PokemonTeamSet(teams);
  }

  format(): this {
    this.code = this.parse().toShowdown();
    return this;
  }
  toString(): string {
    return this.code;
  }
}
