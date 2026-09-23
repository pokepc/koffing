import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { Dex } = require("pokemon-showdown");
const { version } = require("pokemon-showdown/package.json");
const directory = new URL("../src/lookups/", import.meta.url);
const check = process.argv.includes("--check");
const tables = Object.fromEntries(
  ["species", "moves", "items", "abilities", "natures", "types"].map((key) => [
    key,
    Dex[key]
      .all()
      .filter((entry) => entry.exists)
      .map((entry) => entry.id),
  ]),
);
tables.pokeballs = Dex.items
  .all()
  .filter((item) => item.exists && item.isPokeball)
  .map((item) => item.id);

// Typed Hidden Power names are synthesized by the Dex and absent from all().
for (const type of tables.types) {
  if (["normal", "fairy", "stellar"].includes(type)) continue;
  const identifier = `hiddenpower${type}`;
  if (!Dex.moves.get(identifier).exists) throw new Error(`Missing move: ${identifier}`);
  tables.moves.push(identifier);
}

if (!check) await mkdir(directory, { recursive: true });
for (const [name, identifiers] of Object.entries(tables)) {
  const content = JSON.stringify([...new Set(identifiers)].sort(), null, 2) + "\n";
  const file = new URL(`${name}.json`, directory);
  if (check) {
    if ((await readFile(file, "utf8")) !== content) throw new Error(`Stale lookup: ${name}`);
  } else await writeFile(file, content);
}
const metadata =
  JSON.stringify(
    {
      package: "pokemon-showdown",
      version,
      scope:
        "All existing identifiers in the default Dex, including past and nonstandard entries; no aliases or format legality.",
    },
    null,
    2,
  ) + "\n";
const metadataFile = new URL("source.json", directory);
if (check) {
  if ((await readFile(metadataFile, "utf8")) !== metadata) throw new Error("Stale lookup source");
} else await writeFile(metadataFile, metadata);
