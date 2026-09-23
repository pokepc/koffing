import { describe, expect, it } from "vitest";
import { validate } from "../src/validator";
import { parse } from "../src/parse";
import { KoffingError } from "../src/limits";

const set = () => ({ species: "Koffing", moves: ["Sludge Bomb"] });

describe("optional validator", () => {
  it("accepts sparse sets, display names, IDs, and every JSON input shape", () => {
    const pokemon = {
      ...set(),
      item: "eviolite",
      ability: "Levitate",
      nature: "Bold",
      pokeball: "Poke Ball",
      hpType: "Ice",
      teraType: "Stellar",
      shiny: false,
      gigantamax: false,
      gender: "N",
      level: 100,
      happiness: 0,
      dynamaxLevel: 10,
      evs: { hp: 255, def: 255 },
      ivs: { atk: 0, spe: 31 },
    };
    for (const input of [
      pokemon,
      [pokemon],
      { pokemon: [pokemon] },
      { teams: [{ pokemon: [pokemon] }] },
      JSON.stringify(pokemon),
    ])
      expect(validate(input)).toEqual({ valid: true, diagnostics: [] });
    expect(validate({ ...set(), item: "", ability: "" }).valid).toBe(true);
  });

  it.each(["species", "item", "ability", "nature", "pokeball", "hpType", "teraType"])(
    "checks %s against its table",
    (field) => {
      expect(validate({ ...set(), [field]: "not-a-real-id" }).diagnostics).toContainEqual(
        expect.objectContaining({
          code: "unknown-identifier",
          path: `teams[0].pokemon[0].${field}`,
        }),
      );
    },
  );

  it("uses ball and Hidden Power type subsets", () => {
    for (const pokeball of ["Leftovers", "Eviolite"])
      expect(validate({ ...set(), pokeball }).valid).toBe(false);
    for (const hpType of ["Normal", "Fairy", "Stellar"])
      expect(validate({ ...set(), hpType }).valid).toBe(false);
    expect(validate({ ...set(), moves: ["Hidden Power Ice"], hpType: "Ice" }).valid).toBe(true);
  });

  it.each([
    { level: "50" },
    { level: NaN },
    { level: Infinity },
    { shiny: "false" },
    { gigantamax: 1 },
    { moves: "Protect" },
    { species: 109 },
    { gender: "X" },
    { evs: { hp: "4" } },
    { ivs: [] },
    { item: null },
    { moves: [42] },
  ])("reports invalid runtime shapes: %j", (fields) => {
    expect(validate({ ...set(), ...fields }).valid).toBe(false);
  });

  it.each([
    { level: 0 },
    { level: 101 },
    { level: 1.5 },
    { happiness: -1 },
    { happiness: 256 },
    { dynamaxLevel: 11 },
    { evs: { hp: 256 } },
    { ivs: { hp: 32 } },
    { ivs: { hp: 0.5 } },
    { evs: { hp: 255, atk: 255, def: 1 } },
  ])("rejects numeric range and integer violations: %j", (fields) => {
    expect(validate({ ...set(), ...fields }).valid).toBe(false);
  });

  it("checks team sizes, move counts, duplicate identities, and unknown moves", () => {
    for (const input of [
      [],
      { teams: [] },
      Array.from({ length: 7 }, set),
      { ...set(), moves: [] },
      { ...set(), moves: ["Protect", "protect"] },
      { ...set(), moves: ["Hidden Power Ice", "Hidden Power Fire"] },
      { ...set(), moves: ["Not a Move"] },
      { ...set(), moves: ["Protect", "Tackle", "Toxic", "Rest", "Sleep Talk"] },
    ])
      expect(validate(input).valid).toBe(false);
    expect(validate(Array.from({ length: 6 }, set)).valid).toBe(true);
  });

  it("does not mutate inputs or impose species, item, ability, or learnset clauses", () => {
    const input = [{ ...set(), ability: "Intimidate", moves: ["Spacial Rend"] }, set()];
    const before = structuredClone(input);
    expect(validate(input).valid).toBe(true);
    expect(input).toEqual(before);
    expect(validate({ ...set(), surprise: 1 }).valid).toBe(false);
  });

  it("keeps parsing opt-in and validates its result explicitly", () => {
    const parsed = parse("Imaginarymon\n- Imaginary Move");
    expect(parsed.diagnostics).toEqual([]);
    expect(validate({ teams: parsed.teams }).valid).toBe(false);
  });

  it("honors strict mode and resource limits", () => {
    expect(() => validate({ ...set(), level: 101 }, { mode: "strict" })).toThrow(KoffingError);
    expect(() => validate({ ...set(), shiny: 1 }, { mode: "strict" })).toThrow(KoffingError);
    expect(() => validate([set(), set()], { limits: { maxPokemon: 1 } })).toThrow(KoffingError);
    expect(() =>
      validate({ ...set(), moves: ["fake", "fake"] }, { limits: { maxDiagnostics: 1 } }),
    ).toThrow(KoffingError);
  });

  it("rejects accessors without executing them", () => {
    let calls = 0;
    const input = Object.defineProperty(set(), "ability", {
      get() {
        calls++;
        return "Levitate";
      },
    });
    expect(validate(input).valid).toBe(false);
    expect(calls).toBe(0);
  });
});
