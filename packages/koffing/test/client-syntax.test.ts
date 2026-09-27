import { describe, expect, it } from "vitest";
import { parse } from "../src";

// Output of the Showdown client's Teams.exportSet, including its beta format.
describe("Showdown client export syntax", () => {
  it("skips the empty move lines the client writes for sets with fewer than four moves", () => {
    const result = parse("Pikachu @ Light Ball\nAbility: Static\n- Thunderbolt\n- \n-\n~ \nMove:");
    expect(result.teams[0]!.pokemon[0]!.moves).toEqual(["Thunderbolt"]);
    expect(result.diagnostics.map(({ code, line }) => [code, line])).toEqual([["invalid-move", 7]]);
  });

  it("reads beta EVs lines with value-less modifiers and a nature suffix", () => {
    const result = parse(
      "Volbeat (M)\n[Prankster] @ Damp Rock\nEVs: 248 HP / - Atk / 252+ Def / 8 SpD (Bold)\n- Tail Glow",
    );
    expect(result).toEqual({
      teams: [
        {
          pokemon: [
            {
              species: "Volbeat",
              gender: "M",
              ability: "Prankster",
              item: "Damp Rock",
              evs: { hp: 248, def: 252, spd: 8 },
              nature: "Bold",
              moves: ["Tail Glow"],
            },
          ],
        },
      ],
      diagnostics: [],
    });
  });

  it("uses the nature suffix only when modifiers do not name a nature", () => {
    const pokemon = (input: string) => parse(input).teams[0]!.pokemon[0]!;
    expect(pokemon("Ditto\nEVs: 252 HP (Hardy)").nature).toBe("Hardy");
    expect(pokemon("Ditto\nEVs: 252+ Def / - Atk (Hardy)").nature).toBe("Bold");
    expect(pokemon("Ditto\nEVs: 252 HP (Hardy)\nCalm Nature").nature).toBe("Calm");
    expect(pokemon("Ditto\nCalm Nature\nEVs: 252 HP (Hardy)").nature).toBe("Calm");
    expect(parse("Ditto\nIVs: 0 Atk (Hardy)").diagnostics[0]?.code).toBe("invalid-stat");
    expect(parse("Ditto\nIVs: - Atk").diagnostics[0]?.code).toBe("invalid-nature-modifier");
  });

  it("treats the beta client's item and ability placeholders as unspecified", () => {
    expect(
      parse("Volbeat\n[(select ability)] @ (no item)\n- Tail Glow").teams[0]!.pokemon[0],
    ).toEqual({ species: "Volbeat", moves: ["Tail Glow"] });
    expect(
      parse("Volbeat [(select ability)] @ (no item)\nItem: (No Item)").teams[0]!.pokemon[0],
    ).toEqual({ species: "Volbeat", moves: [] });
  });
});
