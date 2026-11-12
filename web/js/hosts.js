/* Where Solenoid's files and programs are.
 *
 * LocalHost talks to the Flywheel host (solenoid.fw) over HTTP: real files, the compiler, any
 * program, Pulley. BrowserHost is the web build: files in this browser's storage, Flywheel
 * through flywheel.js. Both answer the same requests:
 *
 *   call(method, params) -> Promise        fs/list, fs/read, fs/write, search, check, ...
 *   run(spec, on) -> { input(text), kill() }
 *       spec: { path, language, shell, cwd }; on: { out(text, isError), done({status, seconds}), app(page), input() }
 */
(function (root) {
"use strict";

/* ------------------------------------------------------------------ the local machine */

class LocalHost {
  constructor(token) { this.kind = "local"; this.token = token; }

  async call(method, params) {
    const response = await fetch("/api/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Solenoid-Token": this.token },
      body: JSON.stringify(params || {}),
    });
    let data = null;
    try { data = await response.json(); } catch (e) { throw new Error("the host answered " + response.status); }
    if (!response.ok || (data && data.error)) throw new Error(data && data.error || "the host answered " + response.status);
    return data;
  }

  /* The address of a project file, for the built-in browser. */
  fileUrl(path) { return "/project/" + this.token + "/" + path.split("/").map(encodeURIComponent).join("/"); }

  run(spec, on) {
    let id = null, offset = 0, stopped = false, timer = null;
    const poll = async (method, extra) => {
      if (id == null) return;
      try {
        const state = await this.call(method || "run/poll", Object.assign({ id, offset }, extra || {}));
        offset = state.offset;
        if (state.text) on.out(state.text, false);
        if (!state.alive) { stopped = true; on.done({ status: state.status, seconds: state.seconds }); return; }
      } catch (e) { stopped = true; on.out(String(e.message || e) + "\n", true); on.done({ status: 1, seconds: 0 }); return; }
      if (!stopped) timer = setTimeout(poll, 110);
    };
    this.call("run/start", { shell: spec.shell, cwd: spec.cwd || "" }).then(r => { id = r.id; poll(); },
      e => { on.out(String(e.message || e) + "\n", true); on.done({ status: 1, seconds: 0 }); });
    return {
      input: text => { if (id != null && !stopped) this.call("run/input", { id, offset: 1e15, text }).catch(() => {}); },
      kill: () => { if (id != null && !stopped) { clearTimeout(timer); poll("run/kill"); } },
    };
  }
}

/* ------------------------------------------------------------------ the browser */

const DB = "solenoid", STORE = "kv";
function idb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(value, key); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); });
}

const REGISTRY = "https://dstbs.wednesware.org";
const WEB_LANGUAGES = { flywheel: 1, javascript: 1, python: 1 };

class BrowserHost {
  constructor() {
    this.kind = "web";
    this.files = new Map();      // path -> text
    this.dirs = new Set();       // explicit (possibly empty) directories
    this.config = "";
    this.worker = null;
    this.pending = new Map();    // id -> handlers of a run or a request
    this.nextId = 1;
    this.saveTimer = null;
  }

  async load() {
    let saved = null;
    try { saved = await idbGet("workspace"); } catch (e) { /* private mode: keep the workspace in memory */ }
    if (saved && saved.files) {
      for (const [path, text] of Object.entries(saved.files)) this.files.set(path, text);
      for (const d of saved.dirs || []) this.dirs.add(d);
      this.config = saved.config || "";
    } else {
      for (const [path, text] of Object.entries(root.SolenoidSamples.files)) this.files.set(path, text);
    }
    this.defaultConfig = await (await fetch("solenoid.cw")).text();
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      idbSet("workspace", { files: Object.fromEntries(this.files), dirs: [...this.dirs], config: this.config }).catch(() => {});
    }, 250);
  }

  isDir(path) {
    if (path === "") return true;
    if (this.dirs.has(path)) return true;
    const prefix = path + "/";
    for (const p of this.files.keys()) if (p.startsWith(prefix)) return true;
    for (const p of this.dirs) if (p.startsWith(prefix)) return true;
    return false;
  }

  list(path) {
    const prefix = path ? path + "/" : "";
    const dirs = new Set(), files = [];
    for (const [p, text] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length), slash = rest.indexOf("/");
      if (slash < 0) files.push({ name: rest, dir: false, size: text.length });
      else dirs.add(rest.slice(0, slash));
    }
    for (const d of this.dirs) if (d.startsWith(prefix) && d !== path) dirs.add(d.slice(prefix.length).split("/")[0]);
    return [...dirs].sort().map(name => ({ name, dir: true, size: 0 })).concat(files.sort((a, b) => a.name.localeCompare(b.name)));
  }

  /* Flywheel modules that `import name` can reach from the project: files at the top level
   * and the main modules of installed packages. */
  modules() {
    const out = {};
    for (const [path, text] of this.files) {
      let m = /^([A-Za-z_]\w*)\.(fw|fly)$/.exec(path);
      if (m) { out[m[1]] = text; continue; }
      m = /^\.flywheel-modules\/([A-Za-z_]\w*)\/([^/]+)\.fw$/.exec(path);
      if (m && (m[2] === m[1] || m[2] === "main" || m[2] === "lib") && !(m[1] in out)) out[m[1]] = text;
    }
    return out;
  }

  getWorker() {
    if (this.worker) return this.worker;
    this.worker = new Worker("js/runner.js");
    this.worker.onmessage = e => {
      const m = e.data, h = this.pending.get(m.id);
      if (!h) return;
      if (m.type === "out") h.out && h.out(m.lines);
      else if (m.type === "done" || m.type === "input" || m.type === "checked" || m.type === "console" || m.type === "app") h.message(m);
    };
    this.worker.onerror = e => { for (const h of this.pending.values()) h.message({ type: "done", status: 1, ms: 0, crashed: String(e.message || e) }); };
    return this.worker;
  }

  restartWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.pending.clear();
  }

  ask(message) {
    const id = this.nextId++;
    return new Promise(resolve => {
      this.pending.set(id, { message: m => { this.pending.delete(id); resolve(m); } });
      this.getWorker().postMessage(Object.assign({ id }, message));
    });
  }

  async call(method, p) {
    p = p || {};
    switch (method) {
      case "info":
        return { version: "1.0.0", root: "", name: "workspace", home: "", compiler: "flywheel.js " + (root.SOLENOID_FLYWHEELJS || ""), config: this.config, configPath: "browser storage", defaultConfig: this.defaultConfig, tools: [], posix: false, web: true };
      case "fs/list": return this.list(p.path || "");
      case "fs/read":
        if (!this.files.has(p.path)) throw new Error("no such file: " + p.path);
        return { text: this.files.get(p.path) };
      case "fs/write": this.files.set(p.path, p.text); this.persist(); return { ok: true };
      case "fs/mkdir": this.dirs.add(p.path); this.persist(); return { ok: true };
      case "fs/exists": return { exists: this.files.has(p.path) || this.isDir(p.path), dir: this.isDir(p.path) && !this.files.has(p.path) };
      case "fs/remove": {
        const prefix = p.path + "/";
        for (const k of [...this.files.keys()]) if (k === p.path || k.startsWith(prefix)) this.files.delete(k);
        for (const d of [...this.dirs]) if (d === p.path || d.startsWith(prefix)) this.dirs.delete(d);
        this.persist();
        return { ok: true };
      }
      case "fs/move": case "fs/copy": {
        if (this.files.has(p.to) || this.isDir(p.to)) throw new Error(p.to.split("/").pop() + " already exists");
        const prefix = p.from + "/";
        for (const [k, text] of [...this.files]) {
          if (k !== p.from && !k.startsWith(prefix)) continue;
          this.files.set(p.to + k.slice(p.from.length), text);
          if (method === "fs/move") this.files.delete(k);
        }
        for (const d of [...this.dirs]) if (d === p.from || d.startsWith(prefix)) { this.dirs.add(p.to + d.slice(p.from.length)); if (method === "fs/move") this.dirs.delete(d); }
        this.persist();
        return { ok: true };
      }
      case "fs/walk": return [...this.files.keys()].filter(k => !k.startsWith(".flywheel-modules/")).sort();
      case "search": {
        const matches = [], needle = p.case ? p.query : p.query.toLowerCase();
        let more = false;
        for (const [path, text] of this.files) {
          if (path.startsWith(".flywheel-modules/")) continue;
          const lines = text.split("\n");
          for (let i = 0; i < lines.length && !more; i++) {
            const at = (p.case ? lines[i] : lines[i].toLowerCase()).indexOf(needle);
            if (at < 0) continue;
            if (matches.length >= 400) { more = true; break; }
            matches.push({ path, line: i + 1, column: at + 1, text: lines[i].trim().slice(0, 240) });
          }
        }
        return { matches, more };
      }
      case "check": {
        if (p.language === "flywheel") return (await this.ask({ type: "check", code: p.text, path: p.path, name: p.path })).problems;
        if (p.language === "json") {
          try { JSON.parse(p.text); return []; }
          catch (e) {
            const at = /position (\d+)/.exec(e.message);
            const before = at ? p.text.slice(0, +at[1]).split("\n") : [""];
            return [{ path: p.path, line: before.length, column: before[before.length - 1].length + 1, severity: "error", message: e.message }];
          }
        }
        return [];
      }
      case "format": return { text: root.FlywheelLang.format(p.text) };
      case "packages": return this.packages();
      case "packages/add": return this.install(p.address);
      case "packages/remove": return this.uninstall(p.name);
      case "console/eval": {
        if (p.code === ":reset") { await this.ask({ type: "console", reset: true, code: "" }); return { status: 0, output: "", errors: "", returned: "", value: "", unfinished: false }; }
        const r = await this.ask({ type: "console", code: p.code, modules: this.modules() });
        const text = lines => lines.map(l => l.s + "\n").join("");
        return {
          status: r.status, output: text(r.lines.filter(l => !l.err)), errors: text(r.lines.filter(l => l.err)),
          returned: r.page != null ? "page" : r.value != null ? "value" : "", value: r.page != null ? r.page : r.value != null ? r.value : "", unfinished: false,
        };
      }
      case "config/save": this.config = p.text; this.persist(); return { ok: true };
      case "git": return { ok: false, text: "" };
      case "open": window.open(p.url, "_blank", "noopener"); return { ok: true };
    }
    throw new Error("not available in the browser: " + method);
  }

  fileUrl() { return null; }

  canRun(language) { return !!WEB_LANGUAGES[language]; }

  /* Runs a file with flywheel.js, as JavaScript, or with Pyodide. input() works by running
   * again: when the program asks for a line that was not typed yet, the run stops, the line
   * is asked for, and the program runs again with every line typed so far. */
  run(spec, on) {
    const started = performance.now();
    const typed = [];
    let shown = 0, id = null, killed = false, waiting = false;
    const send = event => this.getWorker().postMessage({ type: "event", id, hid: event.hid, value: event.value });
    const start = () => {
      id = this.nextId++;
      let seen = 0;
      this.pending.set(id, {
        out: lines => {
          for (const line of lines) {
            seen++;
            if (seen > shown) { on.out(line.s + "\n", !!line.err); shown = seen; }
          }
        },
        message: m => {
          if (m.type === "input") { this.pending.delete(id); waiting = true; on.input && on.input(); return; }
          if (m.type === "app") { if (m.app && on.app) on.app(m.app, send); return; }
          if (m.crashed) on.out(m.crashed + "\n", true);
          if (m.app && on.app) on.app(m.app, send);
          else this.pending.delete(id);
          on.done({ status: m.status, seconds: (performance.now() - started) / 1000, page: !!m.app });
        },
      });
      const text = this.files.get(spec.path) || "";
      const message = { type: "run", id, language: spec.language, code: text, name: spec.path, stdin: typed.slice() };
      if (spec.language === "flywheel") { const modules = this.modules(); delete modules[spec.path.replace(/\.(fw|fly)$/, "")]; message.modules = modules; }
      if (spec.language === "python") message.files = Object.fromEntries([...this.files].filter(([k]) => k.endsWith(".py")));
      this.getWorker().postMessage(message);
    };
    start();
    return {
      input: text => {
        if (!waiting || killed) return;
        waiting = false;
        typed.push(text.replace(/\n$/, ""));
        start();
      },
      kill: () => {
        if (killed) return;
        killed = true;
        this.restartWorker();
        on.done({ status: 130, seconds: (performance.now() - started) / 1000 });
      },
    };
  }

  /* ---------------------------------------------------------------- packages */

  manifest() {
    const text = this.files.get("pulley.toml");
    if (!text) return null;
    const out = { package: {}, dependencies: {} };
    let table = "";
    for (const line of text.split("\n")) {
      const t = /^\s*\[([\w-]+)\]/.exec(line);
      if (t) { table = t[1]; continue; }
      const kv = /^\s*([\w.-]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
      if (kv && (table === "package" || table === "dependencies")) out[table][kv[1]] = kv[2];
    }
    return out;
  }

  packages() {
    const installed = [];
    for (const entry of this.list(".flywheel-modules")) {
      if (!entry.dir) continue;
      let manifest = {};
      const text = this.files.get(".flywheel-modules/" + entry.name + "/pulley.toml") || "";
      const pick = key => (new RegExp("^\\s*" + key + "\\s*=\\s*\"(.*)\"", "m").exec(text) || [])[1] || "";
      manifest = { package: { name: pick("name"), author: pick("author"), version: pick("version"), description: pick("description") } };
      installed.push({ name: entry.name, manifest, record: {} });
    }
    return { manifest: this.manifest(), installed, pulley: true, root: "", web: true };
  }

  /* Installs author.name[=version] from the registry into .flywheel-modules, with the
   * packages it depends on. Returns what was installed, as lines of text. */
  async install(address, seen) {
    seen = seen || new Set();
    const m = /^\s*([\w-]+)\.([\w-]+)(?:\s*=\s*[\^~=]*\s*([\w.\-*]+))?\s*$/.exec(address);
    if (!m) throw new Error("write the package as author.name (for example polymorphia.cogwheel)");
    const [, author, name, wanted] = m;
    if (seen.has(author + "." + name)) return [];
    seen.add(author + "." + name);
    const base = REGISTRY + "/v1/" + encodeURIComponent(author) + "/" + encodeURIComponent(name);
    const info = await fetch(base);
    if (!info.ok) throw new Error(author + "." + name + " was not found on wednesware.org");
    const distribution = await info.json();
    const version = wanted && distribution.releases && distribution.releases.includes(wanted) ? wanted : distribution.latest;
    const archive = await fetch(base + "/" + encodeURIComponent(version) + "/" + encodeURIComponent(version) + ".tar.gz");
    if (!archive.ok) throw new Error("could not download " + author + "." + name + "=" + version);
    const bytes = new Uint8Array(await new Response(archive.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    const files = untar(bytes);
    const manifest = Object.entries(files).find(([k]) => /(^|\/)pulley\.toml$/.test(k) && k.split("/").length <= 2);
    if (!manifest) throw new Error(author + "." + name + " is not a Flywheel package (it has no pulley.toml)");
    const strip = manifest[0].replace(/pulley\.toml$/, "");
    for (const k of [...this.files.keys()]) if (k.startsWith(".flywheel-modules/" + name + "/")) this.files.delete(k);
    for (const [path, text] of Object.entries(files)) if (path.startsWith(strip)) this.files.set(".flywheel-modules/" + name + "/" + path.slice(strip.length), text);
    const lines = ["installed " + author + "." + name + "=" + version];
    // Its dependencies, from its [dependencies] table.
    let table = "";
    for (const line of manifest[1].split("\n")) {
      const t = /^\s*\[([\w-]+)\]/.exec(line);
      if (t) { table = t[1]; continue; }
      const dep = /^\s*[\w-]+\s*=\s*"([\w-]+\.[\w-]+)(?:@[^="]*)?(?:=([^"]*))?"/.exec(line);
      if (table === "dependencies" && dep) {
        try { lines.push(...await this.install(dep[1], seen)); } catch (e) { lines.push("  could not install " + dep[1] + ": " + e.message); }
      }
    }
    if (seen.size === 1 || [...seen][0] === author + "." + name) {
      // Record the dependency in pulley.toml.
      let toml = this.files.get("pulley.toml") || '[package]\nname = "workspace"\nauthor = ""\nversion = "0.1.0"\n\n[dependencies]\n';
      const entry = name + ' = "' + author + "." + name + "=^" + version + '"';
      const existing = new RegExp("^" + name + "\\s*=.*$", "m");
      if (existing.test(toml)) toml = toml.replace(existing, entry);
      else if (/^\[dependencies\]\s*$/m.test(toml)) toml = toml.replace(/^\[dependencies\]\s*$/m, "[dependencies]\n" + entry);
      else toml = toml.replace(/\s*$/, "\n\n[dependencies]\n" + entry + "\n");
      this.files.set("pulley.toml", toml);
    }
    this.persist();
    return lines;
  }

  uninstall(name) {
    for (const k of [...this.files.keys()]) if (k.startsWith(".flywheel-modules/" + name + "/")) this.files.delete(k);
    const toml = this.files.get("pulley.toml");
    if (toml) this.files.set("pulley.toml", toml.replace(new RegExp("^" + name + "\\s*=.*\\n?", "m"), ""));
    this.persist();
    return ["removed " + name];
  }
}

/* The text files of a tar archive: { path: text }. */
function untar(bytes) {
  const out = {};
  const decoder = new TextDecoder();
  let at = 0, longName = null;
  while (at + 512 <= bytes.length) {
    const header = bytes.subarray(at, at + 512);
    if (header.every(b => b === 0)) break;
    const field = (from, length) => decoder.decode(header.subarray(from, from + length)).replace(/\0.*$/, "");
    let name = field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    const prefix = field(345, 155);
    if (prefix) name = prefix + "/" + name;
    const data = bytes.subarray(at + 512, at + 512 + size);
    if (type === "L") longName = decoder.decode(data).replace(/\0.*$/, "");
    else {
      if (longName) { name = longName; longName = null; }
      if ((type === "0" || type === "\0") && !data.subarray(0, 4000).includes(0)) out[name.replace(/^\.\//, "")] = decoder.decode(data);
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

root.SolenoidHosts = { LocalHost, BrowserHost, REGISTRY };
})(typeof self !== "undefined" ? self : this);
