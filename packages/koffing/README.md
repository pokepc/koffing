# Koffing

A dependency-free Pokémon Showdown parser and formatter for JavaScript and TypeScript. Supports ESM and CommonJS. The API uses plain data and pure functions; it deliberately replaces the previous classes and `name`/`nickname` schema.

```sh
pnpm add koffing
```

```ts
import { parse, parseJSON, exportTeam, exportTeams } from "koffing";

const result = parse("Smogon (Koffing) @ Eviolite\nAbility: Levitate\n- Sludge Bomb");
console.log(result.diagnostics);
const sets = result.teams[0]!.pokemon;
// [{ species: "Koffing", name: "Smogon", item: "Eviolite", ... }]
const json = JSON.stringify(sets, null, 2); // Showdown-shaped set array
const imported = parseJSON(json);
const showdown = exportTeam(sets); // No team metadata header
const backup = exportTeams(imported.teams); // Preserves named team metadata
```

## Parsing and diagnostics

`parse(text, options?)` returns `{ teams, diagnostics }`. Each team contains `pokemon: PokemonSet[]` and optional `name`, `format`, and `folder`. Headerless input does not invent metadata. `parseJSON(value, options?)` accepts JSON text or plain data: a single set, an array of sets, a `{ pokemon, ...metadata }` team, or a `{ teams }` collection.

Set fields follow Showdown: required `species` and `moves`, optional `name` for a nickname, plus `item`, `ability`, `gender`, `nature`, `evs`, `ivs`, `level`, `shiny`, `happiness`, `pokeball`, `hpType`, `dynamaxLevel`, `gigantamax`, and `teraType`. Stat tables can be sparse.

Supported text includes nicknames, genders, item headers, team backups, `Trait`/`Friendship`/`Ball` aliases, `Item:`/`Nickname:`/`Species:`/`Move:`, bracketed abilities, bare `Shiny`/`Gigantamax`, and EV nature modifiers. Hidden Power moves use the internal `Hidden Power Ice` form with `hpType`, and export with brackets. Explicit happiness and Hidden Power fields take precedence over inferred values. Unknown species and move names are retained without database lookup.

Permissive mode is the default. Diagnostics identify unknown or malformed lines, duplicate fields, and suspicious numeric values; text diagnostics include one-based line numbers. Supported values are preserved, including levels over 100 and moves beyond four. Strict mode rejects these diagnostics. This is semantic preservation, not a byte-for-byte document editor: whitespace is normalized, repeated fields use the last accepted value, and unsupported lines are omitted with diagnostics. Always inspect diagnostics before replacing the original input.

```ts
import { parse, KoffingError } from "koffing";

try {
  parse(input, { mode: "strict" });
} catch (error) {
  if (error instanceof KoffingError) console.error(error.diagnostics);
}
```

Strict mode throws on diagnostics. Unsafe JSON structures, unrepresentable export values, resource-limit violations, and packed team strings fail in either mode. Packed formats are not interpreted as Pokémon names. Use upstream Showdown for pack/unpack support.

## Parser scope and safety

Koffing retains generic sanity diagnostics for traditional numeric ranges, EV totals, and move counts. These checks do not use a game database. Species, moves, abilities, items, natures, balls, and types are open strings: new names do not require database updates or a Koffing release. New text syntax or fields may still require parser support. Game-database normalization, learnsets, and format legality belong in a separate consumer or a future package such as `koffing-validator`; that package is not implemented here.

### Validation and explicit sanitization

```ts
import { validateTeam, sanitizeTeam } from "koffing";

const issues = validateTeam(sets);
const { pokemon, diagnostics } = sanitizeTeam(sets, {
  maxLevel: 100,
  maxMovesPerPokemon: 4,
});
```

`validateTeam` reports generic numeric ranges, move counts, and EV totals. `sanitizeTeam` clones input, clamps supported numeric fields and truncates moves only when explicitly called, and reports changes. EVs use a 510-point budget allocated in HP, Atk, Def, SpA, SpD, Spe order, capped at 255 per stat. It is not a competitive legality validator. Sanitizing does not establish legality or choose an optimal EV distribution.

`exportTeam` and `exportTeams` validate their inputs again, so editing an object after parsing cannot bypass serialization checks. They do not clamp numbers or trim move lists. Ambiguous delimiters and control characters are rejected instead of generating additional fields, Pokémon, or teams. Exports are Showdown text, not HTML; consumers must still escape them when rendering HTML.

## Resource limits

Every entry point accepts `limits` overrides. Defaults are 2,000,000 UTF-16 input code units, 16,384 code units per line, 1,000 teams, 10,000 Pokémon in total, 256 moves per Pokémon, and 1,000 diagnostics. Limits are resource budgets, not battle rules. Exceeding a limit throws; it never returns a silently truncated collection. Overrides must be positive safe integers.

For object inputs, the input budget conservatively counts known string lengths plus 32 units per string and 512 per set; this bounds work before serialization. Small custom budgets may therefore reject objects whose compact JSON would fit. Serialized output is also checked against the input and line budgets.

```ts
parse(input, { limits: { maxInputLength: 100_000, maxPokemon: 60 } });
```

Object entry points accept ordinary data objects and reject accessor properties and non-plain records. JavaScript proxies are executable objects and should not be treated as untrusted JSON; accept JSON text at trust boundaries.

## Compatibility and verification

The compatibility target is Showdown's exported text and sparse `PokemonSet` shape. Koffing retains backup metadata separately. Formatting need not be byte-identical to Showdown: explicit defaults can remain visible and harmless whitespace differs. Species aliases, generation-specific defaults, Hidden Power IV inference, and legality checks require game data and are intentionally not inferred by the core. Call a game-data resolver or Showdown validator separately when needed.

Differential tests compare supported semantic behavior with the official server implementation. The development-only reference version and source commit are recorded in `test/upstream.json`, and `pnpm-lock.yaml` fixes its installation. This reference is only a test oracle, never a source of runtime ID tables or legality rules. Updating the reference requires reviewing its expectations. Additional tests cover client syntax, old fixtures, malformed inputs, limits, serialization boundaries, and round trips. There are no web app tests.

Run `pnpm test` for tests and `pnpm bench` for Vitest benchmarks. Benchmarks cover normal teams, large backups, and malformed long lines; they are observations rather than CI speed thresholds. Upstream and Koffing perform different validation and metadata work, so throughput is not a like-for-like measure of every feature.
