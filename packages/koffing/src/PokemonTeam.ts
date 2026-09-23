import { Pokemon } from "./Pokemon";
import { list, record, text } from "./validation";

export class PokemonTeam {
  name: string;
  format: string;
  folder?: string;
  pokemon: Pokemon[] = [];

  constructor(format = "gen9", name = "Untitled", folder?: string) {
    this.format = format;
    this.name = name;
    this.folder = folder;
  }

  static fromObject(value: unknown): PokemonTeam {
    const source = record(value, "PokemonTeam");
    const team = new PokemonTeam(
      text(source.format, "PokemonTeam.format"),
      text(source.name, "PokemonTeam.name"),
      text(source.folder, "PokemonTeam.folder"),
    );
    team.pokemon = list(source.pokemon, "PokemonTeam.pokemon").map(Pokemon.fromObject);
    return team;
  }

  toJson(indentation = 2): string {
    return JSON.stringify(this, null, indentation);
  }

  toShowdown(): string {
    const title = this.folder ? `${this.folder}/${this.name}` : this.name;
    return [
      `=== [${this.format}] ${title} ===`,
      ...this.pokemon.map((pokemon) => pokemon.toShowdown()).filter(Boolean),
    ].join("\n\n");
  }

  toString(): string {
    return this.toShowdown();
  }
}
