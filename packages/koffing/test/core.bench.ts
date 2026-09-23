import { createRequire } from "node:module";
import { test } from "vitest";
import { exportTeam, exportTeams, parse } from "../src";

const require = createRequire(import.meta.url);
const { Teams } =
  require("pokemon-showdown/dist/sim/teams.js") as typeof import("pokemon-showdown/dist/sim/teams.js");

const single = ["Koffing", "Weezing", "Pikachu", "Charizard", "Mew", "Snorlax"]
  .map(
    (species) =>
      `${species} @ Leftovers\nAbility: Levitate\nEVs: 252 HP / 4 Def / 252 SpD\nCalm Nature\n- Protect\n- Rest\n- Sleep Talk\n- Toxic`,
  )
  .join("\n\n");
const backup = Array.from(
  { length: 100 },
  (_, index) => `=== [gen9] Team ${index} ===\n\n${single}`,
).join("\n\n");
const malformed = `Koffing\n${"?".repeat(12_000)}\n- Smog`;
const ours = parse(single).teams[0]!.pokemon;
const theirs = Teams.import(single)!;
const collection = parse(backup).teams;
const timing = { time: 150, warmupTime: 50, iterations: 10 };

test("six Pokémon import, common syntax", async ({ bench }) => {
  await bench.compare(
    bench("Koffing parse", () => {
      parse(single);
    }),
    bench("Showdown import", () => {
      Teams.import(single);
    }),
    timing,
  );
});
test("six Pokémon export, common syntax", async ({ bench }) => {
  await bench.compare(
    bench("Koffing export", () => {
      exportTeam(ours);
    }),
    bench("Showdown export", () => {
      Teams.export(theirs);
    }),
    timing,
  );
});

// These exercise different guarantees: Koffing retains metadata and diagnostics;
// Showdown flattens backups and silently ignores unknown lines. No speed ratio implied.
test("large backups and malformed input (different guarantees)", async ({ bench }) => {
  await bench("Koffing parse 100-team collection", () => {
    parse(backup);
  }).run(timing);
  await bench("Showdown import flattened backup", () => {
    Teams.import(backup);
  }).run(timing);
  await bench("Koffing export 100-team collection", () => {
    exportTeams(collection);
  }).run(timing);
  await bench("Koffing diagnose long unknown line", () => {
    parse(malformed);
  }).run(timing);
  await bench("Showdown ignore long unknown line", () => {
    Teams.import(malformed);
  }).run(timing);
});
