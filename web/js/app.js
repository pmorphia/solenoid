/* Solenoid: the IDE. The editor is CodeMirror 6 (vendor/codemirror.js); files and programs come
 * from a host (js/hosts.js): the Flywheel host on this machine, or the browser itself. */
(async function () {
"use strict";

const { $, $$, el, escapeHtml, icon, Sound, Wheel, toast, ask, menu, fuzzy, Palette } = UI;
const { EditorState, Compartment } = CM.state;
const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, hoverTooltip, Decoration, ViewPlugin } = CM.view;
const { syntaxHighlighting, HighlightStyle, StreamLanguage, LanguageSupport, indentUnit, bracketMatching, foldGutter, indentOnInput, foldKeymap } = CM.language;
const { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, snippetCompletion, completeAnyWord } = CM.autocomplete;
const t = CM.highlight.tags;
const FL = FlywheelLang;

UI.mountIcons(document);
Wheel.attach($("#wheel"));

/* ================================================================== the host */

const query = new URLSearchParams(location.search);
let token = query.get("t");
try {
  if (token) { sessionStorage.setItem("solenoid-token", token); history.replaceState(null, "", location.pathname); }
  else token = sessionStorage.getItem("solenoid-token");
} catch (e) { /* storage is unavailable; the token from the address is used */ }

let host;
if (token) host = new SolenoidHosts.LocalHost(token);
else {
  // Served by the Flywheel host, but without its token? (GitHub Pages answers this differently.)
  let local = false;
  try {
    const probe = await fetch("/api/info", { method: "POST", body: "{}" });
    local = probe.status === 403 && /json/.test(probe.headers.get("content-type") || "");
  } catch (e) { local = false; }
  if (local) {
    document.body.replaceChildren(el("div.preview-note", { style: { padding: "40px", textAlign: "center", lineHeight: "1.8" } },
      el("div", el("h2", { text: "Solenoid" }), "Open the address that ", el("code", { text: "solenoid serve" }), " printed: it carries this session's key (", el("code", { text: "?t=…" }), ").")));
    return;
  }
  host = new SolenoidHosts.BrowserHost();
  await host.load();
}
const isWeb = host.kind === "web";
let info;
try { info = await host.call("info"); }
catch (e) {
  document.body.replaceChildren(el("div.preview-note", { style: { padding: "40px", textAlign: "center" } }, "Solenoid could not reach its host: " + e.message));
  return;
}

/* A path as the editor names it: relative to the project when it is inside it. */
function rel(path) {
  if (!path) return "";
  if (info.root && path.startsWith(info.root + "/")) return path.slice(info.root.length + 1);
  return path;
}
const baseName = path => path.split("/").pop();
const dirName = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const extension = path => { const name = baseName(path); return name.includes(".") ? name.split(".").pop().toLowerCase() : ""; };
const joinPath = (dir, name) => dir ? dir + "/" + name : name;
function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return (path.startsWith("/") ? "/" : "") + out.join("/");
}
const shellQuote = text => /^[\w@%+=:,./-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\''") + "'";
const debounce = (f, ms) => { let timer; return (...a) => { clearTimeout(timer); timer = setTimeout(() => f(...a), ms); }; };

/* ================================================================== settings (solenoid.cw) */

const SETTINGS = "\u0000settings";
const defaults = Cogwheel.parse(info.defaultConfig || "");
let configText = info.config || info.defaultConfig || "";
let conf = Cogwheel.parse(configText);
const setting = (section, key) => { const v = conf.get(section, key); return v != null ? v : defaults.get(section, key, ""); };
const flag = (section, key) => { const v = conf.bool(section, key, null); return v != null ? v : defaults.bool(section, key, false); };
const number = (section, key, fallback) => { const v = conf.number(section, key, NaN); return Number.isFinite(v) ? v : defaults.number(section, key, fallback); };
let darkTheme = true;
let shortcuts = {};      // "Ctrl+S" -> command id

/* ================================================================== languages */

const flywheelLanguage = StreamLanguage.define(FL.mode);
const legacy = name => () => StreamLanguage.define(CM.legacy[name]);
const LANGUAGES = [
  { id: "flywheel", name: "Flywheel", ext: ["fw", "fly"], load: () => new LanguageSupport(flywheelLanguage, [flywheelLanguage.data.of({ autocomplete: flywheelSource })]) },
  { id: "cogwheel", name: "Cogwheel", ext: ["cw"], load: () => [CM.markdown(), cogwheelMarks] },
  { id: "python", name: "Python", ext: ["py", "pyw"], load: () => CM.python() },
  { id: "javascript", name: "JavaScript", ext: ["js", "mjs", "cjs", "jsx"], load: () => CM.javascript({ jsx: true }) },
  { id: "typescript", name: "TypeScript", ext: ["ts", "tsx"], load: () => CM.javascript({ typescript: true, jsx: true }) },
  { id: "html", name: "HTML", ext: ["html", "htm"], load: () => CM.html() },
  { id: "css", name: "CSS", ext: ["css", "scss", "less"], load: () => CM.css() },
  { id: "json", name: "JSON", ext: ["json", "jsonc", "lock"], load: () => CM.json() },
  { id: "markdown", name: "Markdown", ext: ["md", "markdown"], load: () => CM.markdown() },
  { id: "cpp", name: "C/C++", ext: ["c", "h", "cpp", "cc", "cxx", "hpp", "hh"], load: () => CM.cpp() },
  { id: "rust", name: "Rust", ext: ["rs"], load: () => CM.rust() },
  { id: "java", name: "Java", ext: ["java"], load: () => CM.java() },
  { id: "go", name: "Go", ext: ["go"], load: () => CM.go() },
  { id: "php", name: "PHP", ext: ["php"], load: () => CM.php() },
  { id: "sql", name: "SQL", ext: ["sql"], load: () => CM.sql() },
  { id: "xml", name: "XML", ext: ["xml", "svg", "xsl"], load: () => CM.xml() },
  { id: "yaml", name: "YAML", ext: ["yaml", "yml"], load: () => CM.yaml() },
  { id: "toml", name: "TOML", ext: ["toml"], load: legacy("toml") },
  { id: "shell", name: "Shell", ext: ["sh", "bash", "zsh"], load: legacy("shell") },
  { id: "lua", name: "Lua", ext: ["lua"], load: legacy("lua") },
  { id: "ruby", name: "Ruby", ext: ["rb"], load: legacy("ruby") },
  { id: "csharp", name: "C#", ext: ["cs"], load: legacy("csharp") },
  { id: "kotlin", name: "Kotlin", ext: ["kt", "kts"], load: legacy("kotlin") },
  { id: "scala", name: "Scala", ext: ["scala"], load: legacy("scala") },
  { id: "dart", name: "Dart", ext: ["dart"], load: legacy("dart") },
  { id: "swift", name: "Swift", ext: ["swift"], load: legacy("swift") },
  { id: "diff", name: "Diff", ext: ["diff", "patch"], load: legacy("diff") },
  { id: "properties", name: "Properties", ext: ["ini", "conf", "properties", "env"], load: legacy("properties") },
  { id: "powershell", name: "PowerShell", ext: ["ps1"], load: legacy("powerShell") },
  { id: "perl", name: "Perl", ext: ["pl", "pm"], load: legacy("perl") },
];
const PLAIN = { id: "text", name: "Plain text", ext: [], load: () => [] };
function languageOf(path) {
  if (path === SETTINGS) return LANGUAGES[1];
  const name = baseName(path), ext = extension(path);
  if (name === "Dockerfile") return { id: "dockerfile", name: "Dockerfile", ext: [], load: legacy("dockerFile") };
  if (name === "Makefile" || name === ".gitignore") return PLAIN;
  return LANGUAGES.find(l => l.ext.includes(ext)) || PLAIN;
}
const supportCache = new Map();
function support(language) {
  if (!supportCache.has(language.id)) {
    let loaded;
    try { loaded = language.load(); } catch (e) { loaded = []; }
    supportCache.set(language.id, [loaded, language.id === "flywheel" ? [] : EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }])]);
  }
  return supportCache.get(language.id);
}

/* Cogwheel files: entries (`> key = value`) stand out from the Markdown around them. */
const entryKey = Decoration.mark({ class: "cm-fw-entry" }), entryValue = Decoration.mark({ class: "cm-fw-entry-value" });
const cogwheelMarks = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
  build(view) {
    const ranges = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        const m = /^( {0,3}>\s*)([^=]+?)(\s*=\s*)(.*)$/.exec(line.text);
        if (m) {
          const k = line.from + m[1].length, v = k + m[2].length + m[3].length;
          ranges.push(entryKey.range(k, k + m[2].length));
          if (m[4]) {
            if (/^#[0-9a-fA-F]{3,8}$/.test(m[4].trim()))
              ranges.push(Decoration.widget({ widget: new ColorChip(m[4].trim()), side: -1 }).range(v));
            ranges.push(entryValue.range(v, line.to));
          }
        }
        pos = line.to + 1;
      }
    }
    return Decoration.set(ranges, true);
  }
}, { decorations: v => v.decorations });
class ColorChip extends CM.view.WidgetType {
  constructor(color) { super(); this.color = color; }
  eq(other) { return other.color === this.color; }
  toDOM() { return el("span.cm-color-chip", { style: { background: this.color } }); }
}

/* ================================================================== the editor */

const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--s-keyword)" },
  { tag: [t.self, t.atom], color: "var(--s-keyword)", fontStyle: "italic" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--s-type)" },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: "var(--s-string)" },
  { tag: [t.escape, t.special(t.brace)], color: "var(--s-constant)" },
  { tag: [t.number, t.bool, t.null, t.unit], color: "var(--s-number)" },
  { tag: [t.comment, t.meta, t.processingInstruction], color: "var(--s-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName, t.labelName], color: "var(--s-function)" },
  { tag: t.definition(t.function(t.variableName)), color: "var(--s-function)", fontWeight: "700" },
  { tag: t.definition(t.typeName), color: "var(--s-type)", fontWeight: "700" },
  { tag: [t.constant(t.variableName), t.standard(t.variableName), t.color], color: "var(--s-constant)" },
  { tag: [t.variableName, t.propertyName], color: "var(--s-variable)" },
  { tag: [t.operator, t.punctuation, t.separator, t.derefOperator], color: "var(--s-operator)" },
  { tag: [t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace], color: "var(--s-operator)" },
  { tag: [t.tagName], color: "var(--s-tag)" },
  { tag: [t.attributeName], color: "var(--s-attribute)" },
  { tag: [t.attributeValue], color: "var(--s-string)" },
  { tag: t.heading, color: "var(--s-function)", fontWeight: "700" },
  { tag: [t.link, t.url], color: "var(--s-type)", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, color: "var(--s-string)" },
  { tag: t.monospace, color: "var(--s-constant)" },
  { tag: t.invalid, color: "var(--err)" },
  { tag: [t.inserted], color: "var(--ok)" },
  { tag: [t.deleted], color: "var(--err)" },
]);

const editorTheme = EditorView.theme({
  "&": { color: "var(--fg)", backgroundColor: "var(--bg)" },
  ".cm-content": { caretColor: "var(--acc)", padding: "6px 0 40vh" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--acc)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--sel)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--fg) 4%, transparent)" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--faint)", border: "none", paddingLeft: "6px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 8px", minWidth: "32px" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--faint)", cursor: "pointer", padding: "0 4px 0 0" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--acc) 22%, transparent)", outline: "none", borderRadius: "2px" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "color-mix(in srgb, var(--err) 30%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--fg) 10%, transparent)", borderRadius: "2px" },
  ".cm-line": { padding: "0 14px 0 4px" },
});

const C = { language: new Compartment(), tab: new Compartment(), wrap: new Compartment(), numbers: new Compartment(), active: new Compartment(),
  brackets: new Compartment(), dark: new Compartment(), lint: new Compartment() };

const tabs = [];
let active = null;
let view = null;
const problems = new Map();   // path -> [{ line, column, severity, message, source }]

function editorSettings() {
  const size = Math.max(1, Math.min(8, number("Editor", "tab size", 4)));
  return {
    tab: [EditorState.tabSize.of(size), indentUnit.of(" ".repeat(size))],
    wrap: flag("Editor", "word wrap") ? EditorView.lineWrapping : [],
    numbers: flag("Editor", "line numbers") ? [lineNumbers(), highlightActiveLineGutter()] : [],
    active: flag("Editor", "highlight active line") ? highlightActiveLine() : [],
    brackets: flag("Editor", "close brackets") ? closeBrackets() : [],
    dark: EditorView.darkTheme.of(darkTheme),
  };
}

function lintFor(language) {
  const checked = ["flywheel", "json"].concat(isWeb ? [] : ["python", "javascript"]);
  if (!checked.includes(language.id)) return [];
  return [CM.lint.linter(lintSource, { delay: 450 }), CM.lint.lintGutter()];
}

function extensions(path, language) {
  const s = editorSettings();
  return [
    C.numbers.of(s.numbers), highlightSpecialChars(), CM.commands.history(), foldGutter({ openText: "⌄", closedText: "›" }), drawSelection(), dropCursor(),
    EditorState.allowMultipleSelections.of(true), indentOnInput(), syntaxHighlighting(highlightStyle), bracketMatching(), C.brackets.of(s.brackets),
    autocompletion({ activateOnTyping: true, icons: true, maxRenderedOptions: 60, defaultKeymap: true }),
    rectangularSelection(), crosshairCursor(), C.active.of(s.active), CM.search.highlightSelectionMatches(), CM.search.search({ top: true }),
    keymap.of([{ key: "F12", run: v => { goToDefinition(v.state.selection.main.head); return true; } },
      ...closeBracketsKeymap, ...CM.commands.defaultKeymap, ...CM.search.searchKeymap, ...CM.commands.historyKeymap, ...foldKeymap, ...completionKeymap, ...CM.lint.lintKeymap, CM.commands.indentWithTab]),
    C.tab.of(s.tab), C.wrap.of(s.wrap), C.language.of(support(language)), C.lint.of(lintFor(language)), editorTheme, C.dark.of(s.dark),
    EditorView.updateListener.of(onUpdate),
    EditorView.domEventHandlers({ mousedown(event, v) {
      if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
      const pos = v.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      setTimeout(() => goToDefinition(pos));
      return false;
    } }),
    hoverTooltip(hoverSource, { hoverTime: 350 }),
  ];
}

function createState(path, text) {
  return EditorState.create({ doc: text, extensions: extensions(path, languageOf(path)) });
}

view = new EditorView({ parent: $("#editor"), state: EditorState.create({ doc: "" }) });

/* Applies a change of settings to every open file. */
function reconfigureAll() {
  const s = editorSettings();
  const effects = () => [C.tab.reconfigure(s.tab), C.wrap.reconfigure(s.wrap), C.numbers.reconfigure(s.numbers), C.active.reconfigure(s.active), C.brackets.reconfigure(s.brackets), C.dark.reconfigure(s.dark)];
  for (const tab of tabs) {
    if (tab === active) view.dispatch({ effects: effects() });
    else tab.state = tab.state.update({ effects: effects() }).state;
  }
}

function onUpdate(update) {
  if (!active || update.view !== view) return;
  if (update.docChanged) {
    const wasDirty = active.dirty;
    active.dirty = !update.state.doc.eq(active.saved);
    if (wasDirty !== active.dirty) renderTabs();
    for (const tr of update.transactions) {
      if (tr.isUserEvent("input.type") || tr.isUserEvent("input.paste")) { Wheel.push(tr.isUserEvent("input.paste") ? 160 : 46); Sound.play(/\n/.test(tr.newDoc.sliceString(Math.max(0, tr.newSelection.main.head - 1), tr.newSelection.main.head)) ? "enter" : "key"); }
      else if (tr.isUserEvent("delete")) { Wheel.push(24); Sound.play("delete"); }
    }
    refreshOutline();
    if (active.path === SETTINGS) previewSettings();
    scheduleAutoSave();
    saveSession();
  }
  if (update.selectionSet || update.docChanged) { renderPosition(); markOutline(); }
}

/* ------------------------------------------------------------------ suggestions, hover, definitions */

const moduleCache = new Map();    // "dir|module" -> { path, symbols } or null while unknown
let fileList = [];                 // every file of the project (for the palette and imports)
let packageNames = [];

function moduleKey(module) { return dirName(active ? active.path : "") + "|" + module; }

/* The file a Flywheel `import` loads, looked for as the compiler does. */
async function resolveModule(module, fromDir) {
  const base = module.replace(/\.(fw|fly)$/, "").replace(/\./g, "/");
  const root = base.split("/")[0], rest = base.split("/").slice(1).join("/");
  const candidates = [joinPath(fromDir, base + ".fw"), joinPath(fromDir, base + ".fly"), base + ".fw",
    rest ? `.flywheel-modules/${root}/${rest}.fw` : `.flywheel-modules/${root}/${root}.fw`, `.flywheel-modules/${root}/main.fw`, `.flywheel-modules/${root}/lib.fw`];
  for (const path of candidates) {
    const open = tabs.find(x => x.path === path);
    try {
      const text = open ? (open === active ? view.state : open.state).doc.toString() : (await host.call("fs/read", { path })).text;
      if (text != null) return { path, symbols: FL.symbols(text) };
    } catch (e) { /* try the next place */ }
  }
  return null;
}

const flywheelEnv = {
  modules() {
    const dir = dirName(active ? active.path : "");
    const names = fileList.filter(f => dirName(f) === dir && /\.(fw|fly)$/.test(f) && f !== (active && active.path)).map(f => baseName(f).replace(/\.(fw|fly)$/, ""));
    return names.concat(packageNames);
  },
  moduleSymbols(module) {
    const key = moduleKey(module);
    if (!moduleCache.has(key)) {
      moduleCache.set(key, null);
      resolveModule(module, dirName(active ? active.path : "")).then(found => { if (found) moduleCache.set(key, found); else moduleCache.delete(key); setTimeout(() => moduleCache.get(key) === null && moduleCache.delete(key), 4000); });
      return null;
    }
    const found = moduleCache.get(key);
    return found ? found.symbols : null;
  },
};
/* Loads the modules a file imports ahead of time, so suggestions after `module.` are ready. */
function warmModules(text) {
  for (const s of FL.symbols(text)) if (s.kind === "module" && !FL.LIBRARY[s.module]) flywheelEnv.moduleSymbols(s.module);
}

function flywheelSource(context) {
  if (!flag("Editor", "suggestions") && !context.explicit) return null;
  const text = context.state.doc.toString();
  const result = FL.completions(text, context.pos, flywheelEnv);
  if (!result) return null;
  const before = text.slice(Math.max(0, context.pos - 1), context.pos);
  if (!context.explicit && result.from === context.pos && !/[.<\/ ]/.test(before)) return null;
  if (!context.explicit && before === " " && !/^\s*import(\+\+)?\s+$/.test(context.state.doc.lineAt(context.pos).text.slice(0, context.pos - context.state.doc.lineAt(context.pos).from))) return null;
  const options = result.options.map(o => {
    if (o.snippet) return snippetCompletion(o.snippet, { label: o.label, detail: o.detail, type: "text", boost: o.boost });
    if (o.addImport) return { label: o.label, detail: o.detail, info: o.info, type: o.type, boost: o.boost, apply(v, completion, from, to) {
      const lines = v.state.doc.toString().split("\n");
      let at = 0, offset = 0;
      lines.forEach((line, i) => { if (/^\s*import\b/.test(line)) at = i + 1; });
      for (let i = 0; i < at; i++) offset += lines[i].length + 1;
      v.dispatch({ changes: [{ from: offset, insert: "import " + o.addImport + "\n" }, { from, to, insert: o.label }], selection: { anchor: from + o.label.length + ("import " + o.addImport + "\n").length }, userEvent: "input.complete" });
    } };
    return { label: o.label, detail: o.detail, info: o.info, type: o.type, boost: o.boost };
  });
  return { from: result.from, options, validFor: result.validFor };
}

function hoverSource(v, pos) {
  if (!active || active.language.id !== "flywheel") return null;
  const found = FL.hover(v.state.doc.toString(), pos, flywheelEnv);
  if (!found || !found.title) return null;
  return { pos: found.from, end: found.to, above: true, create: () => ({ dom: el("div.cm-hover",
    el("div.sig", { text: found.title }), found.text ? el("div.doc", { text: found.text }) : null,
    found.line ? el("div.go", { text: "line " + found.line + " · Ctrl+click or F12 goes there" }) : null) }) };
}

async function goToDefinition(pos) {
  if (!active || active.language.id !== "flywheel") return;
  const text = view.state.doc.toString();
  const found = FL.definition(text, pos);
  if (!found) return;
  if (found.line) { jumpTo(found.line, 1); return; }
  const resolved = await resolveModule(found.module, dirName(active.path));
  if (!resolved) { toast(FL.LIBRARY[found.module] ? found.module + " is a library module of Flywheel" : "Cannot find the module " + found.module); return; }
  const symbol = resolved.symbols.find(s => s.name === found.name && !s.container);
  openFile(resolved.path, { line: symbol ? symbol.line : 1 });
}

/* ------------------------------------------------------------------ diagnostics */

async function lintSource(v) {
  if (!active || v !== view) return [];
  const tab = active, language = tab.language.id, text = v.state.doc.toString();
  if (!flag("Editor", "check while typing") || tab.path === SETTINGS) { setProblems(tab.path, "check", []); return []; }
  let found = [];
  try {
    if (language === "json") {
      if (text.trim()) found = await new SolenoidHosts.BrowserHost().call("check", { path: tab.path, text, language });
    } else found = await host.call("check", { path: tab.path, text, language });
  } catch (e) { return []; }
  if (tab !== active || v.state.doc.toString() !== text) return [];
  const byFile = new Map();
  for (const p of found) { const path = rel(p.path) || tab.path; if (!byFile.has(path)) byFile.set(path, []); byFile.get(path).push(p); }
  for (const path of [...problems.keys()]) if (!byFile.has(path) && (problems.get(path) || []).some(p => p.source === "check" && p.from === tab.path)) byFile.set(path, []);
  if (!byFile.has(tab.path)) byFile.set(tab.path, []);
  for (const [path, list] of byFile) setProblems(path, "check", list.map(p => Object.assign({}, p, { from: tab.path })));
  return (byFile.get(tab.path) || []).map(p => diagnostic(v.state, p));
}

function diagnostic(state, p) {
  const line = state.doc.line(Math.max(1, Math.min(state.doc.lines, p.line || 1)));
  let from = Math.min(line.to, line.from + Math.max(0, (p.column || 1) - 1));
  const word = /^[\w.]+|^\S/.exec(state.doc.sliceString(from, line.to));
  let to = from + (word ? word[0].length : 0);
  if (to === from) { from = line.from + (/^\s*/.exec(line.text)[0].length); to = line.to; }
  return { from, to: Math.max(to, from), severity: p.severity === "warning" ? "warning" : "error", message: p.message, source: "flywheel" };
}

function setProblems(path, source, list) {
  const kept = (problems.get(path) || []).filter(p => p.source !== source);
  const all = kept.concat(list.map(p => Object.assign({}, p, { source })));
  if (all.length) problems.set(path, all); else problems.delete(path);
  renderProblems();
}

function renderProblems() {
  const box = $("#problems");
  let errors = 0, warnings = 0;
  const groups = [];
  for (const [path, list] of problems) {
    if (!list.length) continue;
    groups.push(el("div.problem-file", { text: path === SETTINGS ? "solenoid.cw" : path }));
    for (const p of list) {
      if (p.severity === "warning") warnings++; else errors++;
      groups.push(el("div.problem" + (p.severity === "warning" ? ".warning" : ""), { onclick: () => openFile(path, { line: p.line, column: p.column }) },
        el("span.sev", { text: p.severity === "warning" ? "⚠" : "✕" }), el("span", { text: p.message }), el("span.where", { text: `${p.line}:${p.column}` })));
    }
  }
  box.replaceChildren(...(groups.length ? groups : [el("div.problems-empty", { text: "No problems in the files you have checked." })]));
  const count = $("#problem-count");
  count.hidden = errors + warnings === 0;
  count.textContent = errors + warnings;
  count.classList.toggle("warn", errors === 0);
  const item = $("#status-problems");
  item.replaceChildren(icon(errors ? "error" : "check"), ` ${errors}`, icon("warning"), ` ${warnings}`);
  item.classList.toggle("bad", errors > 0);
  renderTabs();
}

/* ================================================================== tabs and files */

function renderTabs() {
  const bar = $("#tabs");
  bar.replaceChildren(...tabs.map(tab => {
    const bad = (problems.get(tab.path) || []).some(p => p.severity !== "warning");
    const node = el("div.tab" + (tab === active ? ".active" : "") + (tab.dirty ? ".dirty" : "") + (bad ? ".problem" : ""), { title: tab.path === SETTINGS ? info.configPath : tab.path,
      onmousedown: e => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } else if (e.button === 0 && !e.target.closest(".close")) activate(tab); },
      oncontextmenu: e => { e.preventDefault(); menu(e.clientX, e.clientY, [
        { label: "Close", run: () => closeTab(tab), key: keyFor("close tab") }, { label: "Close others", run: () => closeOthers(tab) },
        { label: "Close all", run: () => closeOthers(null) }, null,
        { label: "Copy path", run: () => copyText(tab.path === SETTINGS ? info.configPath : tab.path) }, { label: "Reveal in files", run: () => reveal(tab.path) }]); } },
      el("span.dot", { style: { background: tab.path === SETTINGS ? "#f9a8d4" : UI.fileColor(tab.name) } }), el("span.name", { text: tab.name }),
      el("button.close", { title: "Close", onclick: () => closeTab(tab) }, icon("x")));
    return node;
  }));
  const current = $(".tab.active", bar);
  if (current) current.scrollIntoView({ block: "nearest", inline: "nearest" });
  $("#welcome").hidden = tabs.length > 0;
  if (!tabs.length) renderWelcome();
}

function renderCrumbs() {
  const box = $("#crumbs");
  if (!active) { box.replaceChildren(); return; }
  const parts = active.path === SETTINGS ? ["settings", "solenoid.cw"] : active.path.split("/");
  const nodes = [];
  parts.forEach((part, i) => {
    if (i) nodes.push(el("span.sep", { text: "›" }));
    nodes.push(i === parts.length - 1 ? el("span.here", { text: part }) : el("button", { text: part, onclick: () => reveal(parts.slice(0, i + 1).join("/")) }));
  });
  if (active.symbol) nodes.push(el("span.sep", { text: "›" }), el("span.symbol", { text: active.symbol }));
  box.replaceChildren(...nodes);
}

function renderPosition() {
  if (!active) { $("#status-position").textContent = ""; return; }
  const sel = view.state.selection.main, line = view.state.doc.lineAt(sel.head);
  const count = view.state.selection.ranges.length;
  $("#status-position").textContent = `Ln ${line.number}, Col ${sel.head - line.from + 1}` + (sel.empty ? "" : ` (${Math.abs(sel.to - sel.from)} selected)`) + (count > 1 ? ` · ${count} cursors` : "");
}

function activate(tab) {
  if (active === tab) { view.focus(); return; }
  if (active) active.state = view.state;
  active = tab;
  view.setState(tab.state);
  $("#binary-note").hidden = true;
  renderTabs(); renderCrumbs(); renderPosition(); refreshOutline(true); renderTree(); renderStatus(); renderRunButton();
  if (tab.language.id === "flywheel") warmModules(tab.state.doc.toString());
  view.focus();
  saveSession();
}

async function openFile(path, at) {
  path = path === SETTINGS ? path : normalize(rel(path));
  let tab = tabs.find(x => x.path === path);
  if (!tab) {
    let text;
    if (path === SETTINGS) text = configText;
    else {
      let read;
      try { read = await host.call("fs/read", { path }); } catch (e) { toast(e.message, "error"); return null; }
      if (read.binary) { toast(baseName(path) + " is not a text file (" + read.size + " bytes)"); return null; }
      text = read.text;
    }
    tab = { path, name: path === SETTINGS ? "solenoid.cw" : baseName(path), language: languageOf(path), dirty: false };
    tab.state = createState(path, text);
    tab.saved = tab.state.doc;
    tabs.push(tab);
    Sound.play("open");
  }
  activate(tab);
  if (at && at.line) jumpTo(at.line, at.column || 1);
  return tab;
}

function jumpTo(lineNumber, column) {
  const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, lineNumber)));
  const pos = Math.min(line.to, line.from + Math.max(0, (column || 1) - 1));
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  view.focus();
  const dom = view.domAtPos(pos).node;
  const lineNode = (dom.nodeType === 1 ? dom : dom.parentElement).closest(".cm-line");
  if (lineNode) { lineNode.classList.add("cm-flash"); setTimeout(() => lineNode.classList.remove("cm-flash"), 1000); }
}

async function closeTab(tab, force) {
  if (!tab) return;
  if (tab.dirty && !force) {
    const answer = await ask({ title: "Save " + tab.name + "?", text: "It has changes that are not saved.", ok: "Save" , value: null });
    if (answer) { if (!(await saveTab(tab))) return; }
    else if (!(await ask({ title: "Close without saving?", text: tab.name + " will lose its changes.", ok: "Discard", danger: true }))) return;
  }
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  tabs.splice(index, 1);
  if (tab.path === SETTINGS) { conf = Cogwheel.parse(configText); applySettings(); }
  if (active === tab) {
    active = null;
    const next = tabs[Math.min(index, tabs.length - 1)];
    if (next) activate(next);
    else { view.setState(EditorState.create({ doc: "" })); renderTabs(); renderCrumbs(); renderPosition(); refreshOutline(true); renderTree(); renderStatus(); renderRunButton(); }
  } else renderTabs();
  saveSession();
}
async function closeOthers(keep) { for (const tab of tabs.slice()) if (tab !== keep) await closeTab(tab); }

function tabText(tab) { return (tab === active ? view.state : tab.state).doc.toString(); }
function replaceText(tab, text) {
  const state = tab === active ? view.state : tab.state;
  if (state.doc.toString() === text) return;
  const head = Math.min(text.length, state.selection.main.head);
  const spec = { changes: { from: 0, to: state.doc.length, insert: text }, selection: { anchor: head } };
  if (tab === active) view.dispatch(spec); else tab.state = state.update(spec).state;
}

async function saveTab(tab) {
  tab = tab || active;
  if (!tab) return false;
  let text = tabText(tab);
  try {
    if (tab.path === SETTINGS) {
      await host.call("config/save", { text });
      configText = text; conf = Cogwheel.parse(text); applySettings();
    } else {
      if (tab.language.id === "flywheel" && flag("Editor", "format on save")) {
        try { const formatted = (await host.call("format", { text })).text; if (formatted && formatted !== text) { replaceText(tab, formatted); text = formatted; } } catch (e) { /* a file that does not parse is saved as it is */ }
      }
      await host.call("fs/write", { path: tab.path, text });
    }
  } catch (e) { toast("Could not save " + tab.name + ": " + e.message, "error"); return false; }
  tab.saved = (tab === active ? view.state : tab.state).doc;
  tab.dirty = false;
  moduleCache.clear();
  project.symbols.delete(tab.path);
  renderTabs();
  Sound.play("save");
  flashStatus("Saved " + tab.name);
  if (tab.path !== SETTINGS) { if (!fileList.includes(tab.path)) { fileList.push(tab.path); refreshTree(dirName(tab.path)); } refreshGit(); if (baseName(tab.path) === "pulley.toml") { renderPulley(); refreshProject(); } }
  return true;
}
async function saveAll() { for (const tab of tabs) if (tab.dirty) await saveTab(tab); }

let autoSaveTimer = null;
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  const seconds = Number(setting("Editor", "auto save"));
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const tab = active;
  autoSaveTimer = setTimeout(() => { if (tab && tab.dirty && tab.path !== SETTINGS) saveTab(tab); }, seconds * 1000);
}

async function formatActive() {
  if (!active) return;
  const text = tabText(active);
  try {
    if (active.language.id === "flywheel") replaceText(active, (await host.call("format", { text })).text);
    else if (active.language.id === "json") replaceText(active, JSON.stringify(JSON.parse(text), null, number("Editor", "tab size", 4)) + "\n");
    else { toast("Formatting is available for Flywheel and JSON"); return; }
    flashStatus("Formatted");
  } catch (e) { toast("Could not format: " + e.message, "error"); }
}

function copyText(text) { navigator.clipboard.writeText(text).then(() => flashStatus("Copied"), () => toast(text)); }

/* ------------------------------------------------------------------ the file tree */

const tree = { expanded: new Set([""]), listings: new Map(), git: new Map(), branch: "" };

async function refreshTree(dir) {
  const dirs = dir == null ? [...tree.expanded] : [dir];
  await Promise.all(dirs.map(async d => { try { tree.listings.set(d, await host.call("fs/list", { path: d })); } catch (e) { tree.listings.delete(d); tree.expanded.delete(d); } }));
  if (!tree.expanded.has("")) tree.expanded.add("");
  renderTree();
}
async function refreshFiles() {
  try { fileList = await host.call("fs/walk", {}); } catch (e) { fileList = []; }
  if (!tabs.length) renderWelcome();
}

function renderTree() {
  const box = $("#tree");
  const rows = [];
  const walk = (dir, depth) => {
    for (const entry of tree.listings.get(dir) || []) {
      if (entry.name === ".git") continue;
      const path = joinPath(dir, entry.name);
      const open = entry.dir && tree.expanded.has(path);
      const status = tree.git.get(path) || (entry.dir && [...tree.git.keys()].some(k => k.startsWith(path + "/")) ? "M" : "");
      const bad = !entry.dir && (problems.get(path) || []).some(p => p.severity !== "warning");
      rows.push(el("div.node" + (open ? ".open" : "") + (active && active.path === path ? ".active" : "") + (status ? ".git-" + status : "") + (bad ? ".has-error" : ""), {
        style: { paddingLeft: 8 + depth * 14 + "px" }, title: path, "data-path": path,
        onclick: () => entry.dir ? toggleDir(path) : openFile(path),
        oncontextmenu: e => { e.preventDefault(); treeMenu(e, path, entry.dir); } },
        entry.dir ? el("span.chev", icon("chevron")) : el("span.dot", { style: { background: UI.fileColor(entry.name) } }),
        el("span.label", { text: entry.name }), status && !entry.dir ? el("span.mark", { text: status }) : null));
      if (open) walk(path, depth + 1);
    }
  };
  walk("", 0);
  box.replaceChildren(...(rows.length ? rows : [el("div.tree-empty", { text: "This folder is empty. Create a file to begin." })]));
  renderProject();
}

async function toggleDir(path) {
  if (tree.expanded.has(path)) tree.expanded.delete(path);
  else { tree.expanded.add(path); await refreshTree(path); }
  renderTree();
  Sound.play("tick");
  saveSession();
}

async function reveal(path) {
  showView("files");
  let dir = "";
  for (const part of dirName(path).split("/").filter(Boolean)) { dir = joinPath(dir, part); if (!tree.expanded.has(dir)) { tree.expanded.add(dir); await refreshTree(dir); } }
  if (path && !path.includes(".") && !tree.expanded.has(path)) { tree.expanded.add(path); await refreshTree(path); }
  renderTree();
  const node = $$(".node", $("#tree")).find(n => n.dataset.path === path);
  if (node) node.scrollIntoView({ block: "center" });
}

function treeMenu(event, path, isDir) {
  const dir = isDir ? path : dirName(path);
  menu(event.clientX, event.clientY, [
    isDir ? null : { label: "Open", run: () => openFile(path) },
    isDir ? null : { label: "Run", run: () => openFile(path).then(() => runActive()) },
    { label: "New file…", run: () => newFile(dir) }, { label: "New folder…", run: () => newFolder(dir) }, null,
    { label: "Rename…", run: () => renamePath(path) }, { label: "Duplicate", run: () => duplicatePath(path, isDir) },
    { label: "Copy path", run: () => copyText(path) }, null,
    { label: "Delete", danger: true, run: () => deletePath(path) },
  ].filter((item, i, all) => item !== null || (i > 0 && all[i - 1] !== null)));
}

async function newFile(dir) {
  if (dir == null) dir = active && active.path !== SETTINGS ? dirName(active.path) : "";
  const name = await ask({ title: "New file", text: dir ? "In " + dir : "In the project folder", value: "", placeholder: "name.fw" });
  if (!name) return;
  const path = normalize(joinPath(dir, name));
  try {
    if ((await host.call("fs/exists", { path })).exists) { toast(name + " already exists", "error"); return; }
    const stem = baseName(path).replace(/\.[^.]*$/, "");
    const starter = { fw: "", py: "", html: "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>" + stem + "</title>\n</head>\n<body>\n  \n</body>\n</html>\n", cw: "# " + stem + "\n\n> name = value\n", md: "# " + stem + "\n" }[extension(path)] || "";
    await host.call("fs/write", { path, text: starter });
  } catch (e) { toast(e.message, "error"); return; }
  await afterFileChange(dirName(path));
  openFile(path);
}
async function newFolder(dir) {
  const name = await ask({ title: "New folder", text: dir ? "In " + dir : "In the project folder", value: "", placeholder: "folder" });
  if (!name) return;
  try { await host.call("fs/mkdir", { path: normalize(joinPath(dir || "", name)) }); } catch (e) { toast(e.message, "error"); return; }
  tree.expanded.add(normalize(joinPath(dir || "", name)));
  afterFileChange(dir || "");
}
async function renamePath(path) {
  const name = await ask({ title: "Rename", value: baseName(path) });
  if (!name || name === baseName(path)) return;
  const to = normalize(joinPath(dirName(path), name));
  try { await host.call("fs/move", { from: path, to }); } catch (e) { toast(e.message, "error"); return; }
  for (const tab of tabs) {
    if (tab.path !== path && !tab.path.startsWith(path + "/")) continue;
    tab.path = to + tab.path.slice(path.length);
    tab.name = baseName(tab.path);
    const language = languageOf(tab.path);
    if (language.id !== tab.language.id) {
      tab.language = language;
      const effects = [C.language.reconfigure(support(language)), C.lint.reconfigure(lintFor(language))];
      if (tab === active) view.dispatch({ effects }); else tab.state = tab.state.update({ effects }).state;
    }
  }
  if (tree.expanded.has(path)) { tree.expanded.delete(path); tree.expanded.add(to); }
  await afterFileChange(dirName(path));
  renderTabs(); renderCrumbs(); renderStatus();
}
async function duplicatePath(path, isDir) {
  const name = baseName(path), dot = isDir ? -1 : name.lastIndexOf(".");
  const copy = joinPath(dirName(path), dot > 0 ? name.slice(0, dot) + " copy" + name.slice(dot) : name + " copy");
  try { await host.call("fs/copy", { from: path, to: copy }); } catch (e) { toast(e.message, "error"); return; }
  afterFileChange(dirName(path));
}
async function deletePath(path) {
  if (!(await ask({ title: "Delete " + baseName(path) + "?", text: "This cannot be undone.", ok: "Delete", danger: true }))) return;
  try { await host.call("fs/remove", { path }); } catch (e) { toast(e.message, "error"); return; }
  for (const tab of tabs.slice()) if (tab.path === path || tab.path.startsWith(path + "/")) await closeTab(tab, true);
  problems.delete(path);
  afterFileChange(dirName(path));
}
async function afterFileChange(dir) {
  moduleCache.clear();
  await Promise.all([refreshTree(dir), refreshFiles()]);
  refreshGit();
  refreshProject();
}

async function refreshGit() {
  if (isWeb) return;
  let result;
  try { result = await host.call("git", {}); } catch (e) { return; }
  tree.git.clear();
  tree.branch = "";
  if (result.ok) {
    for (const line of result.text.split("\n")) {
      if (line.startsWith("## ")) { tree.branch = line.slice(3).split("...")[0].replace(/^No commits yet on /, ""); continue; }
      if (line.length < 4) continue;
      const code = line.slice(0, 2), path = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "").replace(/\/$/, "");
      tree.git.set(path, code === "??" ? "U" : code.includes("D") ? "D" : code.includes("A") ? "A" : "M");
    }
  }
  const item = $("#status-branch");
  item.hidden = !tree.branch;
  item.replaceChildren(icon("branch"), " " + tree.branch + (tree.git.size ? ` · ${tree.git.size}` : ""));
  renderTree();
}

/* ------------------------------------------------------------------ the project view */

/* The project as Flywheel sees it, beside the folder tree: its modules by the names `import`
 * gives them (each opening into what it declares), its tests, its Pulley packages (each with
 * its own modules and files), and every other file as a resource, sorted by kind. Groups are
 * open until closed (`collapsed`); modules, packages, and classes are closed until opened. */
const project = {
  expanded: new Set(), collapsed: new Set(),
  state: null,                 // the answer to "packages"
  packageFiles: new Map(),     // package name -> its files, relative to its folder (null while read)
  symbols: new Map(),          // path -> what the file declares (null while read)
  filter: "",
};
const KIND_LETTERS = { function: "f", method: "f", class: "C", interface: "I", enum: "E", variable: "x", field: "p", constant: "c", heading: "#", rule: "{", component: "<", elements: "<", module: "M" };

const RESOURCE_KINDS = [
  { id: "project", name: "Project", test: f => /^(pulley\.(toml|lock)|\.gitignore|\.gitattributes|license(\.\w+)?|makefile|cmakelists\.txt|dockerfile)$/i.test(baseName(f)) },
  { id: "cogwheel", name: "Cogwheel", ext: ["cw"] },
  { id: "docs", name: "Docs", ext: ["md", "markdown", "txt", "rst", "adoc"] },
  { id: "web", name: "Web", ext: ["html", "htm", "css", "scss", "less", "js", "mjs", "cjs", "ts", "tsx", "jsx", "svg"] },
  { id: "data", name: "Data", ext: ["json", "jsonc", "toml", "yaml", "yml", "xml", "csv", "tsv", "ini", "conf", "env", "sql", "lock"] },
  { id: "native", name: "Native code", ext: ["c", "h", "cpp", "cc", "cxx", "hpp", "hh", "rs", "zig"] },
  { id: "media", name: "Images and media", ext: ["png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif", "mp3", "wav", "ogg", "flac", "mp4", "webm", "mov", "ttf", "otf", "woff", "woff2", "pdf"] },
  { id: "scripts", name: "Scripts", ext: ["sh", "bash", "zsh", "py", "rb", "lua", "pl", "ps1", "bat"] },
  { id: "other", name: "Other", test: () => true },
];
const resourceKind = path => RESOURCE_KINDS.find(k => k.test ? k.test(path) : k.ext.includes(extension(path)));
const isModuleFile = path => /\.(fw|fly)$/.test(path);
const isTestFile = path => /(^|\/)tests?\//.test(path) || /^test_|_test\.(fw|fly)$/.test(baseName(path));
/* The name `import` loads a project file by, from the project folder. */
const moduleName = path => path.replace(/\.(fw|fly)$/, "").split("/").join(".");
const previewable = path => ["html", "htm", "md", "markdown", "cw", "svg"].includes(extension(path)) || resourceKind(path).id === "media";
const insideProject = path => !path.startsWith("/");

async function refreshProject() {
  try { project.state = await host.call("packages", {}); packageNames = project.state.installed.map(p => p.name); }
  catch (e) { project.state = null; }
  project.packageFiles.clear();
  project.symbols.clear();
  renderProject();
}

/* What a Flywheel file declares: from its tab when it is open, else read once. */
function declarations(path) {
  const tab = tabs.find(x => x.path === path);
  if (tab) return FL.outline(tabText(tab), "flywheel");
  if (project.symbols.has(path)) return project.symbols.get(path);
  project.symbols.set(path, null);
  host.call("fs/read", { path }).then(r => project.symbols.set(path, r.text != null ? FL.outline(r.text, "flywheel") : []), () => project.symbols.set(path, [])).then(renderProject);
  return null;
}
function packageFiles(pkg) {
  if (project.packageFiles.has(pkg.name)) return project.packageFiles.get(pkg.name);
  project.packageFiles.set(pkg.name, null);
  host.call("fs/walk", { path: pkg.path }).then(files => project.packageFiles.set(pkg.name, files.filter(f => !baseName(f).startsWith(".pulley"))), () => project.packageFiles.set(pkg.name, [])).then(renderProject);
  return null;
}

const projectShown = () => !$("#sidebar").classList.contains("closed") && !$(".side-view[data-view=project]").hidden;

function renderProject() {
  if (!projectShown()) return;
  const box = $("#project-tree"), scroll = box.scrollTop;
  const filter = project.filter.trim().toLowerCase();
  const matches = (...texts) => !filter || texts.some(text => text && text.toLowerCase().includes(filter));
  const rows = [];
  const flip = (set, id) => { if (set.has(id)) set.delete(id); else set.add(id); Sound.play("tick"); renderProject(); saveSession(); };

  const group = (id, label, count, depth, actions) => {
    const open = !!filter || !project.collapsed.has(id);
    rows.push(el("div.pgroup" + (depth ? ".sub" : "") + (open ? ".open" : ""), { style: { paddingLeft: 8 + depth * 14 + "px" }, onclick: () => flip(project.collapsed, id) },
      el("span.chev", icon("chevron")), el("span.label", { text: label }), count != null ? el("span.pcount", { text: count }) : null,
      el("span.pactions", (actions || []).map(a => el("button", { title: a.title, onclick: e => { e.stopPropagation(); a.run(); } }, icon(a.icon))))));
    return open;
  };
  const row = o => {
    const open = o.id && project.expanded.has(o.id);
    rows.push(el("div.node.pnode" + (open ? ".open" : "") + (o.cls || ""), {
      style: { paddingLeft: 8 + o.depth * 14 + "px" }, title: o.title || null, "data-path": o.path || null,
      onclick: o.onclick || (o.id ? () => flip(project.expanded, o.id) : null),
      oncontextmenu: o.menu ? e => { e.preventDefault(); o.menu(e); } : null },
      o.id ? el("span.chev", { onclick: e => { e.stopPropagation(); flip(project.expanded, o.id); } }, icon("chevron")) : el("span.chev.none"),
      o.lead || null, el("span.label", { text: o.label }), o.detail ? el("span.detail", { text: o.detail }) : null,
      (o.badges || []).map(b => el("span.badge", { text: b })), o.mark ? el("span.mark", { text: o.mark }) : null));
    return open;
  };
  const note = (depth, text) => rows.push(el("div.pnote", { style: { paddingLeft: 8 + depth * 14 + 18 + "px" }, text }));
  const kindBox = kind => el("span.kind." + kind, { text: KIND_LETTERS[kind] || "·" });
  const fileMarks = path => {
    const status = tree.git.get(path) || "";
    const bad = (problems.get(path) || []).some(p => p.severity !== "warning");
    return { cls: (active && active.path === path ? ".active" : "") + (status ? ".git-" + status : "") + (bad ? ".has-error" : ""), mark: status };
  };

  /* A module, opening into its declarations; a class opens into its members. */
  const moduleRow = (path, name, depth, badges, editable) => {
    const marks = fileMarks(path);
    const plain = name.split(".").join("/") + ".fw";
    const open = row({ id: "m:" + path, depth, path, label: name, detail: path.endsWith(plain) ? "" : path.replace(/^\.flywheel-modules\/[^/]+\//, ""), badges,
      lead: kindBox("module"), cls: marks.cls, mark: marks.mark, title: path, onclick: () => openFile(path), menu: e => moduleMenu(e, path, name, editable) });
    if (!open) return;
    const items = declarations(path);
    if (items == null) { note(depth + 1, "Reading…"); return; }
    const top = items.filter(s => !s.container);
    if (!top.length) note(depth + 1, "Declares nothing yet.");
    for (const s of top) {
      const members = ["class", "interface", "enum", "component", "elements"].includes(s.kind) ? items.filter(m => m.container === s.name) : [];
      const params = /\(([^)]*)\)/.exec(s.detail || "");
      const id = members.length ? "s:" + path + ":" + s.name : null;
      const at = item => () => openFile(path, { line: item.line });
      const shown = row({ id, depth: depth + 1, label: s.name, detail: s.kind === "function" && params ? "(" + params[1].trim() + ")" : "", lead: kindBox(s.kind),
        cls: s.private ? ".private" : "", title: s.doc ? s.detail + "\n" + s.doc : s.detail, onclick: at(s) });
      if (shown) for (const m of members) row({ depth: depth + 2, label: m.name, lead: kindBox(m.kind), cls: m.private ? ".private" : "", title: m.detail, onclick: at(m) });
    }
  };

  const manifest = project.state && project.state.manifest || null;
  const own = manifest && manifest.package || {};
  const mainFile = String(own.main || "").replace(/^\.\//, "");
  const commandsOf = {};
  for (const [name, file] of Object.entries(manifest && manifest.commands || {})) (commandsOf[String(file).replace(/^\.\//, "")] = commandsOf[String(file).replace(/^\.\//, "")] || []).push(name);
  const badgesOf = path => (path === mainFile ? ["main"] : []).concat((commandsOf[path] || []).map(c => "$ " + c));
  const rank = path => path === mainFile ? 0 : commandsOf[path] ? 1 : 2;

  // Modules.
  const modules = fileList.filter(f => isModuleFile(f) && !isTestFile(f) && matches(f, moduleName(f)))
    .sort((a, b) => rank(a) - rank(b) || moduleName(a).localeCompare(moduleName(b)));
  if ((!filter || modules.length) && group("modules", "Modules", modules.length, 0, [{ icon: "plus", title: "New module", run: () => newModule() }])) {
    if (!modules.length) note(0, "No Flywheel modules yet.");
    for (const path of modules) moduleRow(path, moduleName(path), 1, badgesOf(path), true);
  }

  // Tests.
  const tests = fileList.filter(f => isModuleFile(f) && isTestFile(f) && matches(f));
  if (tests.length || !filter) {
    if (group("tests", "Tests", tests.length, 0, [{ icon: "play", title: "Run the tests", run: () => runActive({ kind: "test" }) }])) {
      if (!tests.length) note(0, "No tests yet: files in tests/ or named test_*.fw.");
      for (const path of tests) moduleRow(path, moduleName(path), 1, [], true);
    }
  }

  // Packages.
  const installed = project.state ? project.state.installed : [];
  const dependencies = manifest && manifest.dependencies || {};
  const names = [...new Set(Object.keys(dependencies).concat(installed.map(p => p.name)))].sort();
  const shownPackages = names.filter(name => {
    const pkg = installed.find(p => p.name === name), meta = pkg && pkg.manifest && pkg.manifest.package || {};
    const files = pkg && project.packageFiles.get(name);
    return matches(name, meta.author, meta.description) || (files && files.some(f => matches(f)));
  });
  if ((!filter || shownPackages.length) && group("packages", "Packages", shownPackages.length, 0, [{ icon: "package", title: "Pulley: add a package", run: () => showView("pulley") }])) {
    if (!names.length) note(0, project.state ? "No packages yet." : "Pulley could not be asked.");
    for (const name of shownPackages) {
      const pkg = installed.find(p => p.name === name);
      const meta = pkg && pkg.manifest && pkg.manifest.package || {};
      const direct = name in dependencies;
      const id = pkg ? "p:" + name : null;
      const files = pkg && project.packageFiles.get(name);
      const forced = filter && files && !matches(name, meta.author, meta.description);
      if (forced) project.expanded.add(id);
      const open = row({ id, depth: 1, label: name, detail: pkg ? (meta.version || "") + (meta.author ? " · " + meta.author : "") : "not installed",
        badges: direct ? [] : ["indirect"], lead: el("span.picon", icon("package")), cls: pkg ? "" : ".missing",
        title: [(meta.author ? meta.author + "." : "") + name + (meta.version ? "=" + meta.version : ""), meta.description, direct ? "wanted: " + (typeof dependencies[name] === "string" ? dependencies[name] : JSON.stringify(dependencies[name])) : "needed by another package"].filter(Boolean).join("\n"),
        menu: e => packageMenu(e, name, pkg, direct) });
      if (!open || !pkg) continue;
      const all = packageFiles(pkg);
      if (all == null) { note(2, "Reading…"); continue; }
      const main = [String(meta.main || "").replace(/^\.\//, ""), name + ".fw", "main.fw", "lib.fw"].find(f => f && all.includes(f));
      const theirs = all.filter(f => isModuleFile(f) && matches(f, name)).sort((a, b) => (b === main) - (a === main) || a.localeCompare(b));
      const rest = all.filter(f => !isModuleFile(f) && matches(f, name));
      const needs = Object.keys(pkg.manifest && pkg.manifest.dependencies || {});
      if (needs.length) note(2, "Needs " + needs.join(", "));
      if (theirs.length && group("pm:" + name, "Modules", theirs.length, 2)) {
        for (const f of theirs) moduleRow(joinPath(pkg.path, f), f === main ? name : name + "." + moduleName(f), 3, f === main ? ["main"] : isTestFile(f) ? ["test"] : [], false);
      }
      if (rest.length && group("pr:" + name, "Files", rest.length, 2)) {
        for (const f of rest) resourceRow(joinPath(pkg.path, f), f, 3, false);
      }
      if (!all.length) note(2, "This package is empty.");
    }
  }

  // Resources.
  const resources = fileList.filter(f => !isModuleFile(f) && matches(f));
  if ((!filter || resources.length) && group("resources", "Resources", resources.length, 0, [{ icon: "file-plus", title: "New file", run: () => newFile("") }])) {
    if (!resources.length) note(0, "No other files.");
    for (const kind of RESOURCE_KINDS) {
      const files = resources.filter(f => resourceKind(f) === kind).sort((a, b) => baseName(a).localeCompare(baseName(b)) || a.localeCompare(b));
      if (!files.length || !group("r:" + kind.id, kind.name, files.length, 1)) continue;
      for (const path of files) resourceRow(path, path, 2, true);
    }
  }

  function resourceRow(path, shownPath, depth, editable) {
    const marks = fileMarks(path);
    row({ depth, path, label: baseName(shownPath), detail: dirName(shownPath), title: path, cls: marks.cls, mark: marks.mark,
      lead: el("span.dot", { style: { background: UI.fileColor(path) } }),
      onclick: () => resourceKind(path).id === "media" ? previewFile(path) : openFile(path), menu: e => resourceMenu(e, path, editable) });
  }

  if (!rows.length) note(0, "Nothing matches " + JSON.stringify(project.filter.trim()) + ".");
  box.replaceChildren(...rows);
  box.scrollTop = scroll;
}

/* A menu without the items that were left out (false) or doubled separators (null). */
function tidyMenu(items) {
  const out = [];
  for (const item of items) {
    if (item === false || item === undefined) continue;
    if (item === null && (!out.length || out[out.length - 1] === null)) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
function moduleMenu(event, path, name, editable) {
  const importable = active && active.language.id === "flywheel" && active.path !== path;
  menu(event.clientX, event.clientY, tidyMenu([
    { label: "Open", run: () => openFile(path) },
    { label: "Run", run: () => openFile(path).then(tab => tab && runActive()) },
    importable && { label: "Import into " + active.name, run: () => insertImport(name) },
    null,
    { label: "Copy import", run: () => copyText("import " + name) },
    { label: "Copy path", run: () => copyText(path) },
    insideProject(path) && { label: "Show in Files", run: () => reveal(path) },
    null,
    editable && { label: "Rename…", run: () => renamePath(path) },
    editable && { label: "Duplicate", run: () => duplicatePath(path, false) },
    editable && { label: "Delete", danger: true, run: () => deletePath(path) },
  ]));
}
function packageMenu(event, name, pkg, direct) {
  menu(event.clientX, event.clientY, tidyMenu([
    active && active.language.id === "flywheel" && { label: "Import into " + active.name, run: () => insertImport(name) },
    { label: "Copy import", run: () => copyText("import " + name) },
    null,
    pkg && { label: "Open its pulley.toml", run: () => openFile(joinPath(pkg.path, "pulley.toml")) },
    pkg && insideProject(pkg.path) && { label: "Show in Files", run: () => reveal(pkg.path) },
    { label: "Pulley panel", run: () => showView("pulley") },
    null,
    direct && { label: "Remove", danger: true, run: () => pulleyCommand(["remove", name], "pulley remove " + name) },
  ]));
}
function resourceMenu(event, path, editable) {
  menu(event.clientX, event.clientY, tidyMenu([
    resourceKind(path).id !== "media" && { label: "Open", run: () => openFile(path) },
    previewable(path) && { label: "Preview", run: () => previewFile(path) },
    null,
    { label: "Copy path", run: () => copyText(path) },
    insideProject(path) && { label: "Show in Files", run: () => reveal(path) },
    null,
    editable && { label: "Rename…", run: () => renamePath(path) },
    editable && { label: "Duplicate", run: () => duplicatePath(path, false) },
    editable && { label: "Delete", danger: true, run: () => deletePath(path) },
  ]));
}

/* A new module, named as `import` names it: `lib.util` is lib/util.fw. */
async function newModule() {
  const name = await ask({ title: "New module", text: "Name it as an import does: shapes, or lib.util for lib/util.fw", value: "", placeholder: "lib.util" });
  if (!name) return;
  const clean = name.replace(/\.(fw|fly)$/, "");
  if (!/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(clean)) { toast("A module name is words joined by dots, such as lib.util", "error"); return; }
  const path = clean.split(".").join("/") + ".fw";
  try {
    if ((await host.call("fs/exists", { path })).exists) { toast(path + " already exists", "error"); return; }
    await host.call("fs/write", { path, text: "" });
  } catch (e) { toast(e.message, "error"); return; }
  project.expanded.add("m:" + path);
  await afterFileChange(dirName(path));
  openFile(path);
}

$("#project-filter").addEventListener("input", debounce(() => { project.filter = $("#project-filter").value; renderProject(); }, 120));
$("#project-filter").addEventListener("keydown", e => { if (e.key === "Escape" && e.target.value) { e.target.value = ""; project.filter = ""; renderProject(); e.stopPropagation(); } });
$("#project-new").onclick = () => newModule();
$("#project-collapse").onclick = () => { project.expanded.clear(); for (const k of RESOURCE_KINDS) project.collapsed.add("r:" + k.id); renderProject(); saveSession(); };
$("#project-refresh").onclick = () => afterFileChange();

/* ------------------------------------------------------------------ outline */

let outlineItems = [];
const refreshOutline = (() => {
  const build = () => {
    outlineItems = active ? FL.outline(view.state.doc.toString(), active.language.id) : [];
    const box = $("#outline");
    if (!outlineItems.length) { box.replaceChildren(el("div.empty", { text: active ? "Nothing to outline in this file." : "Open a file to see its outline." })); markOutline(); return; }
    const letter = KIND_LETTERS;
    box.replaceChildren(...outlineItems.map(item => el("div.item", { style: { paddingLeft: 12 + (item.depth != null ? item.depth : (item.container ? 1 : 0)) * 14 + "px" }, title: item.detail || item.name, onclick: () => jumpTo(item.line, 1) },
      el("span.kind." + item.kind, { text: letter[item.kind] || "·" }), el("span.name", { text: item.name }))));
    markOutline();
    if (active && project.expanded.has("m:" + active.path)) renderProject();
  };
  const later = debounce(build, 300);
  return now => now ? build() : later();
})();

function markOutline() {
  if (!active) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head).number;
  let current = -1;
  outlineItems.forEach((item, i) => { if (item.line <= line && (item.kind !== "variable" && item.kind !== "field" && item.kind !== "constant")) current = i; });
  $$(".item", $("#outline")).forEach((node, i) => node.classList.toggle("here", i === current));
  const symbol = current >= 0 ? (outlineItems[current].container ? outlineItems[current].container + "." : "") + outlineItems[current].name : "";
  if (active.symbol !== symbol) { active.symbol = symbol; renderCrumbs(); }
}

/* ================================================================== logs */

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]|\r(?!\n)/g;
const LINKS = /(https?:\/\/[^\s"'<>)\]]+)|((?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z]{1,5}):(\d+)(?::(\d+))?/g;

/* Appends text to a log, turning addresses and file:line:column into links. */
function log(box, text, cls, base) {
  text = String(text).replace(ANSI, "");
  if (!text) return;
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const span = el("span" + (cls ? "." + cls.split(" ").join(".") : ""));
  let last = 0, m;
  LINKS.lastIndex = 0;
  while ((m = LINKS.exec(text))) {
    if (m.index > last) span.append(text.slice(last, m.index));
    if (m[1]) { const url = m[1].replace(/[.,;:]+$/, ""); span.append(el("a", { text: url, onclick: e => { e.preventDefault(); browser.navigate(url); } })); LINKS.lastIndex = m.index + url.length; last = LINKS.lastIndex; continue; }
    const path = normalize(joinPath(base || "", m[2]));
    span.append(el("span.link", { text: m[0], onclick: () => openFile(m[2].startsWith("/") ? m[2] : path, { line: +m[3], column: +(m[4] || 1) }) }));
    last = m.index + m[0].length;
  }
  if (last < text.length) span.append(text.slice(last));
  box.append(span);
  while (box.childNodes.length > 3000) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}
function logLine(box, text, cls) { const node = el("span.entry" + (cls ? "." + cls.split(" ").join(".") : ""), { text: text + "\n" }); box.append(node); box.scrollTop = box.scrollHeight; return node; }

/* ================================================================== the browser */

const BRIDGE = `<script>(function(){
var T=["click","dblclick","input","change","submit","keydown","keyup","focus","blur","mouseover","mouseout","pointerdown","pointerup"];
T.forEach(function(t){document.addEventListener(t,function(e){var a="data-fw-on"+t,el=e.target;
while(el&&el.nodeType===1&&!el.hasAttribute(a))el=el.parentElement;if(!el||el.nodeType!==1)return;
if(t==="submit"||(t==="click"&&el.tagName==="A"))e.preventDefault();
var src="value" in el?el:e.target,v=src&&"value" in src?src.value:"";
parent.postMessage({fw:"event",hid:+el.getAttribute(a),value:v},"*");},true);});
document.addEventListener("submit",function(e){if(!e.target.hasAttribute("data-fw-onsubmit"))e.preventDefault();},true);
addEventListener("message",function(e){var m=e.data;if(!m||m.fw!=="update")return;
var a=document.activeElement,id=a&&a.id,s=null,en=null;try{s=a.selectionStart;en=a.selectionEnd}catch(_){}
var x=scrollX,y=scrollY;document.body.innerHTML=m.body;if(m.title!=null)document.title=m.title;
if(id){var n=document.getElementById(id);if(n){n.focus();try{if(s!=null)n.setSelectionRange(s,en)}catch(_){}}}scrollTo(x,y);});
})();<\/script>`;
const PLAIN_PAGE = `<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#18181b;background:#fff;line-height:1.6}pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}pre{background:#f4f4f5;padding:12px 14px;border-radius:8px;overflow:auto}code{background:#f4f4f5;padding:1px 5px;border-radius:4px}pre code{background:none;padding:0}blockquote{margin:12px 0;padding:6px 14px;border-left:3px solid #84cc16;background:#f7fee7;border-radius:0 8px 8px 0}blockquote p{margin:2px 0}h1,h2,h3{letter-spacing:-.02em;line-height:1.25}h1{border-bottom:1px solid #e4e4e7;padding-bottom:8px}table{border-collapse:collapse}td,th{border:1px solid #e4e4e7;padding:5px 10px}a{color:#4d7c0f}img{max-width:100%}</style>`;

/* A small Markdown reader, for previews of .md and .cw files. */
function markdown(text) {
  const inline = s => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  const lines = text.split("\n");
  let paragraph = [], list = null;
  const flush = () => { if (paragraph.length) { out.push("<p>" + inline(paragraph.join(" ")) + "</p>"); paragraph = []; } if (list) { out.push("</" + list + ">"); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      flush();
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      out.push("<pre><code>" + escapeHtml(body.join("\n")) + "</code></pre>");
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      flush();
      const entry = /^([^=]+?)\s*=\s*(.*)$/.exec(m[1]);
      out.push("<blockquote><p>" + (entry ? "<strong>" + inline(entry[1]) + "</strong> = <code>" + escapeHtml(entry[2]) + "</code>" : inline(m[1])) + "</p></blockquote>");
    }
    else if ((m = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line))) {
      const kind = /\d/.test(m[1]) ? "ol" : "ul";
      if (paragraph.length) flush();
      if (list !== kind) { if (list) out.push("</" + list + ">"); out.push("<" + kind + ">"); list = kind; }
      out.push("<li>" + inline(m[2]) + "</li>");
    }
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); }
    else if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(lines[i].trim().slice(1, -1).split("|").map(c => c.trim()));
      i--;
      const body = rows.filter(r => !r.every(c => /^:?-+:?$/.test(c)));
      out.push("<table>" + body.map((r, n) => "<tr>" + r.map(c => (n === 0 && rows.length > body.length ? "<th>" : "<td>") + inline(c) + (n === 0 && rows.length > body.length ? "</th>" : "</td>")).join("") + "</tr>").join("") + "</table>");
    }
    else if (line.trim() === "") flush();
    else paragraph.push(line.trim());
  }
  flush();
  return out.join("\n");
}

const browser = {
  entries: [], index: -1, send: null,
  frame: $("#browser-frame"),
  isOpen() { return !$("#browser").hidden; },
  show() { $("#browser").hidden = false; $("#browser-splitter").hidden = false; $("#toggle-browser").classList.add("on"); if (this.index < 0) this.home(); saveSession(); },
  hide() { $("#browser").hidden = true; $("#browser-splitter").hidden = true; $("#toggle-browser").classList.remove("on"); saveSession(); },
  toggle() { if (this.isOpen()) this.hide(); else this.show(); },
  home() {
    $("#browser-empty").replaceChildren(el("div", el("div", { style: { fontSize: "15px", color: "var(--fg)", marginBottom: "6px" }, text: "Built-in browser" }),
      "Pages your programs serve open here.", el("br"), "Run a Flywheel file that returns markup, preview an HTML or Markdown file,", el("br"), "or type an address above."));
    $("#browser-url").value = "";
    this.buttons();
  },
  push(entry) {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(entry);
    this.index = this.entries.length - 1;
    this.load();
  },
  /* Opens an address: a site, or a file of the project. */
  navigate(address) {
    address = String(address).trim();
    if (!address) return;
    this.show();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) {
      const file = normalize(address);
      if (fileList.includes(file)) { previewFile(file); return; }
      address = (/^(localhost|127\.|\[::1\]|[\w-]+:\d+)/.test(address) ? "http://" : "https://") + address;
    }
    this.push({ kind: "url", url: address, label: address });
  },
  document(html, label) { this.show(); this.push({ kind: "doc", html, label }); },
  load() {
    const entry = this.entries[this.index];
    if (!entry) return;
    $("#browser-empty").replaceChildren();
    $("#browser-url").value = entry.label;
    const progress = $("#browser-progress");
    progress.className = "browser-progress";
    void progress.offsetWidth;
    progress.classList.add("loading");
    this.frame.onload = () => { progress.classList.remove("loading"); progress.classList.add("done"); };
    this.send = entry.send || null;
    if (entry.kind === "url") {
      this.frame.removeAttribute("srcdoc");
      const own = entry.url.startsWith(location.origin + "/project/");
      this.frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads" + (own ? "" : " allow-same-origin"));
      this.frame.src = entry.url;
    } else {
      this.frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups");
      this.frame.removeAttribute("src");
      this.frame.srcdoc = entry.html;
    }
    this.buttons();
  },
  buttons() {
    $("#browser-back").disabled = this.index <= 0;
    $("#browser-forward").disabled = this.index >= this.entries.length - 1;
  },
  back() { if (this.index > 0) { this.index--; this.load(); } },
  forward() { if (this.index < this.entries.length - 1) { this.index++; this.load(); } },
  reload() { if (this.entries[this.index] && this.entries[this.index].refresh) this.entries[this.index].refresh(); else this.load(); },
  /* A page a Flywheel program returned (web build): its event handlers call back into the program. */
  app(app, send, label) {
    const current = this.entries[this.index];
    if (current && current.kind === "doc" && current.app && current.send === send && this.frame.contentWindow) {
      this.frame.contentWindow.postMessage({ fw: "update", body: app.body, title: app.title }, "*");
      return;
    }
    const html = "<!doctype html><html><head><meta charset=\"utf-8\">" + (app.isDoc ? "" : PLAIN_PAGE) + app.head + BRIDGE + "</head><body" + (app.bodyAttrs || "") + ">" + app.body + "</body></html>";
    this.show();
    this.push({ kind: "doc", html, label: (app.title || label || "page") + " (flywheel.js)", app: true, send });
  },
};
addEventListener("message", e => {
  if (e.source !== browser.frame.contentWindow || !e.data || e.data.fw !== "event" || !browser.send) return;
  browser.send({ hid: e.data.hid, value: e.data.value });
});

/* Shows a project file in the browser: HTML as a page, Markdown and Cogwheel rendered. */
async function previewFile(path) {
  const ext = extension(path);
  const open = tabs.find(x => x.path === path);
  const read = async p => { const tab = tabs.find(x => x.path === p); return tab && !isWeb ? null : tab ? tabText(tab) : (await host.call("fs/read", { path: p })).text; };
  if (ext === "md" || ext === "markdown" || ext === "cw") {
    const text = open ? tabText(open) : (await host.call("fs/read", { path })).text;
    browser.show();
    browser.push({ kind: "doc", label: path, html: "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + escapeHtml(baseName(path)) + "</title>" + PLAIN_PAGE + "</head><body>" + markdown(text) + "</body></html>", refresh: () => previewFile(path) });
    browser.entries.splice(browser.index - 1, browser.entries[browser.index - 1] && browser.entries[browser.index - 1].label === path ? 1 : 0);
    browser.index = browser.entries.length - 1; browser.buttons();
    return;
  }
  if (!isWeb) { browser.show(); browser.push({ kind: "url", url: location.origin + host.fileUrl(path), label: path }); return; }
  // In the browser build the page's own files (styles, scripts) are put into the document.
  let html = await read(path);
  const dir = dirName(path);
  const inlined = async (source, pattern, wrap) => {
    const jobs = [];
    source.replace(pattern, (whole, ref) => { jobs.push((async () => { try { return [whole, wrap(await read(normalize(joinPath(dir, ref))))]; } catch (e) { return [whole, whole]; } })()); return whole; });
    for (const [whole, replacement] of await Promise.all(jobs)) source = source.replace(whole, () => replacement);
    return source;
  };
  html = await inlined(html, /<link\b[^>]*\bhref=["']([^"':]+\.css)["'][^>]*>/gi, css => "<style>" + css + "</style>");
  html = await inlined(html, /<script\b[^>]*\bsrc=["']([^"':]+\.m?js)["'][^>]*>\s*<\/script>/gi, js => "<script>" + js.replace(/<\/script/gi, "<\\/script") + "<\/script>");
  browser.show();
  browser.push({ kind: "doc", html, label: path, refresh: () => previewFile(path) });
}

/* ================================================================== running programs */

let running = null;       // { handle, path }
let lastRun = null;

function renderRunButton() {
  const label = $("#run-label");
  const name = active && active.path !== SETTINGS ? active.name : "";
  const previewable = active && ["html", "markdown", "cogwheel"].includes(active.language.id) && active.path !== SETTINGS;
  label.textContent = previewable ? "Preview" : "Run" + (name ? " " + (name.length > 22 ? name.slice(0, 20) + "…" : name) : "");
  $("#run").hidden = !!running;
  $("#stop").hidden = !running;
}

function commandFor(tab, text, kind) {
  const ext = extension(tab.path);
  let template = "";
  if (kind === "test") template = setting("Run", "test");
  else if (kind === "window") template = "{flywheel} --desktop {file}";
  else if ((ext === "fw" || ext === "fly") && /^return\s*(?:<|\w+\s*\()/m.test(text) && /import\s+html/.test(text) && /^return\s*</m.test(text)) template = setting("Run", "fw page");
  else template = conf.get("Run", ext) != null ? conf.get("Run", ext) : defaults.get("Run", ext, "");
  if (!template) return "";
  const name = baseName(tab.path);
  return template.replace(/\{file\}/g, shellQuote(name)).replace(/\{dir\}/g, ".").replace(/\{name\}/g, shellQuote(name.replace(/\.[^.]*$/, ""))).replace(/\{flywheel\}/g, shellQuote(info.compiler));
}

async function runActive(options) {
  options = options || {};
  let tab = active;
  if (options.again && lastRun) tab = tabs.find(x => x.path === lastRun) || (await openFile(lastRun));
  if (!tab || tab.path === SETTINGS) { toast("Open a file to run it"); return; }
  if (running) await stopRun();
  if (tab.dirty && !(await saveTab(tab))) return;
  const language = tab.language.id, text = tabText(tab);
  if (!options.kind && (language === "html" || language === "markdown" || language === "cogwheel")) { previewFile(tab.path); return; }
  const out = $("#output");
  showPanel("output");
  out.replaceChildren();
  setProblems(tab.path, "run", []);
  let spec, shown;
  if (isWeb) {
    if (options.kind || !host.canRun(language)) {
      logLine(out, options.kind === "test" ? "Tests run with the Flywheel compiler, on your machine:" : `The browser build runs Flywheel, JavaScript, and Python. For ${tab.language.name}, use Solenoid on your machine:`, "dim");
      logLine(out, "  pulley install polymorphia.solenoid && solenoid", "acc");
      return;
    }
    spec = { path: tab.path, language };
    shown = { flywheel: "flywheel.js", javascript: "javascript", python: "python (pyodide)" }[language] + " " + tab.path;
  } else {
    const shell = commandFor(tab, text, options.kind);
    if (!shell) { logLine(out, `No command runs .${extension(tab.path)} files yet. Add one under "Run" in the settings, for example:`, "dim"); logLine(out, `  > ${extension(tab.path) || "ext"} = some-program {file}`, "acc"); return; }
    spec = { shell, cwd: options.kind === "test" ? "" : dirName(tab.path) };
    shown = shell;
  }
  lastRun = tab.path;
  logLine(out, "› " + shown, "dim");
  const cwd = isWeb ? "" : spec.cwd;
  let collected = "", opened = false;
  const started = performance.now();
  $("#stdin-row").hidden = false;
  $("#stdin").placeholder = "Type input for the program and press Enter";
  $("#panel-info").textContent = "running " + tab.name;
  $("#status").classList.add("busy");
  Wheel.setRunning(true);
  Sound.play("run");
  const job = { path: tab.path };
  running = job;
  renderRunButton();
  job.handle = host.run(spec, {
    out(chunk, isError) {
      collected += chunk;
      log(out, chunk, isError ? "err" : "", cwd);
      if (!opened && flag("Browser", "open served sites")) {
        const m = /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s"'<>)\]]*/.exec(collected);
        if (m) { opened = true; setTimeout(() => browser.navigate(m[0].replace("0.0.0.0", "127.0.0.1").replace(/[.,;:]+$/, "")), 250); }
      }
    },
    input() { $("#stdin").placeholder = "The program is waiting for input"; $("#stdin").focus(); },
    app(app, send) { browser.app(app, send, tab.name); },
    done(result) {
      if (running !== job) return;
      running = null;
      const seconds = result.seconds || (performance.now() - started) / 1000;
      const time = seconds < 1 ? Math.round(seconds * 1000) + " ms" : seconds.toFixed(2) + " s";
      const stopped = job.stopped || result.status === 130 || result.status === 143;
      if (collected && !collected.endsWith("\n")) log(out, "\n");
      logLine(out, stopped ? `■ stopped · ${time}` : result.status === 0 ? `✓ ${result.page ? "the page is open in the browser" : "finished"} · ${time}` : `✕ exit status ${result.status} · ${time}`, stopped ? "dim" : result.status === 0 ? "ok" : "err");
      $("#stdin-row").hidden = true;
      $("#panel-info").textContent = "";
      $("#status").classList.remove("busy");
      Wheel.setRunning(false);
      renderRunButton();
      // Compiler messages in the output become problems.
      const found = [];
      for (const line of collected.replace(ANSI, "").split("\n")) {
        const m = /^(.+?):(\d+):(\d+): (error|warning): (.*)$/.exec(line);
        if (m) found.push({ path: normalize(m[1].startsWith("/") ? rel(m[1]) : joinPath(cwd, m[1])), line: +m[2], column: +m[3], severity: m[4], message: m[5] });
      }
      const byPath = new Map();
      for (const p of found) { if (!byPath.has(p.path)) byPath.set(p.path, []); byPath.get(p.path).push(p); }
      for (const [path, list] of byPath) setProblems(path, "run", list);
      if (!stopped) { pulse(result.status === 0); Sound.play(result.status === 0 ? "ok" : "error"); }
      refreshGit();
      if (!isWeb) refreshTree();
    },
  });
}
async function stopRun() {
  if (!running) return;
  running.stopped = true;
  running.handle.kill();
  await new Promise(resolve => setTimeout(resolve, 60));
}
$("#stdin").addEventListener("keydown", e => {
  if (e.key !== "Enter" || !running) return;
  const text = $("#stdin").value;
  $("#stdin").value = "";
  log($("#output"), text + "\n", "acc");
  running.handle.input(text + "\n");
});

function pulse(ok) {
  const bar = $("#status");
  bar.classList.remove("pulse-ok", "pulse-bad");
  void bar.offsetWidth;
  bar.classList.add(ok ? "pulse-ok" : "pulse-bad");
}
let statusTimer = null;
function flashStatus(text) {
  $("#status-message").textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $("#status-message").textContent = ""; }, 2400);
}

/* ================================================================== panels and views */

function showPanel(name) {
  $("#panel").classList.remove("closed");
  $("#panel-splitter").hidden = false;
  for (const button of $$(".panel-tabs > button[data-panel]")) button.classList.toggle("on", button.dataset.panel === name);
  for (const body of $$(".panel-body")) body.hidden = body.dataset.panel !== name;
  if (name === "console") consoleView.focus();
  else if (name === "terminal") $("#terminal-input").focus();
  saveSession();
}
function currentPanel() { const on = $(".panel-tabs > button.on"); return on ? on.dataset.panel : "output"; }
function togglePanel() {
  const closed = $("#panel").classList.toggle("closed");
  $("#panel-splitter").hidden = closed;
  if (closed) view.focus();
  saveSession();
}
for (const button of $$(".panel-tabs > button[data-panel]")) button.onclick = () => showPanel(button.dataset.panel);
$("#panel-close").onclick = togglePanel;
$("#panel-clear").onclick = () => { const box = { output: "#output", console: "#console-log", terminal: "#terminal-log" }[currentPanel()]; if (box) $(box).replaceChildren(); };

function showView(name, toggle) {
  const sidebar = $("#sidebar");
  const current = $$(".side-view").find(v => !v.hidden);
  if (toggle && !sidebar.classList.contains("closed") && current && current.dataset.view === name) { sidebar.classList.add("closed"); name = null; }
  else sidebar.classList.remove("closed");
  for (const v of $$(".side-view")) v.hidden = name ? v.dataset.view !== name : v.hidden;
  for (const b of $$("#activity button[data-view]")) b.classList.toggle("on", !sidebar.classList.contains("closed") && b.dataset.view === (name || (current && current.dataset.view)));
  if (name === "search") setTimeout(() => $("#search-input").focus());
  if (name === "pulley") renderPulley();
  if (name === "project") renderProject();
  saveSession();
}
for (const button of $$("#activity button[data-view]")) button.onclick = () => showView(button.dataset.view, true);
$("#activity button[data-action=console]").onclick = () => showPanel("console");

/* ------------------------------------------------------------------ search in files */

const runSearch = debounce(async () => {
  const text = $("#search-input").value;
  const box = $("#search-results");
  if (text.length < 2) { box.replaceChildren(el("div.empty", { text: "Type two or more characters." })); return; }
  let result;
  try { result = await host.call("search", { query: text, case: $("#search-case").checked }); } catch (e) { box.replaceChildren(el("div.empty", { text: e.message })); return; }
  if ($("#search-input").value !== text) return;
  if (!result.matches.length) { box.replaceChildren(el("div.empty", { text: "No results." })); return; }
  const nodes = [];
  let file = null;
  const counts = {};
  for (const m of result.matches) counts[m.path] = (counts[m.path] || 0) + 1;
  for (const m of result.matches) {
    if (m.path !== file) { file = m.path; nodes.push(el("div.result-file", el("span.dot", { style: { width: "7px", height: "7px", borderRadius: "2px", background: UI.fileColor(m.path) } }), el("span", { text: m.path }), el("span.n", { text: counts[m.path] }))); }
    const at = ($("#search-case").checked ? m.text : m.text.toLowerCase()).indexOf($("#search-case").checked ? text : text.toLowerCase());
    nodes.push(el("div.result", { onclick: () => openFile(m.path, { line: m.line, column: m.column }), html: `<span class="ln">${m.line}</span>` + (at >= 0 ? escapeHtml(m.text.slice(0, at)) + "<mark>" + escapeHtml(m.text.slice(at, at + text.length)) + "</mark>" + escapeHtml(m.text.slice(at + text.length)) : escapeHtml(m.text)) }));
  }
  if (result.more) nodes.push(el("div.empty", { text: "More results were left out; narrow the search." }));
  box.replaceChildren(...nodes);
}, 220);
$("#search-input").addEventListener("input", runSearch);
$("#search-case").addEventListener("change", runSearch);

/* ------------------------------------------------------------------ Pulley */

const KNOWN_PACKAGES = ["polymorphia.driveshaft", "polymorphia.solenoid", "polymorphia.brace", "polymorphia.clutch", "polymorphia.gearbox"];
const registryCache = new Map();
async function registryInfo(address) {
  const m = /^([\w-]+)\.([\w-]+)$/.exec(address.trim());
  if (!m) return null;
  if (!registryCache.has(address)) {
    registryCache.set(address, fetch(`${SolenoidHosts.REGISTRY}/v1/${m[1]}/${m[2]}`).then(r => r.ok ? r.json() : null).catch(() => null));
  }
  return registryCache.get(address);
}
let pulleyBusy = false, pulleyLog = "";

async function pulleyCommand(args, label) {
  if (pulleyBusy) return;
  pulleyBusy = true;
  pulleyLog = "› " + label + "\n";
  renderPulley();
  const finish = ok => { pulleyBusy = false; packageNames = []; moduleCache.clear(); afterFileChange(""); renderPulley(); Sound.play(ok ? "ok" : "error"); pulse(ok); };
  if (isWeb) {
    try {
      const lines = args[0] === "add" ? await host.call("packages/add", { address: args[1] }) : args[0] === "remove" ? await host.call("packages/remove", { name: args[1] }) : ["this command needs Pulley on your machine"];
      pulleyLog += lines.join("\n") + "\n";
      finish(true);
    } catch (e) { pulleyLog += e.message + "\n"; finish(false); }
    return;
  }
  host.run({ shell: "pulley " + args.map(shellQuote).join(" "), cwd: "" }, {
    out(text) { pulleyLog += text.replace(ANSI, ""); const box = $("#pulley .log"); if (box) { box.textContent = pulleyLog; box.scrollTop = box.scrollHeight; } },
    done(result) { if (result.status !== 0) pulleyLog += `exit status ${result.status}\n`; finish(result.status === 0); },
  });
}

async function renderPulley() {
  const box = $("#pulley");
  let state;
  try { state = await host.call("packages", {}); } catch (e) { box.replaceChildren(el("div.empty", { text: e.message })); return; }
  packageNames = state.installed.map(p => p.name);
  const nodes = [];
  const manifest = state.manifest, pkg = manifest && manifest.package || null;
  if (!state.pulley) nodes.push(el("p.hint", "Pulley is not installed. See ", el("code", { text: "flywheel.polymorphia.dev" }), " for how to install it."));
  if (pkg) {
    nodes.push(el("h3", { text: "This project" }), el("div.card", el("div.top", el("span.pname", { text: (pkg.author ? pkg.author + "." : "") + (pkg.name || "unnamed") }), el("span.ver", { text: pkg.version || "" })),
      pkg.description ? el("div.desc", { text: pkg.description }) : null,
      el("div.row", el("button.chip", { text: "pulley.toml", onclick: () => openFile("pulley.toml") }),
        isWeb ? null : el("button.chip", { text: "install", title: "pulley install", onclick: () => pulleyCommand(["install"], "pulley install") }),
        isWeb ? null : el("button.chip", { text: "update", title: "pulley update", onclick: () => pulleyCommand(["update"], "pulley update") }),
        isWeb ? null : el("button.chip", { text: "outdated", title: "pulley outdated", onclick: () => pulleyCommand(["outdated"], "pulley outdated") }))));
  } else {
    nodes.push(el("p.hint", "This folder is not a Pulley project yet. Adding a package creates ", el("code", { text: "pulley.toml" }), "."),
      isWeb ? null : el("button.small-btn", { text: "Create pulley.toml", onclick: () => pulleyCommand(["init"], "pulley init") }));
  }
  // Add a package.
  const field = el("input.field", { type: "text", placeholder: "author.name", spellcheck: "false", autocomplete: "off" });
  const found = el("div.hint");
  const add = el("button.small-btn.acc", { text: "Add", disabled: pulleyBusy, onclick: () => { if (field.value.trim()) pulleyCommand(["add", field.value.trim()], "pulley add " + field.value.trim()); } });
  const lookup = debounce(async () => {
    const address = field.value.trim().split("=")[0];
    if (!/^[\w-]+\.[\w-]+$/.test(address)) { found.textContent = ""; return; }
    const data = await registryInfo(address);
    if (field.value.trim().split("=")[0] !== address) return;
    found.textContent = data ? `${address}: latest ${data.latest}` + (data.releases && data.releases.length > 1 ? ` (${data.releases.length} releases)` : "") : `${address} is not on wednesware.org`;
  }, 300);
  field.addEventListener("input", lookup);
  field.addEventListener("keydown", e => { if (e.key === "Enter") add.click(); });
  const chips = el("div.chips");
  nodes.push(el("h3", { text: "Add a package" }), el("div.add", field, add), found, chips);
  for (const address of KNOWN_PACKAGES) {
    if (packageNames.includes(address.split(".")[1])) continue;
    registryInfo(address).then(data => { if (data) chips.append(el("button.chip", { text: address, title: "latest " + data.latest, onclick: () => { field.value = address; lookup(); field.focus(); } })); });
  }
  // What the project depends on, and what is installed.
  const dependencies = manifest && manifest.dependencies || {};
  const names = [...new Set(Object.keys(dependencies).concat(packageNames))];
  nodes.push(el("h3", { text: names.length ? "Packages" : "No packages yet" }));
  for (const name of names) {
    const installed = state.installed.find(p => p.name === name);
    const meta = installed && installed.manifest && installed.manifest.package || {};
    const wanted = dependencies[name];
    const direct = name in dependencies;
    nodes.push(el("div.card", el("div.top", el("span.pname", { text: name }), el("span.ver", { text: meta.version || (installed ? "" : "not installed") })),
      meta.description ? el("div.desc", { text: meta.description }) : null,
      el("div.desc", { text: direct ? (typeof wanted === "string" ? wanted : JSON.stringify(wanted)) : "needed by another package" }),
      el("div.row", el("button.chip.acc", { text: "import " + name, title: "Add this import to the open file", onclick: () => insertImport(name) }),
        installed ? el("button.chip", { text: "files", onclick: () => reveal(".flywheel-modules/" + name) }) : null,
        direct ? el("button.chip.danger", { text: "remove", onclick: () => pulleyCommand(["remove", name], "pulley remove " + name) }) : null)));
  }
  if (pulleyLog) nodes.push(el("h3", { text: pulleyBusy ? "Working…" : "Last command" }), el("div.log", { text: pulleyLog }));
  box.replaceChildren(...nodes.filter(Boolean));
}
$("#pulley-refresh").onclick = renderPulley;

function insertImport(name) {
  if (!active || active.language.id !== "flywheel") { toast("Open a Flywheel file to add the import"); return; }
  const lines = view.state.doc.toString().split("\n");
  if (lines.some(l => new RegExp("^\\s*import\\s+" + name + "\\b").test(l))) { toast(name + " is already imported"); return; }
  let at = 0, offset = 0;
  lines.forEach((line, i) => { if (/^\s*import\b/.test(line)) at = i + 1; });
  for (let i = 0; i < at; i++) offset += lines[i].length + 1;
  view.dispatch({ changes: { from: offset, insert: "import " + name + "\n" } });
  flashStatus("Added import " + name);
}

/* ------------------------------------------------------------------ the Driveshaft console */

const consoleHistory = [];
let consoleAt = 0, consoleSource = "", consoleBusy = false;
$("#console-mode").hidden = true;

function unfinished(code) {
  let depth = 0, brackets = 0;
  for (const raw of code.split("\n")) {
    const line = FL.stripComment(raw).trim();
    if (!line) continue;
    for (const c of line.replace(/"(?:[^"\\]|\\.)*"/g, "")) { if ("([{".includes(c)) brackets++; else if (")]}".includes(c)) brackets--; }
    if (/^end\b/.test(line)) depth--;
    else if (FL.OPENS.test(line) && !/=>/.test(line) && !/^(else|catch|finally|case)\b/.test(line)) depth++;
  }
  return depth > 0 || brackets > 0;
}

async function consoleSubmit(v) {
  const code = v.state.doc.toString();
  if (!code.trim() || consoleBusy) return true;
  if (unfinished(code)) return false;
  const box = $("#console-log");
  consoleHistory.push(code);
  consoleAt = consoleHistory.length;
  code.split("\n").forEach((line, i) => { const row = el("span.entry"); row.append(el("span." + (i ? "dim" : "acc"), { text: i ? "…   " : "fw› " }), line + "\n"); box.append(row); });
  box.scrollTop = box.scrollHeight;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "" } });
  const trimmed = code.trim();
  if (trimmed === "clear") { box.replaceChildren(); return true; }
  if (trimmed === ":help" || trimmed === "help") {
    logLine(box, "Flywheel, line by line. An expression prints its value; blocks run when they are complete.\n`return <markup>` opens the page in the built-in browser; other returned values are printed.\n:reset forgets the session, :show lists it, :undo takes back the last statement, clear empties this log.\nUp and Down recall inputs; Shift+Enter adds a line.", "dim");
    return true;
  }
  consoleBusy = true;
  Wheel.setRunning(true);
  try {
    const result = await host.call("console/eval", { session: "main", mode: "serve", code: trimmed.startsWith(":") ? trimmed : code });
    if (result.unfinished) { v.dispatch({ changes: { from: 0, insert: code + "\n" }, selection: { anchor: code.length + 1 } }); consoleHistory.pop(); return true; }
    if (trimmed === ":reset") { consoleSource = ""; logLine(box, "session cleared", "dim"); }
    if (result.output) log(box, result.output);
    if (result.errors) log(box, result.errors.replace(/\n?$/, "\n"), "err");
    if (result.returned === "page") { browser.document(/<html/i.test(result.value) ? result.value : "<!doctype html><html><head><meta charset=\"utf-8\">" + PLAIN_PAGE + "</head><body>" + result.value + "</body></html>", "console"); logLine(box, "the page is open in the browser", "ok"); }
    else if (result.returned === "value") logLine(box, "=> " + String(result.value).trim());
    else if (result.returned === "exit") logLine(box, "return ends a program; here the session goes on (:reset starts over)", "dim");
    if (result.status === 0 && !trimmed.startsWith(":")) consoleSource += code + "\n";
    if (result.status !== 0) Sound.play("error");
  } catch (e) { log(box, e.message + "\n", "err"); }
  consoleBusy = false;
  Wheel.setRunning(!!running);
  box.scrollTop = box.scrollHeight;
  return true;
}

const consoleLanguage = new LanguageSupport(flywheelLanguage, [flywheelLanguage.data.of({ autocomplete(context) {
  const typed = context.state.doc.toString();
  const result = FL.completions(consoleSource + typed, consoleSource.length + context.pos, flywheelEnv);
  if (!result || (!context.explicit && result.from === consoleSource.length + context.pos && !/[.]$/.test(typed.slice(0, context.pos)))) return null;
  return { from: result.from - consoleSource.length, options: result.options.filter(o => !o.snippet && !o.addImport).map(o => ({ label: o.label, detail: o.detail, info: o.info, type: o.type, boost: o.boost })), validFor: result.validFor };
} })]);
const consoleView = new EditorView({ parent: $("#console-editor"), state: EditorState.create({ doc: "", extensions: [
  CM.commands.history(), drawSelection(), syntaxHighlighting(highlightStyle), bracketMatching(), closeBrackets(), indentOnInput(), autocompletion({ icons: true }),
  consoleLanguage, EditorState.tabSize.of(4), indentUnit.of("    "), EditorView.lineWrapping,
  CM.view.placeholder("Flywheel, line by line. Try: var x = 4, then x * 2. :help for more."),
  keymap.of([
    { key: "Enter", run: v => { if (CM.autocomplete.completionStatus(v.state) === "active" && CM.autocomplete.selectedCompletion(v.state)) return false; consoleSubmit(v).then(done => { if (!done) CM.commands.insertNewlineAndIndent(v); }); return true; } },
    { key: "Shift-Enter", run: CM.commands.insertNewlineAndIndent },
    { key: "ArrowUp", run: v => { if (v.state.doc.lineAt(v.state.selection.main.head).number !== 1 || consoleAt === 0) return false; consoleAt--; const text = consoleHistory[consoleAt]; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: text.length } }); return true; } },
    { key: "ArrowDown", run: v => { if (v.state.doc.lineAt(v.state.selection.main.head).number !== v.state.doc.lines || consoleAt >= consoleHistory.length) return false; consoleAt++; const text = consoleHistory[consoleAt] || ""; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: text.length } }); return true; } },
    { key: "Ctrl-l", run: () => { $("#console-log").replaceChildren(); return true; } },
    ...closeBracketsKeymap, ...completionKeymap, ...CM.commands.defaultKeymap, ...CM.commands.historyKeymap, CM.commands.indentWithTab]),
  EditorView.theme({ "&": { color: "var(--fg)", backgroundColor: "transparent" }, ".cm-content": { caretColor: "var(--acc)" }, ".cm-cursor": { borderLeftColor: "var(--acc)", borderLeftWidth: "2px" }, ".cm-selectionBackground": { backgroundColor: "var(--sel) !important" }, ".cm-placeholder": { color: "var(--faint)" } }),
  EditorView.updateListener.of(u => { if (u.docChanged) for (const tr of u.transactions) if (tr.isUserEvent("input.type")) { Wheel.push(46); Sound.play("key"); } }),
] }) });

/* ------------------------------------------------------------------ the terminal */

const terminal = { cwd: "", job: null, history: [], at: 0 };
if (isWeb) $("#terminal-tab").hidden = true;
function terminalPrompt() { $("#terminal-prompt").textContent = (terminal.cwd ? terminal.cwd + " " : "") + "$"; }
$("#terminal-input").addEventListener("keydown", async e => {
  const input = $("#terminal-input"), box = $("#terminal-log");
  if (e.key === "c" && e.ctrlKey && terminal.job) { e.preventDefault(); terminal.job.kill(); return; }
  if (e.key === "ArrowUp" && terminal.at > 0) { e.preventDefault(); terminal.at--; input.value = terminal.history[terminal.at]; return; }
  if (e.key === "ArrowDown") { e.preventDefault(); terminal.at = Math.min(terminal.history.length, terminal.at + 1); input.value = terminal.history[terminal.at] || ""; return; }
  if (e.key !== "Enter") return;
  const line = input.value;
  input.value = "";
  if (terminal.job) { log(box, line + "\n", "acc"); terminal.job.input(line + "\n"); return; }
  if (!line.trim()) return;
  terminal.history.push(line);
  terminal.at = terminal.history.length;
  logLine(box, (terminal.cwd ? terminal.cwd + " " : "") + "$ " + line, "cmd");
  if (line.trim() === "clear") { box.replaceChildren(); return; }
  const cd = /^\s*cd(?:\s+(.*))?$/.exec(line);
  if (cd) {
    const target = normalize(cd[1] && cd[1].trim() !== "~" ? joinPath(cd[1].trim().startsWith("/") ? "" : terminal.cwd, cd[1].trim().replace(/^["']|["']$/g, "")) : "");
    try { const there = await host.call("fs/exists", { path: target }); if (there.dir || target === "") terminal.cwd = rel(target); else logLine(box, "cd: no such directory: " + cd[1], "err"); }
    catch (err) { logLine(box, err.message, "err"); }
    terminalPrompt();
    return;
  }
  Wheel.setRunning(true);
  input.placeholder = "Input for the running command (Ctrl+C stops it)";
  terminal.job = host.run({ shell: line, cwd: terminal.cwd }, {
    out(text) { log(box, text, "", terminal.cwd); },
    done(result) {
      terminal.job = null;
      input.placeholder = "Run a command in the project";
      if (result.status !== 0) logLine(box, "exit status " + result.status, "dim");
      Wheel.setRunning(!!running);
      refreshTree(); refreshGit(); refreshFiles();
    },
  });
});

/* ================================================================== palette and commands */

const commands = [];
function command(id, title, run, when) { commands.push({ id, title, run, when }); }
function keyFor(id) { const found = Object.entries(shortcuts).find(([, c]) => c === id); return found ? found[0] : ""; }

function openPalette(prefix) {
  refreshFiles();
  Palette.open({ placeholder: "Go to file  ·  > command  ·  @ symbol  ·  : line", value: prefix || "", items(text) {
    if (text.startsWith(">")) {
      const q = text.slice(1).trim();
      return commands.filter(c => !c.when || c.when()).map(c => ({ c, m: fuzzy(q, c.title) })).filter(x => x.m).sort((a, b) => b.m.score - a.m.score)
        .map(x => ({ title: x.c.title, marks: x.m.marks, keys: keyFor(x.c.id), run: x.c.run }));
    }
    if (text.startsWith("@")) {
      const q = text.slice(1).trim();
      return outlineItems.map(s => ({ s, m: fuzzy(q, s.name) })).filter(x => x.m).sort((a, b) => q ? b.m.score - a.m.score : a.s.line - b.s.line)
        .map(x => ({ title: x.s.name, marks: x.m.marks, hint: (x.s.kind || "") + " · line " + x.s.line, run: () => jumpTo(x.s.line, 1) }));
    }
    if (text.startsWith(":")) {
      const n = parseInt(text.slice(1), 10);
      return active && n > 0 ? [{ title: "Go to line " + n, hint: active.name, run: () => jumpTo(n, 1) }] : [{ title: "Type a line number", run() {} }];
    }
    const open = tabs.filter(x => x.path !== SETTINGS).map(x => x.path);
    const all = [...new Set(open.concat(fileList))];
    return all.map(path => ({ path, m: fuzzy(text, path) })).filter(x => x.m).sort((a, b) => b.m.score - a.m.score + (text ? 0 : open.indexOf(b.path) - open.indexOf(a.path))).slice(0, 80)
      .map(x => ({ title: baseName(x.path), hint: dirName(x.path), color: UI.fileColor(x.path), marks: fuzzy(text, baseName(x.path)) ? fuzzy(text, baseName(x.path)).marks : null, run: () => openFile(x.path) }));
  } });
}
Palette.onClose = () => { if (active) view.focus(); };

function toggleSetting(section, key) {
  const on = !flag(section, key);
  changeSetting(section, key, on ? "on" : "off");
  return on;
}
/* Writes one setting to solenoid.cw (and to its tab, when it is open). */
async function changeSetting(section, key, value) {
  const settingsTab = tabs.find(x => x.path === SETTINGS);
  const text = Cogwheel.parse(settingsTab ? tabText(settingsTab) : configText).set(section, key, value);
  if (settingsTab) replaceText(settingsTab, text);
  configText = text; conf = Cogwheel.parse(text); applySettings();
  try { await host.call("config/save", { text }); if (settingsTab) { settingsTab.saved = (settingsTab === active ? view.state : settingsTab.state).doc; settingsTab.dirty = false; renderTabs(); } }
  catch (e) { toast("Could not save the settings: " + e.message, "error"); }
}

command("run", "Run the open file", () => runActive());
command("run again", "Run the last file again", () => runActive({ again: true }));
command("stop", "Stop the running program", stopRun, () => !!running);
command("test", "Run the tests", () => runActive({ kind: "test" }));
command("run in window", "Run as a desktop window (flywheel --desktop)", () => runActive({ kind: "window" }), () => !isWeb && active && active.language.id === "flywheel");
command("preview", "Preview the open file in the browser", () => active && active.path !== SETTINGS && previewFile(active.path), () => active && ["html", "markdown", "cogwheel"].includes(active.language.id));
command("save", "Save", () => saveTab());
command("save all", "Save all files", saveAll);
command("quick open", "Go to file…", () => openPalette(""));
command("command palette", "Show all commands", () => openPalette("> "));
command("go to symbol", "Go to symbol in this file…", () => openPalette("@"));
command("go to line", "Go to line…", () => openPalette(":"));
command("find", "Find and replace in this file", () => { view.focus(); CM.search.openSearchPanel(view); });
command("find in files", "Search in files", () => showView("search"));
command("toggle sidebar", "Toggle the sidebar", () => { const current = $$(".side-view").find(v => !v.hidden); showView(current ? current.dataset.view : "files", true); });
command("toggle panel", "Toggle the bottom panel", togglePanel);
command("toggle browser", "Toggle the built-in browser", () => browser.toggle());
command("console", "Open the Driveshaft console", () => showPanel("console"));
command("terminal", "Open the terminal", () => showPanel("terminal"), () => !isWeb);
command("problems", "Show problems", () => showPanel("problems"));
command("close tab", "Close the tab", () => closeTab(active));
command("next tab", "Next tab", () => tabs.length && activate(tabs[(tabs.indexOf(active) + 1) % tabs.length]));
command("previous tab", "Previous tab", () => tabs.length && activate(tabs[(tabs.indexOf(active) - 1 + tabs.length) % tabs.length]));
command("new file", "New file…", () => newFile());
command("new folder", "New folder…", () => newFolder(""));
command("settings", "Settings (solenoid.cw)", () => openFile(SETTINGS));
command("format", "Format the file", formatActive);
command("zen mode", "Zen mode", () => { document.body.classList.toggle("zen"); view.requestMeasure(); view.focus(); });
command("go to definition", "Go to definition", () => active && goToDefinition(view.state.selection.main.head));
command("toggle comment", "Toggle comment", () => CM.commands.toggleComment(view));
command("fold all", "Fold all blocks", () => CM.language.foldAll(view));
command("unfold all", "Unfold all blocks", () => CM.language.unfoldAll(view));
command("toggle sounds", "Sounds: turn on or off", () => { const on = toggleSetting("Feel", "sounds"); if (on) { Sound.on = true; Sound.play("ok"); } toast("Sounds " + (on ? "on" : "off")); });
command("toggle animations", "Animations: turn on or off", () => toast("Animations " + (toggleSetting("Feel", "animations") ? "on" : "off")));
command("toggle momentum", "Flywheel momentum: turn on or off", () => toast("Momentum " + (toggleSetting("Feel", "momentum") ? "on" : "off")));
command("toggle word wrap", "Word wrap: turn on or off", () => toggleSetting("Editor", "word wrap"));
command("toggle auto format", "Format on save: turn on or off", () => toast("Format on save " + (toggleSetting("Editor", "format on save") ? "on" : "off")));
for (const name of Object.keys(UI.THEMES)) command("theme " + name, "Theme: " + name, () => changeSetting("Theme", "theme", name));
command("reveal", "Reveal the file in the tree", () => active && reveal(active.path), () => active && active.path !== SETTINGS);
command("copy path", "Copy the file's path", () => active && copyText(active.path), () => active && active.path !== SETTINGS);
command("pulley", "Pulley: packages", () => showView("pulley"));
command("outline", "Show the outline", () => showView("outline"));
command("project", "Show the project: modules, packages, resources", () => showView("project"));
command("new module", "New module…", () => newModule());
command("refresh", "Refresh the file tree", () => afterFileChange());
command("open folder", "Open another folder…", openFolder, () => !isWeb);
command("import files", "Import files from your computer…", importFiles, () => isWeb);
command("download file", "Download the open file", downloadActive, () => isWeb && active && active.path !== SETTINGS);
command("reset workspace", "Reset the workspace to the starter files", resetWorkspace, () => isWeb);
command("reset settings", "Reset the settings to their defaults", async () => { if (await ask({ title: "Reset the settings?", text: "solenoid.cw goes back to its defaults.", ok: "Reset", danger: true })) { const tab = tabs.find(x => x.path === SETTINGS); if (tab) replaceText(tab, info.defaultConfig); configText = info.defaultConfig; conf = Cogwheel.parse(configText); applySettings(); await host.call("config/save", { text: configText }); } });

async function openFolder() {
  const path = await ask({ title: "Open folder", text: "A path on this machine.", value: info.root });
  if (!path) return;
  await saveAll();
  try { info = await host.call("root", { path }); } catch (e) { toast(e.message, "error"); return; }
  for (const tab of tabs.slice()) if (tab.path !== SETTINGS) await closeTab(tab, true);
  tree.expanded = new Set([""]); tree.listings.clear(); problems.clear(); project.expanded.clear(); project.collapsed.clear(); terminal.cwd = ""; terminalPrompt();
  await startProject();
}
function importFiles() {
  const input = el("input", { type: "file", multiple: true });
  input.onchange = async () => {
    for (const file of input.files) { try { await host.call("fs/write", { path: file.name, text: await file.text() }); } catch (e) { toast(e.message, "error"); } }
    await afterFileChange("");
    if (input.files.length) openFile(input.files[0].name);
  };
  input.click();
}
function downloadActive() {
  const link = el("a", { href: URL.createObjectURL(new Blob([tabText(active)], { type: "text/plain" })), download: active.name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function resetWorkspace() {
  if (!(await ask({ title: "Reset the workspace?", text: "Every file in this browser workspace is replaced by the starter files.", ok: "Reset", danger: true }))) return;
  for (const tab of tabs.slice()) if (tab.path !== SETTINGS) await closeTab(tab, true);
  host.files.clear(); host.dirs.clear();
  for (const [path, text] of Object.entries(SolenoidSamples.files)) host.files.set(path, text);
  host.persist();
  await afterFileChange();
  openFile("README.md");
}

addEventListener("keydown", e => {
  const name = UI.keyName(e);
  if (!name) return;
  if (!$("#dialog").hidden) return;
  if (Palette.isOpen()) { if (name === "Esc") Palette.close(); if (shortcuts[name] === "quick open" || shortcuts[name] === "command palette") { e.preventDefault(); Palette.close(); } return; }
  if (name === "Esc" && document.body.classList.contains("zen")) { document.body.classList.remove("zen"); return; }
  const id = shortcuts[name];
  if (!id) return;
  const found = commands.find(c => c.id === id);
  if (!found || (found.when && !found.when())) return;
  e.preventDefault();
  e.stopPropagation();
  found.run();
}, true);

/* ================================================================== applying the settings */

function applySettings() {
  darkTheme = UI.applyTheme(setting("Theme", "theme"), conf.entries("Colors"));
  const style = document.documentElement.style;
  style.setProperty("--mono", setting("Editor", "font") || "monospace");
  style.setProperty("--font-size", Math.max(8, Math.min(40, number("Editor", "font size", 14))) + "px");
  style.setProperty("--line-height", String(Math.max(1, Math.min(3, number("Editor", "line height", 1.6)))));
  const motion = flag("Feel", "animations") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.classList.toggle("anim", motion);
  document.body.classList.toggle("no-motion", !motion);
  Wheel.enabled = flag("Feel", "momentum") && motion;
  Sound.on = flag("Feel", "sounds");
  Sound.volume = Math.max(0, Math.min(1, number("Feel", "volume", 0.4)));
  shortcuts = {};
  const keys = Object.assign({}, defaults.entries("Keys"), conf.entries("Keys"));
  for (const [id, key] of Object.entries(keys)) if (key && !/^(none|off)$/i.test(key)) shortcuts[UI.normalKey(key)] = id;
  $("#finder-key").textContent = (keyFor("quick open") || "").replace(/\+/g, " ");
  reconfigureAll();
  renderStatus();
  view.requestMeasure();
}
const previewSettings = debounce(() => {
  const tab = tabs.find(x => x.path === SETTINGS);
  if (!tab) return;
  conf = Cogwheel.parse(tabText(tab));
  applySettings();
}, 200);

function renderStatus() {
  $("#status-language").textContent = active ? active.language.name : "";
  $("#status-indent").textContent = active ? "Spaces: " + number("Editor", "tab size", 4) : "";
  const sound = $("#status-sound"), motion = $("#status-motion");
  sound.replaceChildren(icon(Sound.on ? "sound" : "mute"));
  sound.classList.toggle("on", Sound.on);
  motion.replaceChildren(icon("motion"));
  motion.classList.toggle("on", document.body.classList.contains("anim"));
  $("#status-host").textContent = isWeb ? "browser · flywheel.js" : "local · " + baseName(info.root || "");
  $("#project").textContent = isWeb ? "browser workspace" : info.name || info.root;
  $("#project").title = isWeb ? "Files are kept in this browser" : info.root;
  $("#files-title").textContent = isWeb ? "Workspace" : info.name || "Files";
  document.title = (active ? active.name + " · " : "") + (isWeb ? "Solenoid" : (info.name || "Solenoid") + " · Solenoid");
}

/* ================================================================== welcome */

function renderWelcome() {
  const box = $("#welcome");
  const action = (title, id) => el("button", { onclick: () => commands.find(c => c.id === id).run() }, el("span", { text: title }), keyFor(id) ? el("kbd", { text: keyFor(id) }) : null);
  const preferred = fileList.filter(f => !f.includes("/") || f.split("/").length < 3).sort((a, b) => (/\.(fw|fly)$/.test(b) - /\.(fw|fly)$/.test(a)) || (/readme/i.test(b) - /readme/i.test(a)) || a.localeCompare(b)).slice(0, 7);
  box.replaceChildren(el("div.welcome-box",
    el("div.welcome-head", el("div.welcome-wheel", el("img", { src: "logo.png", alt: "" })),
      el("h1", "Solenoid", el("small", { text: isWeb ? "The Flywheel IDE, in your browser. Files stay in this browser." : "The Flywheel IDE · " + info.root }))),
    el("div.welcome-grid",
      el("div", el("h2", { text: "Start" }), el("div.welcome-list", action("New file", "new file"), action("Go to file", "quick open"), action("All commands", "command palette"),
        action("Driveshaft console", "console"), action("Pulley packages", "pulley"), action("Settings", "settings"))),
      el("div", el("h2", { text: preferred.length ? "Files" : "Keys" }), el("div.welcome-list", preferred.length
        ? preferred.map(path => el("button", { onclick: () => openFile(path) }, el("span", { text: baseName(path) }), el("span.path", { text: dirName(path) })))
        : [action("Run", "run"), action("Save", "save"), action("Search in files", "find in files")]))),
    el("div.welcome-note", isWeb
      ? ["Flywheel, JavaScript, and Python run here in the browser. For the compiler, a terminal, and every other language: ", el("code", { text: "pulley install polymorphia.solenoid" }), ", then ", el("code", { text: "solenoid" }), "."]
      : [el("code", { text: keyFor("run") || "F5" }), " runs the open file, ", el("code", { text: keyFor("console") || "Ctrl+`" }), " opens the Driveshaft console, and every setting lives in ", el("code", { text: "solenoid.cw" }), "."])));
}

/* ================================================================== the session (what was open) */

const sessionKey = "solenoid:" + (isWeb ? "web" : info.root);
let restoring = true;
const saveSession = debounce(() => {
  if (restoring) return;
  const style = getComputedStyle(document.documentElement);
  const data = {
    open: tabs.filter(x => x.path !== SETTINGS).map(x => x.path), active: active ? active.path : null, expanded: [...tree.expanded],
    sidebar: style.getPropertyValue("--sidebar"), panel: style.getPropertyValue("--panel-h"), browser: style.getPropertyValue("--browser"),
    projectExpanded: [...project.expanded], projectCollapsed: [...project.collapsed],
    sidebarClosed: $("#sidebar").classList.contains("closed"), panelClosed: $("#panel").classList.contains("closed"),
    view: ($$(".side-view").find(v => !v.hidden) || {}).dataset ? $$(".side-view").find(v => !v.hidden).dataset.view : "files", panelTab: currentPanel(),
  };
  try { localStorage.setItem(sessionKey, JSON.stringify(data)); } catch (e) { /* storage is full or unavailable */ }
}, 400);

async function startProject() {
  restoring = true;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("solenoid:" + (isWeb ? "web" : info.root)) || "{}"); } catch (e) { saved = {}; }
  const style = document.documentElement.style;
  if (saved.sidebar) style.setProperty("--sidebar", saved.sidebar);
  if (saved.panel) style.setProperty("--panel-h", saved.panel);
  if (saved.browser) style.setProperty("--browser", saved.browser);
  for (const dir of saved.expanded || []) tree.expanded.add(dir);
  for (const id of saved.projectExpanded || []) project.expanded.add(id);
  for (const id of saved.projectCollapsed || []) project.collapsed.add(id);
  renderStatus();
  await Promise.all([refreshTree(), refreshFiles()]);
  refreshGit();
  refreshProject();
  showView(saved.view || "files");
  if (saved.sidebarClosed || innerWidth < 820) $("#sidebar").classList.add("closed");
  showPanel(saved.panelTab && !(isWeb && saved.panelTab === "terminal") ? saved.panelTab : "output");
  if (saved.panelClosed) { $("#panel").classList.add("closed"); $("#panel-splitter").hidden = true; }
  for (const path of saved.open || []) if (fileList.includes(path)) await openFile(path);
  const wanted = tabs.find(x => x.path === saved.active);
  if (wanted) activate(wanted);
  else if (!tabs.length && isWeb && !saved.open && fileList.includes("hello.fw")) { await openFile("README.md"); await openFile("hello.fw"); }
  renderTabs(); renderRunButton(); renderProblems(); renderStatus();
  restoring = false;
}

/* ================================================================== wiring */

$("#run").onclick = () => runActive();
$("#stop").onclick = stopRun;
$("#test").onclick = () => runActive({ kind: "test" });
$("#brand").onclick = () => openPalette("> ");
$("#finder").onclick = () => openPalette("");
$("#open-settings").onclick = () => openFile(SETTINGS);
$("#toggle-browser").onclick = () => browser.toggle();
$("#new-file").onclick = () => newFile();
$("#new-folder").onclick = () => newFolder("");
$("#refresh-files").onclick = () => afterFileChange();
$("#project").onclick = e => {
  const box = e.currentTarget.getBoundingClientRect();
  menu(box.left, box.bottom + 4, isWeb
    ? [{ label: "Import files…", run: importFiles }, { label: "Reset to the starter files", run: resetWorkspace, danger: true }]
    : [{ label: "Open another folder…", run: openFolder }, { label: "Copy the folder's path", run: () => copyText(info.root) }, { label: "Open the terminal here", run: () => showPanel("terminal") }]);
};
$("#browser-back").onclick = () => browser.back();
$("#browser-forward").onclick = () => browser.forward();
$("#browser-reload").onclick = () => browser.reload();
$("#browser-close").onclick = () => browser.hide();
$("#browser-external").onclick = () => { const entry = browser.entries[browser.index]; if (!entry) return; if (entry.kind === "url") host.call("open", { url: entry.url }).catch(() => window.open(entry.url, "_blank", "noopener")); else { const w = window.open("", "_blank"); if (w) { w.document.write(entry.html); w.document.close(); } } };
$("#browser-url").addEventListener("keydown", e => { if (e.key === "Enter") browser.navigate($("#browser-url").value); });
$("#browser-url").addEventListener("focus", e => e.target.select());
$("#status-problems").onclick = () => showPanel("problems");
$("#status-position").onclick = () => openPalette(":");
$("#status-language").onclick = () => active && toast(active.language.name + (active.language.id === "flywheel" ? " · " + info.compiler : ""));
$("#status-indent").onclick = () => openFile(SETTINGS);
$("#status-branch").onclick = () => { showPanel("terminal"); $("#terminal-input").value = "git status"; };
$("#status-sound").onclick = () => commands.find(c => c.id === "toggle sounds").run();
$("#status-motion").onclick = () => commands.find(c => c.id === "toggle animations").run();
$("#tabs").addEventListener("dblclick", e => { if (e.target === $("#tabs")) newFile(); });
$("#tabs").addEventListener("wheel", e => { if (e.deltaY) { $("#tabs").scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

UI.splitter($("[data-split=sidebar]"), { variable: "--sidebar", side: "left", min: 160, max: r => r.width * 0.6, container: () => $("#sidebar"), onEnd: saveSession });
UI.splitter($("#browser-splitter"), { variable: "--browser", side: "right", min: 220, max: r => r.width - 200, container: () => $("#work"), onEnd: saveSession });
UI.splitter($("#panel-splitter"), { variable: "--panel-h", side: "bottom", min: 90, max: r => r.height - 120, container: () => $(".center"), onEnd: saveSession });

addEventListener("beforeunload", e => { if (tabs.some(x => x.dirty)) { e.preventDefault(); e.returnValue = ""; } });
/* A file changed outside the editor is read again, unless it has unsaved changes here. */
addEventListener("focus", async () => {
  if (isWeb || !active || active.dirty || active.path === SETTINGS) return;
  const tab = active;
  try { const read = await host.call("fs/read", { path: tab.path }); if (read.text != null && !tab.dirty && tab === active && read.text !== tabText(tab)) { replaceText(tab, read.text); tab.saved = view.state.doc; tab.dirty = false; renderTabs(); flashStatus(tab.name + " changed on disk"); } } catch (e) { /* the file is gone; keep what is open */ }
  refreshGit();
});
if (isWeb) {
  addEventListener("dragover", e => e.preventDefault());
  addEventListener("drop", async e => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) { try { await host.call("fs/write", { path: file.name, text: await file.text() }); } catch (err) { toast(err.message, "error"); } }
    afterFileChange("");
  });
}

applySettings();
terminalPrompt();
browser.home();
await startProject();
window.Solenoid = { host, tabs, openFile, runActive, browser, commands, view: () => view, info };
})();
