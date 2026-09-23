export type StatID = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type Stats = Partial<Record<StatID, number>>;

/** Showdown-compatible sparse set. `name` is the nickname, never the species. */
export interface PokemonSet {
  species: string;
  name?: string;
  item?: string;
  ability?: string;
  gender?: "M" | "F" | "N" | "";
  moves: string[];
  nature?: string;
  evs?: Stats;
  ivs?: Stats;
  level?: number;
  shiny?: boolean;
  happiness?: number;
  pokeball?: string;
  hpType?: string;
  dynamaxLevel?: number;
  gigantamax?: boolean;
  teraType?: string;
}

/** Metadata belongs to the collection wrapper, not to Showdown's set array. */
export interface Team {
  name?: string;
  format?: string;
  folder?: string;
  pokemon: PokemonSet[];
}

export interface Diagnostic {
  code: string;
  severity: "warning" | "error";
  message: string;
  /** One-based source line, when the input is text. */
  line?: number;
  path?: string;
}

export interface Limits {
  /** UTF-16 code units, checked before splitting or JSON decoding. */
  maxInputLength: number;
  maxLineLength: number;
  maxTeams: number;
  maxPokemon: number;
  maxMoves: number;
  maxDiagnostics: number;
}

export interface Options {
  /** Strict mode throws on any diagnostic; permissive mode returns them. */
  mode?: "strict" | "permissive";
  limits?: Partial<Limits>;
}

export interface ParseResult {
  teams: Team[];
  diagnostics: Diagnostic[];
}

export interface SanitizeOptions extends Options {
  maxLevel?: number;
  maxMovesPerPokemon?: number;
}
