import { describe, expect, it } from "vitest";
import { exportTeam, exportTeams, parse, parseJSON, sanitizeTeam, type PokemonSet } from "../src";

describe("cross-boundary round trips", () => {
  it("does not confuse field values ending in Nature with nature lines", () => {
    const pokemon = [
      { species: "Koffing", moves: ["Protect"], ability: "Custom Nature", item: "Nature" },
    ];
    expect(parse(exportTeam(pokemon)).teams[0]?.pokemon).toEqual(pokemon);
  });

  it("normalizes tabs before accepting serializable text", () => {
    const result = parse("Koffing\nAbility: Custom\tAbility\nEVs: 4\tHP");
    expect(result.diagnostics).toEqual([]);
    expect(parse(exportTeams(result.teams)).teams).toEqual(result.teams);
  });
  it("preserves generated sets across object, JSON, text and collection boundaries", () => {
    for (let index = 0; index < 80; index++) {
      const set: PokemonSet = {
        species: index % 2 ? "Type: Null" : "Koffing",
        name: `Partner ${index}`,
        moves: ["Protect", "Hidden Power Ice", "Frustration"],
        hpType: "Ice",
        happiness: index % 256,
        item: "Eviolite",
        ability: "Levitate",
        level: index + 50,
        shiny: index % 2 === 0,
        gigantamax: index % 3 === 0,
        gender: index % 2 ? "F" : "M",
        dynamaxLevel: index % 11,
        evs: { hp: index, atk: 0, spd: 252 },
        ivs: { atk: index % 32, spe: 0 },
        nature: "Bold",
        teraType: "Poison",
        pokeball: "Beast Ball",
      };
      expect(parseJSON(JSON.stringify([set])).teams[0]?.pokemon).toEqual([set]);
      expect(parse(exportTeam([set])).teams[0]?.pokemon).toEqual([set]);
      const teams = [
        { name: `Team ${index}`, folder: "Testing/Nested", format: "gen9", pokemon: [set] },
      ];
      expect(parse(exportTeams(teams)).teams).toEqual(teams);
      expect(sanitizeTeam(sanitizeTeam([set]).pokemon).pokemon).toEqual(
        sanitizeTeam([set]).pokemon,
      );
    }
  });

  it("does not mutate caller data at any entry point", () => {
    const set: PokemonSet = {
      species: "Mew",
      moves: ["Psychic", "Protect", "Rest", "Reflect", "Metronome"],
      level: 150,
      ivs: { atk: 32 },
    };
    const before = structuredClone(set);
    Object.freeze(set.moves);
    Object.freeze(set.ivs);
    Object.freeze(set);
    const data = Object.freeze([set]);
    parseJSON(data);
    exportTeam(data);
    sanitizeTeam(data);
    expect(set).toEqual(before);
  });
});
