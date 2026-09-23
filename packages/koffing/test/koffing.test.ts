import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Koffing, Pokemon, PokemonTeam, PokemonTeamSet, ShowdownParser } from "../src";

const fixture = (name: string): string =>
  readFileSync(new URL(`./${name}.fixture.pkms`, import.meta.url), "utf8");

describe("Showdown parsing", () => {
  it("preserves all supported fields in the original fixture", () => {
    const result = Koffing.parse(fixture("team1"));
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({
      name: "Example Team",
      folder: "Folder 1",
      format: "gen9",
    });
    expect(result.teams[0]?.pokemon).toHaveLength(2);
    expect(JSON.parse(result.teams[0]?.pokemon[0]?.toJson() ?? "null")).toEqual({
      nickname: "Smogon",
      name: "Weezing",
      gender: "F",
      item: "Leftovers",
      ability: "Levitate",
      level: 50,
      shiny: true,
      pokeball: "Beast",
      dynamaxLevel: 10,
      teraType: "Fire",
      happiness: 255,
      nature: "Bold",
      evs: { hp: 36, def: 236, spd: 236 },
      ivs: { hp: 30, atk: 0, spd: 30, spe: 29 },
      moves: ["Will-O-Wisp", "Pain Split", "Sludge Bomb", "Fire Blast"],
    });
    expect(result.teams[0]?.pokemon[1]).toMatchObject({
      name: "Zeraora",
      happiness: 255,
      pokeball: "Poke",
    });
    expect(result.toShowdown()).not.toMatch(/undefined|NaN|Gigantamax: No/u);
  });

  it("preserves multiple teams, empty teams, punctuation and forms", () => {
    const result = Koffing.parse(fixture("team2"));
    expect(result.teams.map((team) => team.format)).toEqual([
      "gen9ou",
      "gen8nationaldex",
      "gen8ou",
    ]);
    expect(result.teams.map((team) => team.pokemon.length)).toEqual([3, 0, 4]);
    expect(result.teams[0]?.pokemon[2]?.name).toBe("Type: Null");
    expect(result.teams[0]?.pokemon[0]).toMatchObject({
      nickname: "Tatsugiriito",
      name: "Tatsugiri",
      gender: "F",
    });
  });

  it("flushes pending Pokémon before switching to another team", () => {
    const result = Koffing.parse("Koffing\n- Smog\n=== [gen9ou] Next ===\nWeezing\n- Protect");
    expect(result.teams.map((team) => team.pokemon.map((pokemon) => pokemon.name))).toEqual([
      ["Koffing"],
      ["Weezing"],
    ]);
  });

  it("does not create phantom teams for empty input or separators", () => {
    expect(Koffing.parse("\n---\n\r\n").teams).toEqual([]);
    expect(Koffing.format("")).toBe("");
  });

  it("clamps numeric fields, preserves zeroes and limits move count", () => {
    const result = Koffing.parse(
      "Koffing\r\nLevel: -1\r\nFriendship: 9999\r\nDynamax Level: 999\r\nEVs: 999 HP / -2 Atk / invalid\r\nIVs: 999 HP / 0 Spe\r\n- A\r\n~ B\r\n- C\r\n- D\r\n- E",
    );
    expect(result.teams[0]?.pokemon[0]).toMatchObject({
      level: 1,
      happiness: 255,
      dynamaxLevel: 10,
      evs: { hp: 255, atk: 0 },
      ivs: { hp: 31, spe: 0 },
      moves: ["A", "B", "C", "D"],
    });
    expect(result.toShowdown()).toContain("IVs: 31 HP / 0 Spe");
  });

  it.each(["team1", "team2"])("round-trips %s through JSON and formatting", (name) => {
    const formatted = Koffing.format(fixture(name));
    expect(Koffing.toShowdown(Koffing.toJson(fixture(name)))).toBe(formatted);
    expect(Koffing.format(formatted)).toBe(formatted);
  });
});

describe("models and JSON conversion", () => {
  it("converts individual Pokémon, teams and collections", () => {
    const pokemon = Pokemon.fromObject({ name: "Koffing", moves: ["Smog"] });
    const team = PokemonTeam.fromObject({ pokemon: [pokemon] });
    const set = PokemonTeamSet.fromObject({ teams: [team] });
    for (const model of [pokemon, team, set]) {
      expect(Koffing.parse(model)).toBe(model);
      expect(Koffing.toShowdown(model.toJson())).toBe(model.toShowdown());
      expect(Koffing.toShowdown(model)).toBe(model.toString());
    }
    expect(pokemon.toShowdown()).toBe("Koffing\n- Smog");
    expect(new Pokemon().toShowdown()).toBe("");
    expect(new PokemonTeamSet().toJson()).toBe('{\n  "teams": []\n}');
  });

  it("supports parser instances and fluent formatting", () => {
    const parser = new ShowdownParser("  Koffing \n Trait: Levitate ");
    expect(Koffing.parse(parser)).toBeInstanceOf(PokemonTeamSet);
    expect(parser.format()).toBe(parser);
    expect(parser.toString()).toBe(Koffing.toShowdown(parser));
  });

  it("validates every move before trimming to the supported count", () => {
    expect(() => Pokemon.fromObject({ name: "Koffing", moves: ["A", "B", "C", "D", 3] })).toThrow(
      TypeError,
    );
  });

  it.each([
    null,
    [],
    {},
    { teams: null },
    { teams: [null] },
    { teams: [{ pokemon: "bad" }] },
    { name: 5 },
    { name: "Koffing", moves: [null] },
    { name: "Koffing", level: "50" },
    { name: "Koffing", shiny: "yes" },
    { name: "Koffing", ivs: [] },
    { name: "Koffing", evs: { hp: Number.NaN } },
    { name: "Koffing", level: Infinity },
    { name: "Koffing\n- injected" },
    { name: "Koffing", gender: "other" },
  ])("rejects malformed JSON data: %j", (value) => {
    expect(() => Koffing.toShowdown(value)).toThrow(TypeError);
  });

  it("surfaces JSON syntax errors", () => {
    expect(() => Koffing.toShowdown("{")).toThrow(SyntaxError);
  });

  it("normalizes numeric JSON fields and omits false or missing optional fields", () => {
    const pokemon = Pokemon.fromObject({
      name: "Koffing",
      level: 101,
      happiness: -5,
      dynamaxLevel: 50,
      evs: { hp: 999 },
      ivs: { atk: 90 },
      shiny: false,
    });
    expect(JSON.parse(pokemon.toJson())).toEqual({
      name: "Koffing",
      level: 100,
      happiness: 0,
      dynamaxLevel: 10,
      evs: { hp: 255 },
      ivs: { atk: 31 },
      moves: [],
    });
    expect(pokemon.toShowdown()).toContain("Happiness: 0");
  });
});
