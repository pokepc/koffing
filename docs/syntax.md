# Syntax and data fields

Koffing converts Pokémon Showdown text and plain JSON data into teams. This reference describes the syntax implemented by Koffing, including its supported extensions. For API usage, strict mode, sanitization, and resource limits, see the [library README](../packages/koffing/README.md).

## Text format

```text
=== [gen9ou] Examples/First team ===

Smogon (Koffing) (F) @ Eviolite
Ability: Levitate
Level: 50
Shiny: Yes
Happiness: 200
Pokeball: Poke Ball
Tera Type: Poison
EVs: 252 HP / 252 Def / 4 SpD
Bold Nature
IVs: 0 Atk
- Sludge Bomb
- Will-O-Wisp

Weezing @ Black Sludge
Ability: Levitate
- Protect
```

This illustrates syntax; it is not a claim of legality in the named format.

### Pokémon headers and boundaries

Each Pokémon starts with a species header. Optional parts appear in this order:

```text
Species
Nickname (Species)
Nickname (Species) (F) [Ability] @ Item
```

- Gender suffixes are uppercase `(M)`, `(F)`, or `(N)`.
- A trailing `[Ability]` is an alternative to an `Ability:` detail line.
- The item separator is `@`, with spaces. `@ No Item` leaves the item absent.
- `Type: Null` is supported as a species, including in a nickname header.
- A blank line or a line containing only three or more hyphens ends the current Pokémon. Use a separator before the next Pokémon header; a blank line inside a set ends that set too.
- LF, CRLF, and CR line endings are accepted. Lines are trimmed and tabs become spaces.

Detail lines belong after a Pokémon header. Recognized details before a header produce diagnostics. Comments are not supported: a free-text line at a Pokémon boundary may be interpreted as a species because names are not checked against a database.

### Team headers

```text
=== Team name ===
=== [gen9ou] Team name ===
=== [gen9ou] Folder/Subfolder/Team name ===
```

A team header starts a new team, even without a preceding blank line. The format in brackets is optional. The last slash separates the folder from the team name, so nested folders are supported. An empty `=== ===` header creates an unnamed team. Headerless Pokémon belong to one team with no invented name, format, or folder.

## Supported Pokémon fields

These are all fields in `PokemonSet`. JSON keys are case-sensitive. Text detail labels and the `Nature` suffix are case-insensitive; names and other string values retain their spelling. Text aliases do not become additional JSON keys.

| JSON field     | Type                         | Text syntax / aliases                                 | Behavior                                                                                                                    |
| -------------- | ---------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `species`      | `string`                     | Pokémon header; `Species: Koffing`                    | Required, nonempty in JSON. A `Species:` override after a header reports a repeated field.                                  |
| `name`         | `string`                     | `Smogon (Koffing)`; `Nickname: Smogon`                | Optional nickname, not the species.                                                                                         |
| `item`         | `string`                     | `Koffing @ Eviolite`; `Item: Eviolite`                | `No Item` in text removes the item.                                                                                         |
| `ability`      | `string`                     | `Ability: Levitate`; `Trait: Levitate`; `[Levitate]`  | Brackets work in the header or on a detail line. A detail line can also be `[Levitate] @ Eviolite`.                         |
| `gender`       | `"M"`, `"F"`, `"N"`, or `""` | Header suffix; `Gender: F`; empty `Gender:`           | Values must be uppercase or empty. Export uses suffixes for M/F and detail lines for N/empty.                               |
| `moves`        | `string[]`                   | `- Sludge Bomb`; `~ Sludge Bomb`; `Move: Sludge Bomb` | Required in JSON; may be `[]`. Text starts with an empty list and appends each move in order. Empty move names are invalid. |
| `nature`       | `string`                     | `Bold Nature`                                         | `Nature: Bold` is not supported. Can also be inferred from EV modifiers.                                                    |
| `evs`          | `Stats`                      | `EVs: 252 HP / 252 Def / 4 SpD`                       | Sparse stat table. Traditional integer range: 0–255 per stat, total at most 510.                                            |
| `ivs`          | `Stats`                      | `IVs: 0 Atk / 31 Spe`                                 | Sparse stat table. Traditional integer range: 0–31 per stat.                                                                |
| `level`        | `number`                     | `Level: 50`                                           | Traditional integer range: 1–100.                                                                                           |
| `shiny`        | `boolean`                    | `Shiny: Yes`; bare `Shiny`                            | Accepts Yes/No/true/false, case-insensitively. Bare flag means true.                                                        |
| `happiness`    | `number`                     | `Happiness: 200`; `Friendship: 200`                   | Traditional integer range: 0–255. Text move `Frustration` infers 0 unless explicitly set.                                   |
| `pokeball`     | `string`                     | `Pokeball: Poke Ball`; `Ball: Poke Ball`              | Ball name is retained as text.                                                                                              |
| `hpType`       | `string`                     | `Hidden Power: Ice`                                   | Also inferred from bracketed Hidden Power moves in text; see below.                                                         |
| `dynamaxLevel` | `number`                     | `Dynamax Level: 10`                                   | Traditional integer range: 0–10.                                                                                            |
| `gigantamax`   | `boolean`                    | `Gigantamax: Yes`; bare `Gigantamax`                  | Same boolean syntax as `Shiny`.                                                                                             |
| `teraType`     | `string`                     | `Tera Type: Poison`                                   | Type name is retained as text.                                                                                              |

All fields except `species` and `moves` are optional. Missing values remain absent: Koffing does not fill in level 100, IVs of 31, EVs of 0, false flags, or generation-specific defaults. The text inferences described here are exceptions. JSON import validates and copies fields without performing those text inferences.

Traditional ranges are diagnostic checks, not coercion rules. In permissive mode, finite values outside those ranges, fractional values, and more than four moves are preserved with warnings. Resource limits still apply. Names of species, moves, items, abilities, natures, balls, and types are open strings; Koffing does not normalize aliases or verify game legality.

### Stats and nature modifiers

JSON `Stats` is an object containing any subset of these keys, with finite numeric values:

| JSON key | Canonical text label | Other accepted text labels |
| -------- | -------------------- | -------------------------- |
| `hp`     | `HP`                 | —                          |
| `atk`    | `Atk`                | `Attack`                   |
| `def`    | `Def`                | `Defense`                  |
| `spa`    | `SpA`                | `SpAtk`, `Special Attack`  |
| `spd`    | `SpD`                | `SpDef`, `Special Defense` |
| `spe`    | `Spe`                | `Speed`                    |

Text stat labels ignore case, spaces, and periods, so `Sp. Atk` also works. Separate entries with `/`; each entry needs a number followed by a stat label. Decimal and exponent notation are accepted, although non-integers produce range diagnostics. JSON uses only the exact lowercase keys above.

```text
EVs: 252+ SpA / 4 SpD / 252- Atk
```

A trailing `+` or `-` on an EV number marks the increased or decreased nature stat. One of each on distinct non-HP stats infers the nature (`Modest` here). An explicit `Modest Nature` line takes precedence regardless of order. Incomplete modifier pairs do not infer a nature; conflicting modifiers, HP modifiers, and modifiers on IVs produce diagnostics.

### Hidden Power and happiness inference

```text
Hidden Power: Fire
Happiness: 200
- Hidden Power [Ice]
- Frustration
```

The bracketed move becomes `"Hidden Power Ice"` in `moves`. Without an explicit `Hidden Power:` line, it also sets `hpType` to `"Ice"`. Here, `hpType` remains `"Fire"` because the explicit field wins. Likewise, `Frustration` normally sets happiness to 0, but the explicit happiness remains 200. Explicit fields take precedence whether they appear before or after the moves.

Export writes `"Hidden Power Ice"` as `- Hidden Power [Ice]`. Koffing does not infer Hidden Power IVs. JSON import does not infer `hpType` from a move or happiness from `Frustration`; include those fields explicitly when needed.

## JSON shapes and team fields

`parseJSON` accepts JSON text or plain JavaScript data in any of these shapes:

```json
{ "species": "Koffing", "moves": [] }
```

```json
[{ "species": "Koffing", "moves": ["Sludge Bomb"] }]
```

```json
{
  "name": "First team",
  "format": "gen9ou",
  "folder": "Examples",
  "pokemon": [{ "species": "Koffing", "moves": ["Sludge Bomb"] }]
}
```

```json
{
  "teams": [
    {
      "name": "First team",
      "pokemon": [
        {
          "species": "Koffing",
          "name": "Smogon",
          "item": "Eviolite",
          "ability": "Levitate",
          "gender": "F",
          "moves": ["Sludge Bomb", "Will-O-Wisp"],
          "nature": "Bold",
          "evs": { "hp": 252, "def": 252, "spd": 4 },
          "ivs": { "atk": 0 },
          "level": 50,
          "shiny": true,
          "happiness": 200,
          "pokeball": "Poke Ball",
          "hpType": "Ice",
          "dynamaxLevel": 10,
          "gigantamax": false,
          "teraType": "Poison"
        }
      ]
    }
  ]
}
```

| Team field | Type           | Meaning                                                       |
| ---------- | -------------- | ------------------------------------------------------------- |
| `pokemon`  | `PokemonSet[]` | Required member list; can be empty.                           |
| `name`     | `string`       | Optional team title. Separate from a Pokémon's nickname.      |
| `format`   | `string`       | Optional format identifier from the header, such as `gen9ou`. |
| `folder`   | `string`       | Optional folder path; may contain `/` for nested folders.     |

A top-level array always means Pokémon sets, not teams. Wrap multiple teams in `{ "teams": [...] }`. The collection wrapper supports only `teams`.

JSON numbers must be numbers, not quoted strings, and flags must be booleans, not `"Yes"` or `"No"`. Known string values must already be trimmed and contain no control characters. `null` is not a substitute for an omitted optional field. Unknown fields at collection, team, set, or stat level are omitted with diagnostics in permissive mode and rejected in strict mode. The old `name`-as-species / `nickname` schema is not supported.

## Results, diagnostics, and export

Both parsers return `{ teams, diagnostics }`, even when importing a single Pokémon. Each diagnostic has `code`, `severity` (`"warning"` or `"error"`), and `message`, with optional one-based `line` for text or a `path` identifying a data field. To save a collection for re-import, serialize `{ teams: result.teams }`; `diagnostics` is result metadata, not an accepted collection field.

In permissive mode, unsupported text lines and invalid detail values produce diagnostics. Repeated fields use the last accepted value and report a duplicate; repeated EV/IV lines replace the entire corresponding stat table. Move lines append instead of replacing earlier moves. Strict mode throws `KoffingError` on diagnostics. Invalid JSON shapes/types, resource-limit violations, and packed team strings fail in either mode.

`exportTeam(pokemon)` emits Pokémon separated by blank lines without team metadata. `exportTeams(teams)` preserves team boundaries and metadata with headers, omitting the header for a single nonempty team without metadata. Exports normalize formatting and aliases; they do not preserve original whitespace. Empty optional strings and empty stat tables may not survive a text round trip, and unrepresentable empty fields are rejected.

Export revalidates data and rejects unknown fields and ambiguous text rather than silently losing them. In particular, pipes are unsupported, identity fields cannot contain header delimiters such as `@`, parentheses, or brackets, and team names cannot contain `/` (use `folder`). `No Item` is reserved text syntax rather than an exportable item name. Packed Showdown strings are not supported; use Showdown's pack/unpack APIs separately.
