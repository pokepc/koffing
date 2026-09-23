import { flag, list, number, record, text } from "./validation";

export type PokemonGender = "M" | "F";
export type PokemonStat = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type PokemonStats = Partial<Record<PokemonStat, number>>;

const stats: readonly [PokemonStat, string][] = [
  ["hp", "HP"],
  ["atk", "Atk"],
  ["def", "Def"],
  ["spa", "SpA"],
  ["spd", "SpD"],
  ["spe", "Spe"],
];

function readStats(value: unknown, label: string, maximum: number): PokemonStats | undefined {
  if (value === undefined) return undefined;
  const source = record(value, label);
  const result: PokemonStats = {};
  for (const [key] of stats) {
    const stat = number(source[key], `${label}.${key}`, 0, maximum);
    if (stat !== undefined) result[key] = stat;
  }
  return Object.keys(result).length ? result : undefined;
}

/** A single Pokémon set. Missing values remain absent in JSON and Showdown output. */
export class Pokemon {
  name?: string;
  nickname?: string;
  gender?: PokemonGender;
  item?: string;
  pokeball?: string;
  ability?: string;
  level?: number;
  shiny?: boolean;
  happiness?: number;
  nature?: string;
  evs?: PokemonStats;
  ivs?: PokemonStats;
  dynamaxLevel?: number;
  gigantamax?: boolean;
  teraType?: string;
  moves: string[] = [];

  static fromObject(value: unknown): Pokemon {
    const source = record(value, "Pokemon");
    const pokemon = new Pokemon();
    for (const key of [
      "name",
      "nickname",
      "item",
      "pokeball",
      "ability",
      "nature",
      "teraType",
    ] as const) {
      const field = text(source[key], `Pokemon.${key}`);
      if (field !== undefined) pokemon[key] = field;
    }
    if (!pokemon.name) throw new TypeError("Pokemon.name is required");
    if (source.gender !== undefined) {
      const gender = text(source.gender, "Pokemon.gender")?.toUpperCase();
      if (gender !== "M" && gender !== "F") throw new TypeError("Pokemon.gender must be M or F");
      pokemon.gender = gender;
    }
    pokemon.level = number(source.level, "Pokemon.level", 1, 100);
    pokemon.happiness = number(source.happiness, "Pokemon.happiness", 0, 255);
    pokemon.dynamaxLevel = number(source.dynamaxLevel, "Pokemon.dynamaxLevel", 0, 10);
    pokemon.shiny = flag(source.shiny, "Pokemon.shiny");
    pokemon.gigantamax = flag(source.gigantamax, "Pokemon.gigantamax");
    pokemon.evs = readStats(source.evs, "Pokemon.evs", 255);
    pokemon.ivs = readStats(source.ivs, "Pokemon.ivs", 31);
    if (source.moves !== undefined) {
      pokemon.moves = list(source.moves, "Pokemon.moves")
        .map((move) => {
          const result = text(move, "Pokemon.moves[]");
          if (!result) throw new TypeError("Pokemon.moves[] cannot be empty");
          return result;
        })
        .slice(0, 4);
    }
    return pokemon;
  }

  toJson(indentation = 2): string {
    return JSON.stringify(this, null, indentation);
  }

  toShowdown(): string {
    if (!this.name) return "";
    let title = this.nickname ? `${this.nickname} (${this.name})` : this.name;
    if (this.gender) title += ` (${this.gender})`;
    if (this.item) title += ` @ ${this.item}`;
    const lines = [title];
    const append = (label: string, value: string | number | undefined): void => {
      if (
        value !== undefined &&
        value !== "" &&
        (typeof value !== "number" || Number.isFinite(value))
      ) {
        lines.push(`${label}: ${value}`);
      }
    };
    append("Ability", this.ability);
    append("Level", this.level);
    if (this.shiny) lines.push("Shiny: Yes");
    append("Happiness", this.happiness);
    append("Pokeball", this.pokeball);
    append("Dynamax Level", this.dynamaxLevel);
    if (this.gigantamax) lines.push("Gigantamax: Yes");
    append("Tera Type", this.teraType);
    const appendStats = (label: string, values: PokemonStats | undefined): void => {
      const entries = stats.flatMap(([key, name]) => {
        const value = values?.[key];
        return value !== undefined && Number.isFinite(value) ? [`${value} ${name}`] : [];
      });
      if (entries.length) lines.push(`${label}: ${entries.join(" / ")}`);
    };
    appendStats("EVs", this.evs);
    if (this.nature) lines.push(`${this.nature} Nature`);
    appendStats("IVs", this.ivs);
    lines.push(...this.moves.slice(0, 4).map((move) => `- ${move}`));
    return lines.join("\n");
  }

  toString(): string {
    return this.toShowdown();
  }
}
