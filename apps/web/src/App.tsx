import { useState } from "react";
import { exportTeams, KoffingError, parse, parseJSON, type Diagnostic } from "koffing";

const example = `=== [gen9] Example team ===

Smogon (Koffing) (F) @ Eviolite
Ability: Levitate
Level: 5
Tera Type: Poison
EVs: 36 HP / 236 Def / 236 SpD
Bold Nature
IVs: 0 Atk
- Will-O-Wisp
- Pain Split
- Sludge Bomb
- Fire Blast`;

type InputFormat = "showdown" | "json";

function convert(input: string, format: InputFormat, strict: boolean) {
  const empty = {
    output: "",
    formatted: "",
    error: "",
    diagnostics: [] as Diagnostic[],
    summary: "Ready when you are",
  };
  if (!input.trim()) return empty;
  try {
    const options = { mode: strict ? ("strict" as const) : ("permissive" as const) };
    const parsed = format === "json" ? parseJSON(input, options) : parse(input, options);
    const count = parsed.teams.reduce((total, team) => total + team.pokemon.length, 0);
    const first = parsed.teams[0];
    const json = JSON.stringify(
      parsed.teams.length === 1 &&
        first &&
        first.name === undefined &&
        first.format === undefined &&
        first.folder === undefined
        ? first.pokemon
        : { teams: parsed.teams },
      null,
      2,
    );
    const showdown = exportTeams(parsed.teams);
    return {
      output: format === "json" ? showdown : json,
      formatted: format === "json" ? JSON.stringify(JSON.parse(input), null, 2) : showdown,
      error: "",
      diagnostics: parsed.diagnostics,
      summary: `${parsed.teams.length} team${parsed.teams.length === 1 ? "" : "s"} · ${count} Pokémon`,
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "Unable to convert this input.",
      diagnostics: error instanceof KoffingError ? error.diagnostics : [],
      summary: "Check your input",
    };
  }
}

export function App() {
  const [input, setInput] = useState(example);
  const [format, setFormat] = useState<InputFormat>("showdown");
  const [notice, setNotice] = useState("");
  const [strict, setStrict] = useState(false);
  const { output, formatted, error, diagnostics, summary } = convert(input, format, strict);

  function updateInput(value: string) {
    setInput(value);
    setNotice("");
  }

  function swap() {
    updateInput(output);
    setFormat(format === "showdown" ? "json" : "showdown");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Clipboard unavailable. Select and copy the output manually.");
    }
  }

  return (
    <main>
      <header className="masthead">
        <a className="brand" href="./" aria-label="Koffing home">
          <img
            className="koffing-sprite"
            src={`${import.meta.env.BASE_URL}koffing.png`}
            width="48"
            height="48"
            alt=""
          />
          <h1>
            Koffing <span>— Pokémon Showdown Team Parser</span>
          </h1>
        </a>
        <a href="https://github.com/itsjavi/koffing">
          Source code <span aria-hidden="true">↗</span>
        </a>
      </header>
      <div className="workspace-toolbar">
        <div className="format-control">
          <label htmlFor="input-format">Convert from</label>
          <select
            id="input-format"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as InputFormat);
              setNotice("");
            }}
          >
            <option value="showdown">Showdown</option>
            <option value="json">JSON</option>
          </select>
          <button onClick={swap} disabled={!output || !!error || diagnostics.length > 0}>
            Swap direction <span aria-hidden="true">⇄</span>
          </button>
        </div>
        <label className="strict-control">
          <input
            type="checkbox"
            checked={strict}
            onChange={(event) => {
              setStrict(event.target.checked);
              setNotice("");
            }}
          />{" "}
          Strict parsing
        </label>
        <span className="summary">{summary}</span>
      </div>
      <div className="editors">
        <section className="editor" aria-labelledby="input-label">
          <div className="editor-heading">
            <label id="input-label" htmlFor="input">
              {format === "showdown" ? "Showdown" : "JSON"} input
            </label>
          </div>
          <textarea
            id="input"
            value={input}
            onChange={(event) => updateInput(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            placeholder="Paste your team here…"
            aria-invalid={!!error}
            aria-describedby={error ? "conversion-error" : undefined}
          />
          <div className="editor-actions">
            <button
              disabled={!input.trim() || !!error || diagnostics.length > 0}
              onClick={() => updateInput(formatted)}
            >
              Format input
            </button>
            <button className="quiet" onClick={() => updateInput("")}>
              Clear
            </button>
            <button
              className="quiet example"
              onClick={() => {
                setFormat("showdown");
                updateInput(example);
              }}
            >
              Load example
            </button>
          </div>
        </section>
        <section className="editor" aria-labelledby="output-label">
          <div className="editor-heading">
            <label id="output-label" htmlFor="output">
              {format === "showdown" ? "JSON" : "Showdown"} output
            </label>
          </div>
          <textarea
            id="output"
            value={output}
            readOnly
            spellCheck={false}
            placeholder="Your converted team will appear here."
          />
          <div className="editor-actions">
            <button className="primary" disabled={!output} onClick={copy}>
              Copy output <span aria-hidden="true">↗</span>
            </button>
            <span className="local-note">Processed on your device</span>
          </div>
        </section>
      </div>
      {error && (
        <p id="conversion-error" className="error" role="alert">
          {error}
        </p>
      )}
      {diagnostics.length > 0 && (
        <aside className="diagnostics" aria-label="Parsing issues">
          <p>
            {diagnostics.length} parsing {diagnostics.length === 1 ? "issue" : "issues"}. Review
            these before using the output. Formatting and swapping are disabled while issues remain.
          </p>
          <ul>
            {diagnostics.slice(0, 20).map((diagnostic, index) => (
              <li key={index}>
                {diagnostic.line
                  ? `Line ${diagnostic.line}: `
                  : diagnostic.path
                    ? `${diagnostic.path}: `
                    : ""}
                {diagnostic.message}
              </li>
            ))}
          </ul>
          {diagnostics.length > 20 && <p>{diagnostics.length - 20} additional issues.</p>}
        </aside>
      )}
      <p className="notice" role="status">
        {notice}
      </p>
      <footer>
        <span>Pokémon Showdown ↔ JSON</span>
        <span>Open source · MIT licensed</span>
      </footer>
    </main>
  );
}
