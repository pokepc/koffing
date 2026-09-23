# Parser benchmarks

Measured locally on 2026-09-23 with Node.js 26.8.1, macOS arm64, and Vitest 5.0.1. Run `pnpm bench` from the repository root to reproduce. Optimized results use a 200 ms warmup and approximately 500 ms of measurement per case. The same-session pre-optimization baseline used the previous 50 ms warmup and 150 ms measurement. These local samples are indicative, not performance guarantees or CI thresholds.

The reference is official Pokémon Showdown 0.11.11, revision `739a5e1fee432ad80ff7136d70cca993be358b59`, installed only for development. The benchmark imports its team module, not the server.

| Operation                                     | Koffing before | Koffing after | Showdown (final run) | After / Showdown |
| --------------------------------------------- | -------------: | ------------: | -------------------: | ---------------: |
| Parse six Pokémon                             |      0.0246 ms |     0.0131 ms |            0.0098 ms |            1.34× |
| Export six Pokémon                            |      0.0251 ms |     0.0025 ms |            0.0026 ms |            0.96× |
| Parse 100 teams / 600 Pokémon                 |      2.4221 ms |     1.3191 ms |            0.9611 ms |            1.37× |
| Export 100 teams / 600 Pokémon                |      2.5405 ms |     0.2638 ms |                    — |                — |
| Handle a 12,000-character unknown detail line |      0.0838 ms |     0.0122 ms |            0.0007 ms |                — |

These implementations do different work when parsing. Koffing preserves backup metadata, returns diagnostics, and enforces resource limits. The upstream importer flattens backups and ignores unknown detail lines. Both exporters now trust typed objects and format directly, without boundary validation. Formatting and explicit-default handling still differ. Export times are effectively at parity; the small measured difference is not a universal speed advantage.

The CPU profile identified character-by-character scanning, repeated regex dispatch, object copying and descriptor traversal, and temporary serialization arrays as the main avoidable costs. Changes:

- Native newline searches cache both LF and CR positions, keeping all line-ending styles linear without splitting the whole input.
- Moves take an early path; field splitting uses the colon position; exceptional characters are detected once and checked per line only when present.
- Set and stat descriptors are validated and copied directly into their final whitelist objects, avoiding intermediate snapshots and repeated key scans.
- Array validation retains descriptor, hole, symbol, and extra-property protection without a redundant key-regex pass.
- Frozen default limits and fixed key sets are reused; diagnostic paths are built only where needed.
- Serialization avoids temporary entry arrays and follows Showdown's direct formatting approach.

Parsing retains sanity diagnostics, strict-mode behavior, and resource budgets. Export no longer calls JSON parsing/validation, clones input, inspects descriptors, rejects ambiguous strings, or checks output budgets. Callers can explicitly parse or validate untrusted data first. No mutable-object cache was added. Parsing takes about 47% less time and six-Pokémon export about 90% less time than the pre-optimization baseline. Removing export validation reduced the already optimized export from 0.0151 ms to 0.0025 ms.
