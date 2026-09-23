# Koffing

A TypeScript library and browser tool for converting Pokémon Showdown teams to JSON and back.

## Workspace

- `packages/koffing` — dependency-free parser, bundled as ESM and CommonJS with type declarations by tsdown.
- `apps/web` — React + Vite, styled with vanilla CSS. Conversion happens locally in the browser.
- `.local/reference` — ignored copy of the previous repository, with checksums in `.local/reference-manifest.json`.

## Development

Use Node.js 22.12+ and pnpm 12.5.1 (declared in `packageManager`).

```sh
pnpm install
pnpm dev
```

The web app resolves the library source directly, so development needs no preliminary build or second watcher.

```sh
pnpm build         # Library and web production builds
pnpm typecheck     # TypeScript 7 across both packages
pnpm test          # Library tests with Vitest; no app tests
pnpm format       # Format with oxfmt
pnpm check        # Formatting, types, library tests, and builds
```

The app has a relative Vite base and can be hosted from a subdirectory. Its output is in `apps/web/dist`; library output is in `packages/koffing/dist`.

## GitHub Pages

In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
The `Deploy to GitHub Pages` workflow runs on pushes to `main` and can also be started manually.
It installs the pnpm version declared in `packageManager` with the frozen lockfile, checks formatting and types,
runs the library tests, and builds the web app. The Pages configuration supplies the deployment base path,
so assets work on both repository URLs and custom domains. Only runs on `main` deploy.

The workflow uploads `apps/web/dist` and deploys that artifact through the official Pages actions;
no generated files or `gh-pages` branch commits are needed. Deployment permissions are limited to the deploy job.
The HTML preserves the original site's title and description, and includes the Koffing favicon.

## Library

```ts
import { Koffing } from "koffing";

const team = Koffing.parse(`Koffing @ Eviolite
Ability: Levitate
Bold Nature
- Will-O-Wisp`);

const json = team.toJson();
const showdown = Koffing.toShowdown(json);
const formatted = Koffing.format(showdown);
```

`Pokemon`, `PokemonTeam`, `PokemonTeamSet`, and `ShowdownParser` are also exported. Team exports can contain `=== [format] Folder/Team name ===` headers or individual Pokémon separated by blank lines. Formatting normalizes supported fields; it does not validate species, moves, abilities, or competitive team legality against a game database.

The rewrite preserves the main class API and JSON shape. It fixes absent numeric fields being printed as `undefined` and team headers moving Pokémon into the wrong team. Malformed JSON data now reports errors instead of being silently accepted.

MIT licensed. Pokémon is a trademark of its respective owners; this project is unaffiliated.
