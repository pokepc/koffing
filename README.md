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
pnpm bench         # Parser/export benchmarks, including the pinned Showdown reference
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
import { parse, exportTeams } from "koffing";

const result = parse(`Koffing @ Eviolite
Ability: Levitate
Bold Nature
- Will-O-Wisp`);

console.log(result.teams[0]?.pokemon[0]?.species); // Koffing
console.log(result.diagnostics); // Always review parsing issues
const json = JSON.stringify({ teams: result.teams }, null, 2);
const showdown = exportTeams(result.teams);
```

The core uses pure functions and Showdown-shaped sets: `species` identifies the Pokémon, and optional `name` is its nickname. `parseJSON` accepts a set, a plain set array, a team wrapper, or a `{ teams }` collection. Team exports can contain `=== [format] Folder/Team name ===` headers or individual Pokémon separated by blank lines.

Parsing preserves supported numeric values and extra moves. It reports unknown syntax, repeated fields, and suspicious values instead of silently correcting them. `validateTeam` provides generic sanity diagnostics; `sanitizeTeam` is an explicit, non-mutating operation. Strict mode rejects diagnostics. These checks require no game database and do not establish legality. Packed team strings are explicitly unsupported. See [the library README](packages/koffing/README.md) for the API, limits, compatibility contract, and examples.

The previous class API and `name`/`nickname` schema were intentionally removed; this is a breaking rewrite. The runtime has no dependencies. The official `pokemon-showdown` package is development-only, used for differential tests and benchmarks. Its reference release and commit are recorded in `packages/koffing/test/upstream.json` and the frozen lockfile. Database-backed species normalization and competitive legality remain outside Koffing's scope.

MIT licensed. Pokémon is a trademark of its respective owners; this project is unaffiliated.
