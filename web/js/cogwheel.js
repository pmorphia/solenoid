/* Cogwheel (.cw) in JavaScript: Markdown where headings are sections and quote lines with `=`
 * are entries. Reads a document and changes single entries, leaving every other line as it was.
 * The format: https://github.com/pmorphia/cogwheel (SPEC.md). */
(function (root) {
"use strict";

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ENTRY = /^ {0,3}>[ \t]*([^=]*?)[ \t]*=[ \t]*(.*?)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function unquote(text) {
  if (text.length < 2 || text[0] !== '"' || text[text.length - 1] !== '"') return text;
  let out = "";
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c !== "\\" || i + 1 >= text.length - 1) { out += c; continue; }
    const n = text[++i];
    out += n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n;
  }
  return out;
}

function quote(value) {
  value = String(value);
  if (value === "" || value !== value.trim() || value[0] === '"' || /[\r\n]/.test(value))
    return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
  return value;
}

/* parse(text) -> { sections: [{ name, level, line, path, entries: [{ key, value, line }] }] }
 * The first section (name "", level 0) holds entries before any heading. */
function parse(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const sections = [{ name: "", level: 0, line: -1, path: [], entries: [] }];
  const stack = [sections[0]];
  let fence = null;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null; return; }
    if (f) { fence = f[1]; return; }
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1].length;
      const name = (h[2] || "").replace(/[ \t]+#+$/, "").trim();
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const section = { name, level, line: i, path: stack.slice(1).map(s => s.name).concat(name), entries: [] };
      sections.push(section);
      stack.push(section);
      return;
    }
    const e = ENTRY.exec(line);
    if (e && e[1] !== "") stack[stack.length - 1].entries.push({ key: e[1], value: unquote(e[2]), line: i });
  });
  return new Document(lines, sections);
}

class Document {
  constructor(lines, sections) { this.lines = lines; this.sections = sections; }

  /* The first section with this name, at any depth (case-insensitive). */
  section(name) {
    const wanted = String(name).toLowerCase();
    return this.sections.find(s => s.name.toLowerCase() === wanted) || null;
  }

  /* The value of `key` in the section `name`, or `fallback`. */
  get(name, key, fallback) {
    const section = this.section(name);
    if (!section) return fallback;
    const wanted = String(key).toLowerCase();
    const entry = section.entries.find(e => e.key.toLowerCase() === wanted);
    return entry ? entry.value : fallback;
  }

  bool(name, key, fallback) {
    const v = this.get(name, key);
    if (v == null) return fallback;
    if (/^(true|yes|on|1)$/i.test(v)) return true;
    if (/^(false|no|off|0)$/i.test(v)) return false;
    return fallback;
  }

  number(name, key, fallback) {
    const v = this.get(name, key);
    const n = v == null ? NaN : Number(String(v).replace(/_/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }

  /* Every entry of a section as { key: value } with lower-case keys. */
  entries(name) {
    const section = this.section(name);
    const out = {};
    if (section) for (const e of section.entries) if (!(e.key.toLowerCase() in out)) out[e.key.toLowerCase()] = e.value;
    return out;
  }

  /* The document text with one entry changed (or added at the end of its section). */
  set(name, key, value) {
    const lines = this.lines.slice();
    let section = this.section(name);
    const written = "> " + key + " = " + quote(value);
    if (section) {
      const entry = section.entries.find(e => e.key.toLowerCase() === String(key).toLowerCase());
      if (entry) { lines[entry.line] = written; return lines.join("\n"); }
      // After the section's last entry, or after its heading and text, before its subsections.
      const index = this.sections.indexOf(section);
      const next = this.sections.slice(index + 1).find(s => true);
      let at = section.entries.length ? section.entries[section.entries.length - 1].line + 1 : (next ? next.line : lines.length);
      while (at > 0 && lines[at - 1].trim() === "" && at - 1 > section.line) at--;
      lines.splice(at, 0, "", written);
      if (lines[at + 2] !== undefined && lines[at + 2].trim() !== "") lines.splice(at + 2, 0, "");
      return lines.join("\n");
    }
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", "## " + name, "", written, "");
    return lines.join("\n");
  }
}

root.Cogwheel = { parse, quote, unquote };
})(typeof self !== "undefined" ? self : this);
