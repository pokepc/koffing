# Koffing

A dependency-free Pokémon Showdown parser and formatter for JavaScript and TypeScript. Supports ESM and CommonJS.

```sh
pnpm add koffing
```

```ts
import { Koffing } from "koffing";

const teams = Koffing.parse("Koffing @ Eviolite\nAbility: Levitate\n- Sludge Bomb");
const json = teams.toJson();
const showdown = Koffing.toShowdown(json);
const formatted = Koffing.format(showdown);
```

The library exports `Koffing`, `ShowdownParser`, `PokemonTeamSet`, `PokemonTeam`, and `Pokemon`. Models provide `toJson()`, `toShowdown()`, and `toString()` methods, and `fromObject()` factories for JSON data.

Supported fields include nicknames, gender, items, abilities, levels, shininess, happiness, Poké Balls, EVs, IVs, natures, moves, Dynamax level, Gigantamax, and Tera types. Team headers preserve format, folder, and name.

Numeric fields are clamped to supported ranges and move lists are limited to four. This is a syntax parser, not a game database or competitive legality validator.
