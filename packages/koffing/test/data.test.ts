import { describe, expect, it } from "vitest";
import { parseJSON, sanitizeTeam, validateTeam } from "../src/data";
import { parse } from "../src/parse";
import { exportTeam, exportTeams } from "../src/serialize";
import type { PokemonSet } from "../src/types";

const set = (): PokemonSet => ({
  species: "Koffing",
  moves: ["Sludge Bomb"],
  shiny: false,
  happiness: 0,
});

describe("JSON boundaries", () => {
  it("rejects hidden accessors and symbols at nested boundaries without invoking getters", () => {
    let calls = 0;
    const evs = Object.defineProperty({}, "hp", {
      get: () => {
        calls++;
        return 4;
      },
    });
    const hidden = Object.defineProperty(set(), "ability", {
      get: () => {
        calls++;
        return "Levitate";
      },
    });
    const symbol = { ...set(), [Symbol("hidden")]: true };
    const missingIndex = Object.assign(Array(1), { extra: "Protect" });
    for (const input of [hidden, symbol, { ...set(), evs }, { ...set(), moves: missingIndex }]) {
      expect(() => parseJSON([input])).toThrow();
    }
    expect(calls).toBe(0);
  });

  it("copies non-enumerable data fields and null-prototype stats", () => {
    const input = Object.defineProperty(set(), "ability", { value: "Levitate" });
    const evs: Record<string, number> = Object.create(null);
    evs.hp = 4;
    expect(parseJSON([{ ...input, evs }]).teams[0]!.pokemon[0]!.evs).toEqual({ hp: 4 });
    expect(parseJSON([input]).teams[0]!.pokemon[0]!.ability).toBe("Levitate");
  });
  it("accepts set, array, team and collection shapes and copies nested data", () => {
    const pokemon = set();
    for (const input of [
      pokemon,
      [pokemon],
      { pokemon: [pokemon] },
      { teams: [{ pokemon: [pokemon] }] },
    ]) {
      const result = parseJSON(input);
      expect(result.teams[0]!.pokemon).toEqual([pokemon]);
      expect(result.teams[0]!.pokemon[0]).not.toBe(pokemon);
      expect(result.teams[0]!.pokemon[0]!.moves).not.toBe(pokemon.moves);
    }
  });

  it("rejects getters without executing them", () => {
    let called = false;
    const input = {
      ...set(),
      get ability(): string {
        called = true;
        return "Levitate";
      },
    };
    expect(() => parseJSON(input)).toThrow(/accessor/);
    expect(called).toBe(false);
    const moves = ["Tackle"];
    Object.defineProperty(moves, "0", {
      get: () => {
        called = true;
        return "Tackle";
      },
    });
    expect(() => parseJSON({ ...set(), moves })).toThrow(/accessors/);
    expect(called).toBe(false);
  });

  it("rejects nonplain objects, holes, nonfinite values and line injection", () => {
    for (const input of [
      Object.create(set()),
      new Date(),
      { ...set(), moves: Array(2) },
      { ...set(), level: Infinity },
      { ...set(), ability: "Levitate\nShiny: Yes" },
    ]) {
      expect(() => parseJSON(input)).toThrow();
    }
  });

  it("reports unknown keys including prototype-like keys without copying them", () => {
    const input = '{"species":"Koffing","moves":[],"__proto__":{"polluted":true}}';
    const result = parseJSON(input);
    expect(result.diagnostics[0]!.code).toBe("unknown-field");
    expect(Object.hasOwn(result.teams[0]!.pokemon[0]!, "__proto__")).toBe(false);
    expect(() => parseJSON(input, { mode: "strict" })).toThrow();
  });

  it("enforces limits before decoding or traversing collections", () => {
    expect(() => parseJSON("{ invalid", { limits: { maxInputLength: 2 } })).toThrow(/exceeds/);
    expect(() => parseJSON([set(), set()], { limits: { maxPokemon: 1 } })).toThrow(/exceeds/);
    expect(() =>
      parseJSON(
        { teams: [{ pokemon: [set()] }, { pokemon: [set()] }] },
        { limits: { maxPokemon: 1 } },
      ),
    ).toThrow(/exceeds/);
    expect(() =>
      parseJSON({ ...set(), moves: ["Tackle", "Protect"] }, { limits: { maxMoves: 1 } }),
    ).toThrow(/exceeds/);
    expect(() => parseJSON(set(), { limits: { maxLineLength: 2 } })).toThrow(/exceeds/);
    expect(() => parseJSON([set(), set()], { limits: { maxInputLength: 700 } })).toThrow(
      /Aggregate/,
    );
    const moves = Object.assign(["Protect"], { extra: "hidden" });
    expect(() => parseJSON({ ...set(), moves })).toThrow(/non-index/);
  });

  it("accepts unfamiliar names without database checks even in strict mode", () => {
    const input = {
      species: "Future Species",
      ability: "Future Ability",
      item: "Future Item",
      nature: "Future Nature",
      teraType: "Future Type",
      pokeball: "Future Ball",
      moves: ["Future Move"],
    };
    const result = parseJSON(input, { mode: "strict" });
    expect(result.diagnostics).toEqual([]);
    expect(parse(exportTeam([input]), { mode: "strict" })).toEqual(result);
  });

  it("preserves finite values and extra moves until explicitly sanitized", () => {
    const input = {
      ...set(),
      species: "Future Species",
      ability: "Future Ability",
      item: "Future Item",
      nature: "Future Nature",
      teraType: "Future Type",
      pokeball: "Future Ball",
      level: 150,
      ivs: { hp: -1 },
      evs: { hp: 999, atk: 255, def: 255 },
      moves: ["A", "B", "C", "D", "E"],
    };
    const result = parseJSON(input);
    expect(result.teams[0]!.pokemon[0]).toEqual(input);
    expect(validateTeam([input]).map((issue) => issue.code)).toEqual([
      "number-range",
      "stat-range",
      "stat-range",
      "ev-total",
      "move-count",
    ]);
    expect(() => parseJSON(input, { mode: "strict" })).toThrow();
    const sanitized = sanitizeTeam([input]);
    expect(sanitized.pokemon[0]).toMatchObject({
      level: 100,
      ivs: { hp: 0 },
      evs: { hp: 255, atk: 255, def: 0 },
      moves: ["A", "B", "C", "D"],
    });
    expect(sanitized.diagnostics.some((issue) => issue.code === "sanitized")).toBe(true);
    expect(input.level).toBe(150);
    expect(input.moves).toHaveLength(5);
  });
});

describe("Showdown serialization integrity", () => {
  it("formats trusted sets without automatic validation and ignores extra properties", () => {
    const input = { ...set(), level: 150, happiness: -1 };
    expect(exportTeam([input])).toContain("Level: 150");
    expect(exportTeam([Object.assign(set(), { unknown: "value" })])).toBe(exportTeam([set()]));
    expect(validateTeam([input]).map(({ code }) => code)).toEqual(["number-range", "number-range"]);
    expect(() => parseJSON(input, { mode: "strict" })).toThrow();
  });

  it("reads properties directly and skips nonfinite numeric output", () => {
    const input = {
      ...set(),
      get ability(): string {
        return "Levitate";
      },
      level: NaN,
      happiness: Infinity,
      evs: { hp: 4, atk: Infinity },
    };
    const output = exportTeam([input]);
    expect(output).toContain("Ability: Levitate");
    expect(output).toContain("EVs: 4 HP");
    expect(output).not.toMatch(/NaN|Infinity|Level:|Happiness:/);
  });
  it("preserves false, zero, high levels, extra moves, and explicit HP type", () => {
    const input: PokemonSet = {
      ...set(),
      level: 150,
      gigantamax: false,
      dynamaxLevel: 0,
      hpType: "Ice",
      gender: "N",
      moves: ["A", "B", "C", "D", "E"],
    };
    expect(parse(exportTeam([input])).teams[0]!.pokemon[0]).toEqual(input);
    const extreme = { ...set(), evs: { hp: 1e21, atk: 1e-21 } };
    expect(parse(exportTeam([extreme])).teams[0]!.pokemon[0]).toEqual(extreme);
  });

  it("leaves string content to the caller instead of validating during export", () => {
    const input = parseJSON(set()).teams[0]!.pokemon[0]!;
    input.ability = "Levitate\nShiny: Yes";
    expect(exportTeam([input])).toContain("Ability: Levitate\nShiny: Yes");
    expect(() => parseJSON(input)).toThrow(/control characters/);
    expect(exportTeams([{ name: "A/B", pokemon: [set()] }])).toContain("=== A/B ===");
    expect(exportTeam([{ ...set(), ability: "Levitate|Corrosion" }])).toContain(
      "Levitate|Corrosion",
    );
  });

  it("retains Type: Null and collection boundaries", () => {
    const pokemon = { ...set(), species: "Type: Null", item: "Eviolite" };
    expect(parse(exportTeam([pokemon])).teams[0]!.pokemon[0]).toEqual(pokemon);
    const teams = [
      { name: "One", format: "gen9ou", folder: "Folder", pokemon: [set()] },
      { name: "Empty", pokemon: [] },
    ];
    expect(parse(exportTeams(teams)).teams).toEqual(teams);
    const nested = [{ name: "One", folder: "Folder/Nested", pokemon: [set()] }];
    expect(parse(exportTeams(nested)).teams).toEqual(nested);
    expect(exportTeams([{ pokemon: [set()] }])).toBe(exportTeam([set()]));
  });
});
