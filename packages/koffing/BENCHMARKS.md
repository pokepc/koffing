# Parser benchmarks

Measured locally on 2026-09-23 with Node.js 26.8.1, macOS arm64, and Vitest 5.0.1. Run `pnpm bench` from the repository root to reproduce. Optimized results use a 200 ms warmup and approximately 500 ms of measurement per case. The same-session pre-optimization baseline used the previous 50 ms warmup and 150 ms measurement. These local samples are indicative, not performance guarantees or CI thresholds.

The reference is official Pokémon Showdown 0.11.11, revision `739a5e1fee432ad80ff7136d70cca993be358b59`, installed only for development. The benchmark imports its team module, not the server.

| Operation                                     | Koffing before | Koffing after | Showdown (final run) | After / Showdown |
| --------------------------------------------- | -------------: | ------------: | -------------------: | ---------------: |
| Parse six Pokémon                             |      0.0246 ms |     0.0131 ms |            0.0098 ms |            1.34× |
| Export six Pokémon                            |      0.0251 ms |     0.0151 ms |            0.0026 ms |            5.81× |
| Parse 100 teams / 600 Pokémon                 |      2.4221 ms |     1.3182 ms |            1.0030 ms |            1.31× |
| Export 100 teams / 600 Pokémon                |      2.5405 ms |     1.5204 ms |                    — |                — |
| Handle a 12,000-character unknown detail line |      0.0838 ms |     0.0121 ms |            0.0008 ms |                — |

These implementations do different work. Koffing preserves backup metadata, returns diagnostics, enforces resource limits, and validates objects at export boundaries. The upstream importer flattens backups and ignores unknown detail lines. Even the common-syntax export comparison includes Koffing's boundary validation overhead. The measurements do not establish that one design is universally faster.

The CPU profile identified character-by-character scanning, repeated regex dispatch, object copying and descriptor traversal, and temporary serialization arrays as the main avoidable costs. Changes:

- Native newline searches cache both LF and CR positions, keeping all line-ending styles linear without splitting the whole input.
- Moves take an early path; field splitting uses the colon position; exceptional characters are detected once and checked per line only when present.
- Set and stat descriptors are validated and copied directly into their final whitelist objects, avoiding intermediate snapshots and repeated key scans.
- Array validation retains descriptor, hole, symbol, and extra-property protection without a redundant key-regex pass.
- Frozen default limits and fixed key sets are reused; diagnostic paths are built only where needed.
- Serialization avoids temporary entry arrays and checks output lines without splitting the output.

The full sanity diagnostics, strict-mode behavior, resource budgets, and fresh export validation remain enabled. No unchecked API or mutable-object cache was added. Export is faster but still substantially slower than Showdown's formatter; preserving its stronger boundary checks has a measurable cost. Parsing takes about 47% less time and six-Pokémon export about 40% less time than the same-session baseline.
