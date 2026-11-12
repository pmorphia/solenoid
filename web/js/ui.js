/* Solenoid's interface helpers: elements, icons, themes, sounds, the flywheel's momentum,
 * toasts, dialogs, menus, and the palette. app.js builds the IDE from these (`UI`). */
(function (root) {
"use strict";

const $ = (selector, parent) => (parent || document).querySelector(selector);
const $$ = (selector, parent) => [...(parent || document).querySelectorAll(selector)];

/* el("div.a.b", { title: "x", onclick: f }, child, "text", ...) */
function el(spec, attrs, ...children) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) if (child != null && child !== false) node.append(child);
  return node;
}

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------------ icons */

const ICONS = {
  play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>',
  flask: '<path d="M6 2h4M6.5 2v4L3 12.5A1 1 0 0 0 3.9 14h8.2a1 1 0 0 0 .9-1.5L9.5 6V2M5 10h6"/>',
  globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2.6 4 2.6 6S10 12 8 14c-2-2-2.6-4-2.6-6S6 4 8 2z"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2"/>',
  files: '<path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.500-1.5V6z"/><path d="M9 2v4h4"/>',
  search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2 14 14"/>',
  package: '<path d="M8 1.8 13.5 5v6L8 14.200 2.500 11V5z"/><path d="M2.500 5 8 8.200 13.500 5M8 8.200v6"/>',
  outline: '<path d="M3 4h10M5.500 8h7.500M5.500 12h7.500"/><circle cx="3" cy="8" r=".6"/><circle cx="3" cy="12" r=".6"/>',
  terminal: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 6.500 7 8 5 9.500M8.500 10h2.500"/>',
  "file-plus": '<path d="M9 2H4.500A1.500 1.500 0 0 0 3 3.500v9A1.500 1.500 0 0 0 4.500 14h7a1.500 1.500 0 0 0 1.500-1.500V6z"/><path d="M8 7.500v4M6 9.500h4"/>',
  "folder-plus": '<path d="M2 4.500A1.500 1.500 0 0 1 3.500 3H6l1.500 1.500h5A1.500 1.500 0 0 1 14 6v5.500a1.500 1.500 0 0 1-1.500 1.500h-9A1.500 1.500 0 0 1 2 11.500z"/><path d="M8 7v3.500M6.200 8.800h3.600"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.500-3.500M13 3v2.500h-2.500"/>',
  left: '<path d="M10 3 5 8l5 5"/>',
  right: '<path d="m6 3 5 5-5 5"/>',
  x: '<path d="m4 4 8 8M12 4l-8 8"/>',
  external: '<path d="M9 3h4v4M13 3 7.500 8.500M11 9.500V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.500"/>',
  clear: '<path d="M3 4.500h10M6 4.500V3h4v1.500M4.500 4.500l.500 8.500h6l.500-8.500"/>',
  chevron: '<path d="m6 3.500 4.500 4.500L6 12.500"/>',
  branch: '<circle cx="4.500" cy="3.500" r="1.500"/><circle cx="4.500" cy="12.500" r="1.500"/><circle cx="11.500" cy="5.500" r="1.500"/><path d="M4.500 5v6M11.500 7c0 2.500-7 1.500-7 4"/>',
  sound: '<path d="M3 6.500v3h2.500L9 12.500v-9L5.500 6.500z"/><path d="M11 6c.8.600.8 3.400 0 4M12.600 4.500c1.800 1.600 1.800 5.400 0 7"/>',
  mute: '<path d="M3 6.500v3h2.500L9 12.500v-9L5.500 6.500z"/><path d="m11.500 6.500 3 3M14.500 6.500l-3 3"/>',
  motion: '<path d="M2 8c2-5 4-5 6 0s4 5 6 0"/>',
  error: '<circle cx="8" cy="8" r="6"/><path d="m6 6 4 4M10 6l-4 4"/>',
  warning: '<path d="M8 2.500 14 13H2z"/><path d="M8 6.500v3M8 11.300v.100"/>',
  check: '<path d="m3.500 8.500 3 3 6-7"/>',
};
function icon(name) {
  const body = (ICONS[name] || "").replace(/(\d)\.(\d)00(?=\D)/g, "$1.$2");
  return el("span", { html: `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>` }).firstChild;
}
function mountIcons(parent) { for (const node of $$("[data-icon]", parent)) { node.replaceWith(icon(node.dataset.icon)); } }

/* ------------------------------------------------------------------ themes */

/* The names a theme (and the `Colors` section of solenoid.cw) can set, and their variables. */
const COLOR_NAMES = {
  background: "--bg", panel: "--panel", "panel raised": "--panel2", text: "--fg", dim: "--dim", faint: "--faint", line: "--line",
  accent: "--acc", "accent text": "--acc-ink", selection: "--sel", error: "--err", warning: "--warn", success: "--ok",
  keyword: "--s-keyword", type: "--s-type", string: "--s-string", number: "--s-number", comment: "--s-comment",
  function: "--s-function", variable: "--s-variable", constant: "--s-constant", operator: "--s-operator", tag: "--s-tag", attribute: "--s-attribute",
};
const THEMES = {
  "flywheel dark": { dark: true, background: "#08080a", panel: "#0e0e12", "panel raised": "#15151b", text: "#f2f2ee", dim: "#8b8b94", faint: "#4a4a52", line: "#22222a",
    accent: "#d4ff3a", "accent text": "#08080a", selection: "rgba(212,255,58,.18)", error: "#ff6b6b", warning: "#fbbf24", success: "#86efac",
    keyword: "#c4b5fd", type: "#7dd3fc", string: "#86efac", number: "#fbbf24", comment: "#5f5f6b", function: "#d4ff3a", variable: "#f2f2ee",
    constant: "#fdba74", operator: "#a1a1aa", tag: "#f9a8d4", attribute: "#7dd3fc" },
  "flywheel light": { dark: false, background: "#fafaf7", panel: "#f1f1ec", "panel raised": "#e6e6df", text: "#18181b", dim: "#6b6b76", faint: "#a8a8b0", line: "#dcdcd4",
    accent: "#4d7c0f", "accent text": "#ffffff", selection: "rgba(77,124,15,.18)", error: "#dc2626", warning: "#b45309", success: "#15803d",
    keyword: "#7c3aed", type: "#0369a1", string: "#15803d", number: "#b45309", comment: "#9a9aa3", function: "#4d7c0f", variable: "#18181b",
    constant: "#c2410c", operator: "#52525b", tag: "#be185d", attribute: "#0369a1" },
  midnight: { dark: true, background: "#0b1020", panel: "#10162a", "panel raised": "#182038", text: "#e6e9f5", dim: "#8690b0", faint: "#4a5478", line: "#222b48",
    accent: "#7dd3fc", "accent text": "#0b1020", selection: "rgba(125,211,252,.2)", error: "#fb7185", warning: "#fcd34d", success: "#6ee7b7",
    keyword: "#c4b5fd", type: "#7dd3fc", string: "#a7f3d0", number: "#fcd34d", comment: "#56608a", function: "#93c5fd", variable: "#e6e9f5",
    constant: "#fda4af", operator: "#9aa4c4", tag: "#f0abfc", attribute: "#7dd3fc" },
  ember: { dark: true, background: "#120c0a", panel: "#1a120e", "panel raised": "#241914", text: "#f5ebe4", dim: "#a08c80", faint: "#5e4c42", line: "#2e211b",
    accent: "#ff8a3d", "accent text": "#120c0a", selection: "rgba(255,138,61,.2)", error: "#ff6b6b", warning: "#fbbf24", success: "#a3e635",
    keyword: "#ff8a3d", type: "#fcd34d", string: "#a3e635", number: "#f9a8d4", comment: "#6b5a50", function: "#fdba74", variable: "#f5ebe4",
    constant: "#f9a8d4", operator: "#b8a497", tag: "#fb7185", attribute: "#fcd34d" },
  paper: { dark: false, background: "#fbf7ef", panel: "#f3ecdf", "panel raised": "#e9dfcd", text: "#2b2622", dim: "#7a6f63", faint: "#b3a797", line: "#ddd2bf",
    accent: "#b45309", "accent text": "#ffffff", selection: "rgba(180,83,9,.16)", error: "#b91c1c", warning: "#a16207", success: "#3f6212",
    keyword: "#9a3412", type: "#1d4ed8", string: "#3f6212", number: "#a21caf", comment: "#a39887", function: "#b45309", variable: "#2b2622",
    constant: "#a21caf", operator: "#57534e", tag: "#be123c", attribute: "#1d4ed8" },
};

/* Applies a theme and the overrides of the Colors section. Returns whether it is dark. */
function applyTheme(name, overrides) {
  const theme = THEMES[String(name || "").toLowerCase()] || THEMES["flywheel dark"];
  const style = document.documentElement.style;
  for (const [key, variable] of Object.entries(COLOR_NAMES)) {
    const value = overrides && overrides[key] ? overrides[key] : theme[key];
    if (value) style.setProperty(variable, value);
  }
  document.documentElement.style.colorScheme = theme.dark ? "dark" : "light";
  document.body.classList.toggle("theme-light", !theme.dark);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = (overrides && overrides.background) || theme.background;
  return theme.dark;
}

/* A color for a kind of file, for the small squares in the tree and the tabs. */
const FILE_COLORS = { fw: "var(--acc)", fly: "var(--acc)", cw: "#f9a8d4", md: "#93c5fd", py: "#fcd34d", js: "#fde047", mjs: "#fde047", ts: "#60a5fa", tsx: "#60a5fa", jsx: "#fde047",
  html: "#fb923c", css: "#a78bfa", json: "#a3e635", toml: "#fdba74", yaml: "#fdba74", yml: "#fdba74", c: "#7dd3fc", h: "#7dd3fc", cpp: "#7dd3fc", hpp: "#7dd3fc",
  rs: "#fb923c", go: "#67e8f9", java: "#f87171", rb: "#f87171", php: "#a5b4fc", sh: "#86efac", lua: "#818cf8", sql: "#f0abfc", lock: "var(--faint)", txt: "var(--dim)" };
function fileColor(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return FILE_COLORS[ext] || "var(--faint)";
}

/* ------------------------------------------------------------------ sounds */

const Sound = {
  on: false, volume: 0.4, context: null, last: 0,
  ensure() {
    if (!this.context) { try { this.context = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.on = false; } }
    if (this.context && this.context.state === "suspended") this.context.resume();
    return this.context;
  },
  tone(frequency, start, length, type, gain) {
    const c = this.context, t = c.currentTime + start;
    const osc = c.createOscillator(), amp = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(frequency, t);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime((gain || 0.2) * this.volume, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(c.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  },
  play(name) {
    if (!this.on || !this.ensure()) return;
    const now = performance.now();
    if (name === "key") {
      if (now - this.last < 22) return;
      this.last = now;
      this.tone(1500 + Math.random() * 500, 0, 0.035, "triangle", 0.07);
    } else if (name === "enter") this.tone(700, 0, 0.06, "triangle", 0.1);
    else if (name === "delete") this.tone(520, 0, 0.04, "triangle", 0.07);
    else if (name === "save") { this.tone(660, 0, 0.09, "sine", 0.18); this.tone(990, 0.07, 0.16, "sine", 0.16); }
    else if (name === "run") { this.tone(330, 0, 0.08, "sine", 0.16); this.tone(495, 0.06, 0.08, "sine", 0.16); this.tone(660, 0.12, 0.14, "sine", 0.14); }
    else if (name === "ok") { this.tone(784, 0, 0.1, "sine", 0.18); this.tone(1175, 0.09, 0.26, "sine", 0.16); }
    else if (name === "error") { this.tone(196, 0, 0.16, "sawtooth", 0.1); this.tone(147, 0.11, 0.26, "sawtooth", 0.1); }
    else if (name === "open") this.tone(880, 0, 0.05, "sine", 0.08);
    else if (name === "tick") this.tone(1200, 0, 0.025, "square", 0.04);
  },
};

/* ------------------------------------------------------------------ the flywheel */

/* The logo turns with momentum: every keystroke adds a push, friction slows it down, and a
 * running program keeps it spinning. */
const Wheel = {
  node: null, angle: 0, speed: 0, running: false, enabled: true, frame: null, last: 0,
  attach(node) { this.node = node; },
  push(amount) {
    if (!this.enabled) return;
    this.speed = Math.min(1100, this.speed + (amount || 46));
    this.spin();
  },
  setRunning(on) {
    this.running = on;
    if (this.node) this.node.classList.toggle("running", on);
    if (on) this.spin();
  },
  spin() {
    if (this.frame != null || !this.node) return;
    this.last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const floor = this.running && this.enabled ? 300 : 0;
      this.speed = Math.max(floor, this.speed * Math.pow(0.22, dt) - 14 * dt);
      this.angle = (this.angle + this.speed * dt) % 360;
      this.node.style.transform = `rotate(${this.angle.toFixed(2)}deg)`;
      if (this.speed > 1 || floor) this.frame = requestAnimationFrame(step);
      else this.frame = null;
    };
    this.frame = requestAnimationFrame(step);
  },
};

/* ------------------------------------------------------------------ toasts, dialogs, menus */

function toast(message, kind, ms) {
  const node = el("div.toast" + (kind === "error" ? ".error" : ""), { text: message });
  $("#toasts").append(node);
  setTimeout(() => { node.classList.add("out"); setTimeout(() => node.remove(), 220); }, ms || (kind === "error" ? 5200 : 2600));
}

/* ask({ title, text, value, placeholder, ok, danger }) -> the entered text, true (no field), or null */
function ask(options) {
  return new Promise(resolve => {
    const overlay = $("#dialog"), box = $("#dialog-box");
    const field = options.value != null ? el("input.field", { type: "text", value: options.value, placeholder: options.placeholder || "", spellcheck: "false" }) : null;
    const done = result => { overlay.hidden = true; box.replaceChildren(); document.removeEventListener("keydown", onKey, true); resolve(result); };
    const accept = () => done(field ? field.value.trim() || null : true);
    const onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(null); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); accept(); }
    };
    box.replaceChildren(
      el("h3", { text: options.title }),
      options.text ? el("p", { text: options.text }) : null,
      field,
      el("div.actions", el("button.small-btn", { text: "Cancel", onclick: () => done(null) }),
        el("button.small-btn.acc", { text: options.ok || "OK", onclick: accept, style: options.danger ? { background: "var(--err)", borderColor: "var(--err)", color: "#fff" } : null })));
    overlay.hidden = false;
    overlay.onmousedown = e => { if (e.target === overlay) done(null); };
    document.addEventListener("keydown", onKey, true);
    if (field) { field.focus(); const dot = field.value.lastIndexOf("."); field.setSelectionRange(0, dot > 0 ? dot : field.value.length); }
    else $(".small-btn.acc", box).focus();
  });
}

/* menu(x, y, [{ label, run, key, danger } | null (a line)]) */
function menu(x, y, items) {
  const node = $("#menu");
  const close = () => { node.hidden = true; document.removeEventListener("mousedown", away, true); document.removeEventListener("keydown", onKey, true); };
  const away = e => { if (!node.contains(e.target)) close(); };
  const onKey = e => { if (e.key === "Escape") close(); };
  node.replaceChildren(...items.map(item => item
    ? el("button" + (item.danger ? ".danger" : ""), { onclick: () => { close(); item.run(); } }, item.label, item.key ? el("kbd", { text: item.key }) : null)
    : el("hr")));
  node.hidden = false;
  const box = node.getBoundingClientRect();
  node.style.left = Math.max(4, Math.min(x, innerWidth - box.width - 6)) + "px";
  node.style.top = Math.max(4, Math.min(y, innerHeight - box.height - 6)) + "px";
  setTimeout(() => { document.addEventListener("mousedown", away, true); document.addEventListener("keydown", onKey, true); });
}

/* ------------------------------------------------------------------ fuzzy matching */

/* Scores `text` against the typed `query` (letters in order). Returns null without a match,
 * else { score, marks: [indexes of matched letters] }. */
function fuzzy(query, text) {
  if (!query) return { score: 0, marks: [] };
  const q = query.toLowerCase(), t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) {
    const boundary = at === 0 || /[\/._\- ]/.test(t[at - 1]);
    return { score: 1000 - at - (boundary ? 0 : 40) - text.length * 0.2 + (t.lastIndexOf("/") < at ? 60 : 0), marks: [...q].map((_, i) => at + i) };
  }
  let score = 0, j = 0, last = -2;
  const marks = [];
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] !== q[j]) continue;
    score += i === last + 1 ? 12 : (i === 0 || /[\/._\- ]/.test(t[i - 1]) ? 9 : 1);
    marks.push(i);
    last = i;
    j++;
  }
  return j === q.length ? { score: score - text.length * 0.2, marks } : null;
}

function marked(text, marks) {
  const set = new Set(marks);
  let html = "";
  for (let i = 0; i < text.length; i++) html += set.has(i) ? "<b>" + escapeHtml(text[i]) + "</b>" : escapeHtml(text[i]);
  return html;
}

/* ------------------------------------------------------------------ the palette */

/* Palette.open({ placeholder, value, items(query) -> [{ title, hint, keys, color, marks, run }] }) */
const Palette = {
  provider: null, items: [], selected: 0,
  open(options) {
    this.provider = options.items;
    const overlay = $("#palette"), input = $("#palette-input");
    overlay.hidden = false;
    input.placeholder = options.placeholder || "";
    input.value = options.value || "";
    input.oninput = () => this.refresh();
    input.onkeydown = e => {
      if (e.key === "ArrowDown") { e.preventDefault(); this.move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); this.accept(); }
      else if (e.key === "Escape") { e.preventDefault(); this.close(); }
      else if (e.key === "Tab") e.preventDefault();
    };
    overlay.onmousedown = e => { if (e.target === overlay) this.close(); };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    this.refresh();
  },
  isOpen() { return !$("#palette").hidden; },
  close() { $("#palette").hidden = true; this.provider = null; if (this.onClose) this.onClose(); },
  refresh() {
    if (!this.provider) return;
    this.items = this.provider($("#palette-input").value) || [];
    this.selected = 0;
    this.render();
  },
  render() {
    const list = $("#palette-list");
    if (!this.items.length) { list.replaceChildren(el("div.palette-empty", { text: "Nothing matches." })); return; }
    list.replaceChildren(...this.items.slice(0, 80).map((item, i) => {
      const row = el("div.palette-item" + (i === this.selected ? ".sel" : ""), { onmousemove: () => { if (this.selected !== i) { this.selected = i; this.mark(); } }, onclick: () => { this.selected = i; this.accept(); } },
        item.color ? el("span.dot", { style: { background: item.color } }) : null,
        el("span.title", { html: item.marks ? marked(item.title, item.marks) : escapeHtml(item.title) }),
        item.hint ? el("span.hint", { text: item.hint }) : null,
        item.keys ? el("span.keys", item.keys.split("+").map(k => el("kbd", { text: k }))) : null);
      return row;
    }));
  },
  mark() { $$(".palette-item", $("#palette-list")).forEach((node, i) => node.classList.toggle("sel", i === this.selected)); },
  move(by) {
    if (!this.items.length) return;
    const count = Math.min(this.items.length, 80);
    this.selected = (this.selected + by + count) % count;
    this.mark();
    const node = $$(".palette-item", $("#palette-list"))[this.selected];
    if (node) node.scrollIntoView({ block: "nearest" });
    Sound.play("tick");
  },
  accept() {
    const item = this.items[this.selected];
    if (!item) return;
    if (item.keep) { item.run(); return; }
    this.close();
    item.run();
  },
};

/* ------------------------------------------------------------------ resizing */

/* Dragging a splitter changes a CSS variable: splitter(node, { variable, min, max, side, onEnd }) */
function splitter(node, options) {
  node.addEventListener("mousedown", start => {
    start.preventDefault();
    node.classList.add("dragging");
    document.body.classList.add("dragging-split");
    const rect = options.container().getBoundingClientRect();
    const move = e => {
      let size;
      if (options.side === "left") size = e.clientX - rect.left;
      else if (options.side === "right") size = rect.right - e.clientX;
      else size = rect.bottom - e.clientY;
      size = Math.max(options.min, Math.min(options.max(rect), size));
      document.documentElement.style.setProperty(options.variable, size + "px");
      if (options.onMove) options.onMove(size);
    };
    const up = () => {
      node.classList.remove("dragging");
      document.body.classList.remove("dragging-split");
      removeEventListener("mousemove", move);
      removeEventListener("mouseup", up);
      if (options.onEnd) options.onEnd();
    };
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
  });
}

/* "Ctrl+Shift+P" from a keydown event, in the spelling solenoid.cw uses. */
function keyName(e) {
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key === "ArrowLeft") key = "Left";
  else if (key === "ArrowRight") key = "Right";
  else if (key === "ArrowUp") key = "Up";
  else if (key === "ArrowDown") key = "Down";
  else if (key === "Escape") key = "Esc";
  else if (key.length === 1) key = key.toUpperCase();
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";
  if (e.code === "Backquote") key = "`";
  if (e.code === "Comma") key = ",";
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  return (e.ctrlKey || e.metaKey ? "Ctrl+" : "") + (e.shiftKey ? "Shift+" : "") + (e.altKey ? "Alt+" : "") + key;
}
function normalKey(text) {
  const parts = String(text).split("+").map(p => p.trim()).filter(Boolean);
  const key = parts.pop() || "";
  const mods = parts.map(p => p.toLowerCase());
  const has = m => mods.includes(m);
  return (has("ctrl") || has("cmd") || has("meta") ? "Ctrl+" : "") + (has("shift") ? "Shift+" : "") + (has("alt") ? "Alt+" : "") + (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
}

root.UI = { $, $$, el, escapeHtml, icon, mountIcons, COLOR_NAMES, THEMES, applyTheme, fileColor, Sound, Wheel, toast, ask, menu, fuzzy, marked, Palette, splitter, keyName, normalKey };
})(window);
