# Parser benchmark baseline

Measured locally on 2026-09-23 with Node.js 26.8.1, macOS arm64, and Vitest 5.0.1. Run `pnpm bench` from the repository root to reproduce. Each case uses a 50 ms warmup and approximately 150 ms of measurement; these short samples are indicative, not performance guarantees or CI thresholds.

The reference is official Pokémon Showdown 0.11.11, revision `739a5e1fee432ad80ff7136d70cca993be358b59`, installed only for development. The benchmark imports its team module, not the server.

| Operation                                     | Koffing mean | Showdown mean |
| --------------------------------------------- | -----------: | ------------: |
| Parse six Pokémon                             |    0.0269 ms |     0.0102 ms |
| Export six Pokémon                            |    0.0255 ms |     0.0030 ms |
| Parse 100 teams / 600 Pokémon                 |    2.4731 ms |     1.0441 ms |
| Export 100 teams / 600 Pokémon                |    2.4513 ms |             — |
| Handle a 12,000-character unknown detail line |    0.0835 ms |     0.0007 ms |

These implementations do different work. Koffing preserves backup metadata, returns diagnostics, enforces resource limits, and validates objects at export boundaries. The upstream importer flattens backups and ignores unknown detail lines. Even the common-syntax export comparison includes Koffing's boundary validation overhead. The measurements do not establish that one design is universally faster.

The observed absolute cost for normal teams is small. No speculative caching, worker machinery, or complicated parsing optimizations were added. Text parsing scans lines directly, avoiding a whole-input array of line strings. Bundle output remains dependency-free (about 8 kB gzip in the measured build).
