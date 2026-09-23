import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportTeams, parse } from "../src";

const fixture = (name: string): string =>
  readFileSync(new URL(`./${name}.fixture.pkms`, import.meta.url), "utf8");

describe("original repository fixtures with Showdown field names", () => {
  it("retains supported data and reports unsupported trainer metadata", () => {
    const result = parse(fixture("team1"));
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({
      name: "Example Team",
      folder: "Folder 1",
      format: "gen9",
    });
    expect(result.teams[0]?.pokemon).toHaveLength(2);
    expect(result.teams[0]?.pokemon[0]).toMatchObject({
      species: "Weezing",
      name: "Smogon",
      gender: "F",
      item: "Leftovers",
      ability: "Levitate",
      level: 50,
      shiny: true,
      pokeball: "Beast",
      dynamaxLevel: 10,
      teraType: "Fire",
      happiness: 255,
      hpType: "Rock",
      nature: "Bold",
      evs: { hp: 36, def: 236, spd: 236 },
      ivs: { hp: 30, atk: 0, spd: 30, spe: 29 },
      moves: ["Will-O-Wisp", "Pain Split", "Sludge Bomb", "Fire Blast"],
    });
    expect(result.teams[0]?.pokemon[1]).toMatchObject({
      species: "Zeraora",
      happiness: 255,
      pokeball: "Poke",
    });
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(5);
    expect(result.diagnostics.every((diagnostic) => diagnostic.line !== undefined)).toBe(true);
  });

  it("preserves multiple and empty teams, nicknames, and species punctuation", () => {
    const result = parse(fixture("team2"));
    expect(result.teams.map((team) => team.format)).toEqual([
      "gen9ou",
      "gen8nationaldex",
      "gen8ou",
    ]);
    expect(result.teams[1]?.pokemon).toEqual([]);
    expect(result.teams[0]?.pokemon[2]?.species).toBe("Type: Null");
    expect(result.teams[0]?.pokemon[0]).toMatchObject({
      name: "Tatsugiriito",
      species: "Tatsugiri",
      gender: "F",
    });
    expect(result.teams[2]?.pokemon.slice(0, 2).map((set) => set.species)).toEqual([
      "Minior-Meteor",
      "Bisharp",
    ]);
  });

  it.each(["team1", "team2"])("round-trips supported data from %s", (name) => {
    const teams = parse(fixture(name)).teams;
    const exported = exportTeams(teams);
    expect(parse(exported).teams).toEqual(teams);
    expect(exportTeams(parse(exported).teams)).toBe(exported);
  });
});
