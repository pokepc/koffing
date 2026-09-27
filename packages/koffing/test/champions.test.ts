import { describe, expect, it } from "vitest";
import { exportTeam, exportTeams, parse, parseJSON, sanitizeTeam, type PokemonSet } from "../src";
import { validate } from "../src/validator";

const champion: PokemonSet = {
  species: "Garchomp",
  item: "Choice Scarf",
  ability: "Rough Skin",
  level: 50,
  sps: { hp: 2, atk: 32, spe: 32 },
  nature: "Jolly",
  moves: ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"],
};

describe("Pokémon Champions stat points", () => {
  it("formats stat points as an SPs line and parses them back", () => {
    const text = exportTeam([champion]);
    expect(text).toBe(
      "Garchomp @ Choice Scarf\nAbility: Rough Skin\nLevel: 50\nSPs: 2 HP / 32 Atk / 32 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw\n- Rock Slide\n- Protect",
    );
    expect(parse(text)).toEqual({ teams: [{ pokemon: [champion] }], diagnostics: [] });
  });

  it("round-trips stat points through JSON, collections and sanitizing", () => {
    expect(parseJSON(JSON.stringify([champion])).teams[0]!.pokemon).toEqual([champion]);
    const teams = [{ name: "Regulation A", format: "gen9champions", pokemon: [champion] }];
    expect(parse(exportTeams(teams)).teams).toEqual(teams);
    expect(sanitizeTeam([champion])).toEqual({ pokemon: [champion], diagnostics: [] });
    expect(validate([champion])).toEqual({ valid: true, diagnostics: [] });
  });

  it("accepts the SP and Stat Points aliases and infers a nature from modifiers", () => {
    expect(parse("Garchomp\nSP: 32+ Atk / 32 Spe / 2- SpA").teams[0]!.pokemon[0]).toMatchObject({
      sps: { atk: 32, spe: 32, spa: 2 },
      nature: "Adamant",
    });
    expect(parse("Garchomp\nStat Points: 32 Spe").teams[0]!.pokemon[0]!.sps).toEqual({ spe: 32 });
  });

  it("reports malformed stat point lines by line number and preserves values", () => {
    const result = parse(
      "Garchomp\nSPs: 33 Atk / 32 Spe / 2 HP\nSPs: 32 Atk / lots Def / 32 Spe / 32 HP\nSPs: 4+ HP",
    );
    expect(result.teams[0]!.pokemon[0]!.sps).toEqual({ hp: 4 });
    expect(result.diagnostics.map(({ code, line }) => [code, line])).toEqual([
      ["stat-range", 2],
      ["sp-total", 2],
      ["duplicate-field", 3],
      ["invalid-stat", 3],
      ["sp-total", 3],
      ["duplicate-field", 4],
      ["invalid-nature-modifier", 4],
    ]);
  });

  it("checks and clamps stat point ranges in JSON data", () => {
    const set: PokemonSet = { species: "Garchomp", moves: [], sps: { atk: 40, def: 32, spe: 32 } };
    expect(parseJSON([set]).diagnostics.map(({ code, path }) => [code, path])).toEqual([
      ["stat-range", "teams[0].pokemon[0].sps.atk"],
      ["sp-total", "teams[0].pokemon[0].sps"],
    ]);
    expect(sanitizeTeam([set]).pokemon[0]!.sps).toEqual({ atk: 32, def: 32, spe: 2 });
    expect(() => parseJSON([{ ...set, sps: { atk: "32" } }])).toThrow(/finite/);
  });
});
