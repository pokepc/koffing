import { PokemonTeam } from "./PokemonTeam";
import { list, record } from "./validation";

export class PokemonTeamSet {
  teams: PokemonTeam[];

  constructor(teams: PokemonTeam[] = []) {
    this.teams = teams;
  }

  static fromObject(value: unknown): PokemonTeamSet {
    const source = record(value, "PokemonTeamSet");
    return new PokemonTeamSet(
      list(source.teams, "PokemonTeamSet.teams").map(PokemonTeam.fromObject),
    );
  }

  toJson(indentation = 2): string {
    return JSON.stringify(this, null, indentation);
  }
  toShowdown(): string {
    return this.teams.map((team) => team.toShowdown()).join("\n\n");
  }
  toString(): string {
    return this.toShowdown();
  }
}
