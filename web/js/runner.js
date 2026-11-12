/* The browser build's program runner (a Web Worker): Flywheel through flywheel.js, JavaScript,
 * and Python through Pyodide. Running off the main thread means a runaway loop is stopped by
 * terminating the worker. After a Flywheel run the interpreter stays alive, so event handlers of
 * a page shown in the built-in browser can call back into the program. */
importScripts("../vendor/flywheel.js");

const NEED_INPUT = { needInput: true };
let I = null, appRoot = null, handlers = [], session = null, sessionOut = [], buffer = [], runId = 0, pyodide = null;

function flush() { if (buffer.length) { postMessage({ type: "out", id: runId, lines: buffer }); buffer = []; } }
function print(s) { buffer.push({ s: String(s) }); if (buffer.length >= 200) flush(); }
function error(s) { buffer.push({ s: String(s), err: true }); if (buffer.length >= 200) flush(); }

/* The modules of the project (and its installed packages) become importable. */
const builtinLibraries = Object.assign({}, Flywheel.libraries);
function setModules(modules) {
  for (const k of Object.keys(Flywheel.libraries)) if (!(k in builtinLibraries)) delete Flywheel.libraries[k];
  Object.assign(Flywheel.libraries, builtinLibraries, modules || {});
}

/* The page a program returned: <head> content, <body> attributes and content. Event attributes
 * holding Flywheel functions become data-fw-on* hooks whose numbers index `handlers`. */
function renderApp() {
  if (!appRoot) return null;
  handlers = [];
  const hooks = (el, attr, fn) => { handlers.push(fn); return ` data-fw-${attr.toLowerCase()}="${handlers.length - 1}"`; };
  const inner = el => el.children.map(c => typeof c === "string" ? I.render(c) : I.render(c, hooks)).join("");
  let head = "", body, bodyAttrs = "", title = null;
  if (appRoot.tag === "html") {
    const h = appRoot.children.find(c => c && c.tag === "head");
    const b = appRoot.children.find(c => c && c.tag === "body");
    if (h) head = h.children.map(c => I.render(c)).join("");
    if (b) {
      const open = /^<body([^>]*)>/.exec(I.render(b));
      bodyAttrs = open ? open[1] : "";
      body = inner(b);
    } else body = appRoot.children.filter(c => !(c && c.tag === "head")).map(c => I.render(c, hooks)).join("");
  } else body = I.render(appRoot, hooks);
  const t = appRoot.tag === "title" ? appRoot : I.query(appRoot, "title", false);
  if (t) title = I.elText(t);
  return { head, body, bodyAttrs, title, isDoc: appRoot.tag === "html" };
}

function runFlywheel(m) {
  const t0 = performance.now();
  appRoot = null; handlers = [];
  setModules(m.modules);
  let r, need = false;
  try {
    r = Flywheel.run(m.code, { print, error, name: m.name || "main.fw", stdin: m.stdin || [], args: m.args || [], onInput() { throw NEED_INPUT; } });
  } catch (err) {
    if (err === NEED_INPUT) need = true;
    else error("flywheel.js internal error: " + (err && err.message || err));
    r = { status: 1 };
  }
  flush();
  if (need) { postMessage({ type: "input", id: m.id }); return; }
  I = r.interp || null;
  if (r.value instanceof Flywheel.FwElement) appRoot = r.value;
  let app = null;
  try {
    if (appRoot) app = renderApp();
    else if (r.html != null) app = { head: "", body: r.html, bodyAttrs: "", title: null, isDoc: /<html/i.test(r.html) };
    else if (r.text != null) app = { head: "", body: "<pre>" + r.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</pre>", bodyAttrs: "", title: null, isDoc: false };
  } catch (err) { error("could not render the page: " + (err && err.message || err)); }
  flush();
  postMessage({ type: "done", id: m.id, status: r.status || 0, ms: performance.now() - t0, app });
}

function show(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || String(value);
  try { return typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value); } catch (e) { return String(value); }
}

function runJavaScript(m) {
  const t0 = performance.now();
  const out = (...a) => { print(a.map(show).join(" ")); flush(); };
  const err = (...a) => { error(a.map(show).join(" ")); flush(); };
  const fake = { log: out, info: out, debug: out, warn: err, error: err, table: out, assert(c, ...a) { if (!c) err("Assertion failed:", ...a); } };
  let status = 0;
  try { new Function("console", m.code + "\n//# sourceURL=" + (m.name || "main.js"))(fake); }
  catch (e) { err(e && e.stack ? String(e.stack).split("\n").slice(0, 4).join("\n") : String(e)); status = 1; }
  flush();
  postMessage({ type: "done", id: m.id, status, ms: performance.now() - t0, app: null });
}

async function runPython(m) {
  const t0 = performance.now();
  let status = 0, need = false;
  try {
    if (!pyodide) {
      print("loading Python (Pyodide)…"); flush();
      importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
      pyodide = await loadPyodide();
    }
    const lines = (m.stdin || []).slice();
    pyodide.setStdout({ batched: s => print(s) });
    pyodide.setStderr({ batched: s => error(s) });
    pyodide.setStdin({ stdin: () => { if (!lines.length) { need = true; throw new Error("input needed"); } return lines.shift(); } });
    try { pyodide.FS.mkdir("/project"); } catch (e) { /* exists */ }
    for (const [path, text] of Object.entries(m.files || {})) {
      const parts = path.split("/");
      let dir = "/project";
      for (const part of parts.slice(0, -1)) { dir += "/" + part; try { pyodide.FS.mkdir(dir); } catch (e) { /* exists */ } }
      pyodide.FS.writeFile("/project/" + path, text);
    }
    pyodide.FS.chdir("/project");
    await pyodide.runPythonAsync("import sys\nif '/project' not in sys.path: sys.path.insert(0, '/project')\nfor _m in [k for k, v in sys.modules.items() if getattr(v, '__file__', None) and str(v.__file__).startswith('/project')]: del sys.modules[_m]");
    await pyodide.runPythonAsync(m.code, { filename: m.name || "main.py", globals: pyodide.toPy({ __name__: "__main__" }) });
  } catch (e) {
    status = 1;
    if (!need) error(String(e && e.message || e).replace(/^PythonError: /, "").trimEnd());
  }
  flush();
  if (need) { postMessage({ type: "input", id: m.id }); return; }
  postMessage({ type: "done", id: m.id, status, ms: performance.now() - t0, app: null });
}

onmessage = e => {
  const m = e.data;
  if (m.type === "run") {
    runId = m.id;
    if (m.language === "flywheel") runFlywheel(m);
    else if (m.language === "javascript") runJavaScript(m);
    else if (m.language === "python") runPython(m);
  } else if (m.type === "event") {
    // An event in the page: call the handler, then send the page as it is now.
    runId = m.id;
    const fn = handlers[m.hid];
    if (!I || !fn) return;
    const params = fn instanceof Flywheel.FwFunc ? fn.params : fn instanceof Flywheel.Bound ? fn.fn.params : [];
    const err = I.callFromHost(fn, params.length ? [m.value == null ? "" : String(m.value)] : []);
    if (err) error(err);
    flush();
    let app = null;
    try { app = renderApp(); } catch (er) { error("could not render the page: " + (er && er.message || er)); }
    flush();
    postMessage({ type: "app", id: m.id, app });
  } else if (m.type === "check") {
    // Syntax only: flywheel.js does not check types.
    let problems = [];
    try { Flywheel.parse(m.code, m.name || "main.fw"); }
    catch (err) {
      if (err instanceof Flywheel.CompileError) problems = [{ path: m.path, line: err.line || 1, column: err.col || 1, severity: "error", message: err.message }];
    }
    postMessage({ type: "checked", id: m.id, problems });
  } else if (m.type === "console") {
    // One input of the console: a session that keeps its variables.
    setModules(m.modules);
    sessionOut = [];
    const out = s => sessionOut.push({ s: String(s) }), err = s => sessionOut.push({ s: String(s), err: true });
    if (!session || m.reset) session = new Flywheel.Session({ print: out, error: err });
    let status = 0, value = null, page = null;
    if (!m.reset) {
      try {
        const r = session.exec(m.code);
        status = r && r.status || 0;
        if (r && r.value instanceof Flywheel.FwElement) page = session.I.render(r.value);
        else if (r && r.value !== undefined && r.value !== null && /^\s*return\b/.test(m.code)) value = session.I.show ? session.I.show(r.value, true) : String(r.value);
      } catch (e2) { err("flywheel.js internal error: " + (e2 && e2.message || e2)); status = 1; }
    }
    postMessage({ type: "console", id: m.id, status, lines: sessionOut, value, page });
  }
};
