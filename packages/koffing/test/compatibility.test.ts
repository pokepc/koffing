import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { exportTeam, parse, type PokemonSet } from "../src";

const require = createRequire(import.meta.url);
const { Teams } =
  require("pokemon-showdown/dist/sim/teams.js") as typeof import("pokemon-showdown/dist/sim/teams.js");
const reference = JSON.parse(readFileSync(new URL("./upstream.json", import.meta.url), "utf8")) as {
  version: string;
  revision: string;
};

// Compare semantics without requiring callers to carry Showdown's default-filled objects.
function normalized(
  set: Omit<PokemonSet, "gender"> & { gender?: string },
): Omit<PokemonSet, "gender"> & { gender?: string } {
  return {
    ...set,
    name: set.name ?? "",
    item: set.item ?? "",
    ability: set.ability ?? "",
    gender: set.gender ?? "",
    nature: set.nature ?? "",
    level: set.level ?? 100,
    shiny: set.shiny ?? false,
    happiness: set.happiness ?? 255,
    gigantamax: set.gigantamax ?? false,
    dynamaxLevel: set.dynamaxLevel ?? 10,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...set.evs },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...set.ivs },
  };
}

const fixtures = [
  ["minimal", "Koffing\n- Smog"],
  [
    "nicknames and stats",
    "Smogon (Weezing) (F) @ Black Sludge\nAbility: Levitate\nLevel: 50\nShiny: Yes\nEVs: 252 HP / 4 Def / 252 SpD\nIVs: 0 Atk / 30 Spe\nCalm Nature\n- Sludge Bomb\n- Pain Split",
  ],
  [
    "modern fields",
    "Charizard (M) @ Heavy-Duty Boots\nAbility: Blaze\nGigantamax: Yes\nTera Type: Fire\nPokeball: Beast\nHidden Power: Ice\nHappiness: 17\n- Flamethrower",
  ],
  [
    "Hidden Power and Frustration",
    "Pikachu @ No Item\nTrait: Static\nIVs: 0 Atk / 30 Def\nHidden Power: Ice\n- Hidden Power [Ice]\n~ Frustration",
  ],
  [
    "unrestricted custom sets",
    "Mew\nLevel: 150\nEVs: 999 HP\n- Psychic\n- Protect\n- Recover\n- Transform\n- Metronome",
  ],
  [
    "multiple sets and punctuation",
    "Type: Null @ Eviolite\nAbility: Battle Armor\n- Protect\n\nFarfetch’d\n- Brave Bird",
  ],
] as const;

describe("pinned Showdown server compatibility", () => {
  it("requires explicit review when updating the reference package", () => {
    const installed = require("pokemon-showdown/package.json") as { version: string };
    expect(installed.version).toBe(reference.version);
    expect(reference.version).toBe("0.11.11");
    expect(reference.revision).toBe("739a5e1fee432ad80ff7136d70cca993be358b59");
  });

  it.each(fixtures)("imports %s with equivalent semantics", (name, text) => {
    const ours = parse(text);
    const upstream = Teams.import(text);
    expect(upstream).not.toBeNull();
    if (name === "unrestricted custom sets") {
      expect(ours.diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);
    } else {
      expect(ours.diagnostics).toEqual([]);
    }
    expect(ours.teams.flatMap((team) => team.pokemon).map(normalized)).toEqual(
      upstream!.map(normalized),
    );
  });

  it.each(fixtures)("cross-imports both exporters for %s", (_name, text) => {
    const upstream = Teams.import(text)!;
    const ours = parse(text).teams.flatMap((team) => team.pokemon);
    expect(Teams.import(exportTeam(ours))!.map(normalized)).toEqual(upstream.map(normalized));
    expect(
      parse(Teams.export(upstream))
        .teams.flatMap((team) => team.pokemon)
        .map(normalized),
    ).toEqual(ours.map(normalized));
  });

  it("deliberately preserves Dynamax Level despite the server import omission", () => {
    const text = "Koffing\nDynamax Level: 3\n- Smog";
    expect(Teams.import(text)?.[0]?.dynamaxLevel).toBeUndefined();
    const ours = parse(text).teams[0]!.pokemon;
    expect(ours[0]?.dynamaxLevel).toBe(3);
    expect(parse(exportTeam(ours)).teams[0]?.pokemon[0]?.dynamaxLevel).toBe(3);
  });

  it("follows the client in deriving hpType from a bracketed move, unlike the server", () => {
    const text = "Pikachu\n- Hidden Power [Ice]";
    expect(Teams.import(text)?.[0]?.hpType).toBeUndefined();
    expect(parse(text).teams[0]?.pokemon[0]).toMatchObject({
      hpType: "Ice",
      moves: ["Hidden Power Ice"],
    });
  });
});
