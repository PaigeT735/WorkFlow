/**
 * A small, dependency-free highlighter for the languages the analyzer reads
 * (TypeScript, JavaScript, JSX) plus JSON. It colours tokens; it never
 * changes the text, so what the viewer shows is exactly the file on disk.
 */
export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "type"
  | "function"
  | "property"
  | "tag"
  | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "from", "function", "get", "if", "implements", "import", "in", "instanceof",
  "interface", "keyof", "let", "module", "namespace", "new", "null", "of", "private", "protected",
  "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw",
  "true", "try", "type", "typeof", "undefined", "var", "void", "while", "with", "yield",
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && (kind === "plain" || kind === "punct")) last.text += text;
    else tokens.push({ kind, text });
  };
  let i = 0;
  const n = source.length;
  let previousSignificant = "";

  while (i < n) {
    const ch = source[i] ?? "";
    const next = source[i + 1] ?? "";

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      push("comment", source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      push("comment", source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        const c = source[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === ch) {
          j += 1;
          break;
        }
        if (c === "\n" && ch !== "`") break;
        j += 1;
      }
      push("string", source.slice(i, j));
      previousSignificant = "x";
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch) && !IDENT_PART.test(source[i - 1] ?? " ")) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(source[j] ?? "")) j += 1;
      push("number", source.slice(i, j));
      previousSignificant = "x";
      i = j;
      continue;
    }
    if (ch === "<" && (IDENT_START.test(next) || next === "/" || next === ">")) {
      // JSX-looking tag: `<Button`, `</div`, `<>`. A comparison (`a < b`) or a
      // generic (`Array<string>`) follows a value, so it is left alone.
      const prev = previousSignificant;
      const startsTag =
        next === "/" || prev === "" || prev === "return" || prev === ">" || /^[([{,=:?&|!]$/.test(prev);
      if (startsTag) {
        const open = next === "/" ? 2 : 1;
        let j = i + open;
        while (j < n && /[\w$.:-]/.test(source[j] ?? "")) j += 1;
        push("punct", source.slice(i, i + open));
        const name = source.slice(i + open, j);
        if (name) push("tag", name);
        previousSignificant = "<";
        i = j;
        continue;
      }
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(source[j] ?? "")) j += 1;
      const word = source.slice(i, j);
      let k = j;
      while (k < n && (source[k] === " " || source[k] === "\t")) k += 1;
      const before = source[i - 1] ?? "";
      const after = source[k] ?? "";
      const afterNext = source[k + 1] ?? "";
      let kind: TokenKind = "plain";
      if (before === ".") kind = after === "(" ? "function" : "property";
      else if (KEYWORDS.has(word)) kind = "keyword";
      else if (after === "(") kind = "function";
      else if (/^[A-Z]/.test(word)) kind = "type";
      else if (after === "=" && (afterNext === "{" || afterNext === '"' || afterNext === "'")) kind = "property";
      push(kind, word);
      previousSignificant = word === "return" ? "return" : "x";
      i = j;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < n && /\s/.test(source[j] ?? "")) j += 1;
      push("plain", source.slice(i, j));
      i = j;
      continue;
    }
    push("punct", ch);
    previousSignificant = ch;
    i += 1;
  }
  return tokens;
}

/** Tokens split into lines, so each line can carry its own number. */
export function highlightLines(source: string): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokenize(source)) {
    const parts = token.text.split("\n");
    parts.forEach((part, position) => {
      if (position > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1]?.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
