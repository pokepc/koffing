import { Pokemon } from "./Pokemon";
import { PokemonTeam } from "./PokemonTeam";
import { PokemonTeamSet } from "./PokemonTeamSet";
import { ShowdownParser } from "./ShowdownParser";
import { record } from "./validation";

export type KoffingModel = Pokemon | PokemonTeam | PokemonTeamSet;
export type KoffingInput = string | KoffingModel | ShowdownParser;

export class Koffing {
  static parse(data: string | ShowdownParser): PokemonTeamSet;
  static parse<T extends KoffingModel>(data: T): T;
  static parse(data: KoffingInput): KoffingModel;
  static parse(data: KoffingInput): KoffingModel {
    if (data instanceof Pokemon || data instanceof PokemonTeam || data instanceof PokemonTeamSet)
      return data;
    return (data instanceof ShowdownParser ? data : new ShowdownParser(data)).parse();
  }

  static format(data: KoffingInput): string {
    return this.parse(data).toShowdown();
  }
  static toJson(data: KoffingInput): string {
    return this.parse(data).toJson();
  }

  /** Accepts JSON for a Pokémon, a team, or a collection of teams. */
  static toShowdown(data: unknown): string {
    if (data instanceof Pokemon || data instanceof PokemonTeam || data instanceof PokemonTeamSet)
      return data.toShowdown();
    if (data instanceof ShowdownParser) return data.parse().toShowdown();
    const source = record(
      typeof data === "string" ? (JSON.parse(data) as unknown) : data,
      "Koffing JSON",
    );
    if ("teams" in source) return PokemonTeamSet.fromObject(source).toShowdown();
    if ("pokemon" in source) return PokemonTeam.fromObject(source).toShowdown();
    if ("name" in source) return Pokemon.fromObject(source).toShowdown();
    throw new TypeError("Koffing JSON must contain teams, pokemon, or a Pokémon name");
  }
}
