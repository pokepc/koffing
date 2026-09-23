import { describe, expect, it } from "vitest";
import { parse } from "../src/parse";
import { KoffingError } from "../src/limits";
import { exportTeam } from "../src/serialize";

describe("Showdown text parsing", () => {
  it("round-trips finite stats serialized in exponent notation", () => {
    const pokemon = [{ species: "Koffing", moves: [], evs: { hp: 1e100, atk: 1e-9 } }];
    expect(parse(exportTeam(pokemon)).teams[0]!.pokemon).toEqual(pokemon);
    expect(parse("Koffing\nEVs: 1e2+ SpA / 1e-2- Atk").teams[0]!.pokemon[0]).toMatchObject({
      evs: { spa: 100, atk: 0.01 },
      nature: "Modest",
    });
    expect(parse("Koffing\nIVs: 1e999 HP").diagnostics[0]?.code).toBe("invalid-stat");
  });
  it("uses Showdown's species/name schema and keeps sparse metadata", () => {
    expect(parse("Smogon (Koffing) (F) [Levitate] @ Eviolite\n- Sludge Bomb")).toEqual({
      teams: [
        {
          pokemon: [
            {
              species: "Koffing",
              name: "Smogon",
              gender: "F",
              ability: "Levitate",
              item: "Eviolite",
              moves: ["Sludge Bomb"],
            },
          ],
        },
      ],
      diagnostics: [],
    });
    expect(parse(" \r\n")).toEqual({ teams: [], diagnostics: [] });
  });

  it("handles CRLF, nested folders and team boundaries without blank lines", () => {
    const result = parse(
      "=== [gen9ou] folder/sub/First ===\r\nKoffing\r\n- Tackle\r\n=== Second ===\r\nWeezing",
    );
    expect(result.teams).toEqual([
      {
        name: "First",
        format: "gen9ou",
        folder: "folder/sub",
        pokemon: [{ species: "Koffing", moves: ["Tackle"] }],
      },
      { name: "Second", pokemon: [{ species: "Weezing", moves: [] }] },
    ]);
  });

  it("supports client details, no-item syntax, flags and EV nature modifiers", () => {
    const result = parse(
      "Koffing @ No Item\nSpecies: Weezing\nNickname: Cloud\nItem: Black Sludge\nShiny\nGigantamax\nEVs: 252+ SpA / 4 SpD / 252- Atk\nMove: Sludge Bomb",
    );
    expect(result.teams[0]!.pokemon[0]).toMatchObject({
      species: "Weezing",
      name: "Cloud",
      item: "Black Sludge",
      shiny: true,
      gigantamax: true,
      nature: "Modest",
      evs: { spa: 252, spd: 4, atk: 252 },
      moves: ["Sludge Bomb"],
    });
    expect(parse("Koffing @ Berry\nItem: No Item").teams[0]!.pokemon[0]).not.toHaveProperty("item");
  });

  it.each([true, false])(
    "gives explicit Hidden Power and happiness fields priority (before=%s)",
    (before) => {
      const fields = "Hidden Power: Fire\nHappiness: 200";
      const moves = "- Hidden Power [Ice]\n- Frustration";
      const result = parse(`Koffing\n${before ? fields : moves}\n${before ? moves : fields}`);
      expect(result.teams[0]!.pokemon[0]).toMatchObject({
        hpType: "Fire",
        happiness: 200,
        moves: ["Hidden Power Ice", "Frustration"],
      });
      expect(result.diagnostics).toEqual([]);
      expect(
        parse("Koffing\n- Hidden Power [Ice]\n- Frustration").teams[0]!.pokemon[0],
      ).toMatchObject({ hpType: "Ice", happiness: 0 });
    },
  );

  it("preserves unconventional finite values and moves while reporting their lines", () => {
    const result = parse(
      "Koffing\nLevel: 150\nHappiness: -2\nEVs: 999 HP\n- A\n- B\n- C\n- D\n- E",
    );
    expect(result.teams[0]!.pokemon[0]).toMatchObject({
      level: 150,
      happiness: -2,
      evs: { hp: 999 },
      moves: ["A", "B", "C", "D", "E"],
    });
    expect(result.diagnostics.map(({ code, line }) => [code, line])).toEqual([
      ["number-range", 2],
      ["number-range", 3],
      ["stat-range", 4],
      ["ev-total", 4],
      ["move-count", 9],
    ]);
    expect(() => parse("Koffing\nLevel: 150", { mode: "strict" })).toThrow(KoffingError);
  });

  it("does not manufacture Pokémon from orphan or malformed details", () => {
    const result = parse(
      "Ability: Levitate\n- Tackle\n=== broken\nLevel: 50\n\nKoffing\nLevel: NaN\nEVs: nonsense\nUnknown: ignored",
    );
    expect(result.teams).toEqual([{ pokemon: [{ species: "Koffing", moves: [], evs: {} }] }]);
    expect(result.diagnostics.map(({ line }) => line)).toEqual([1, 2, 3, 4, 7, 8, 9]);
  });

  it("reports repeated fields and stats instead of silently overwriting", () => {
    const result = parse("Koffing\nLevel: 5\nLevel: 10\nEVs: 1 HP / 2 HP");
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "duplicate-field",
      "duplicate-stat",
    ]);
    expect(result.teams[0]!.pokemon[0]).toMatchObject({ level: 10, evs: { hp: 2 } });
  });

  it("supports legacy aliases, Type: Null, bracket ability details and separators", () => {
    const result = parse(
      "Type: Null\nTrait: Battle Armor\nFriendship: 200\nBall: Poke Ball\nEVs: 255 HP / 255 Atk\n---\nKoffing\n[Levitate] @ Eviolite\nGender: N",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.teams[0]!.pokemon).toEqual([
      {
        species: "Type: Null",
        moves: [],
        ability: "Battle Armor",
        happiness: 200,
        pokeball: "Poke Ball",
        evs: { hp: 255, atk: 255 },
      },
      { species: "Koffing", moves: [], ability: "Levitate", item: "Eviolite", gender: "N" },
    ]);
    expect(parse("Null (Type: Null) @ Eviolite").teams[0]!.pokemon[0]).toMatchObject({
      species: "Type: Null",
      name: "Null",
      item: "Eviolite",
    });
    expect(parse("Type: Null @ Eviolite").teams[0]!.pokemon[0]).toMatchObject({
      species: "Type: Null",
      item: "Eviolite",
    });
  });

  it("does not treat prototype keys as recognized fields or stats", () => {
    const result = parse("Koffing\nconstructor: test\n__proto__: test\nEVs: 12 constructor / 4 HP");
    expect(result.teams[0]!.pokemon[0]).toEqual({ species: "Koffing", moves: [], evs: { hp: 4 } });
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "unknown-line",
      "unknown-line",
      "invalid-stat",
    ]);
  });

  it("diagnoses conflicting nature modifiers without inventing a nature", () => {
    const result = parse("Koffing\nEVs: 4+ Atk / 4- Atk");
    expect(result.teams[0]!.pokemon[0]).not.toHaveProperty("nature");
    expect(result.diagnostics.map(({ code }) => code)).toContain("invalid-nature-modifier");
    expect(parse("Koffing\nEVs: 4+ Atk / 4+ Def / 4- SpA").teams[0]!.pokemon[0]).not.toHaveProperty(
      "nature",
    );
  });

  it("rejects control characters even at line boundaries and trims metadata", () => {
    const result = parse(
      "=== [ gen9ou ]  folder / Team ===\nKoffing\nAbility: Levitate\u0085\n\u2028",
    );
    expect(result.teams[0]).toEqual({
      format: "gen9ou",
      folder: "folder",
      name: "Team",
      pokemon: [{ species: "Koffing", moves: [] }],
    });
    expect(result.diagnostics.map(({ code, line }) => [code, line])).toEqual([
      ["invalid-character", 3],
      ["invalid-character", 4],
    ]);
  });

  it("rejects packed strings with a useful format error", () => {
    expect(() => parse("Koffing||eviolite|levitate|sludgebomb|Bold|")).toThrow(
      "Packed teams are not supported",
    );
  });

  it.each([
    ["input", "Koffing", { maxInputLength: 1 }],
    ["line", "Koffing", { maxLineLength: 1 }],
    ["team", "=== One ===\n=== Two ===", { maxTeams: 1 }],
    ["pokemon", "Koffing\n\nWeezing", { maxPokemon: 1 }],
    ["move", "Koffing\n- A\n- B", { maxMoves: 1 }],
    ["diagnostic", "Koffing\nUnknown: A\nUnknown: B", { maxDiagnostics: 1 }],
  ] as const)("enforces %s limits in permissive mode", (_name, input, limits) => {
    expect(() => parse(input, { limits })).toThrow(KoffingError);
  });
});
