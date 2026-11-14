# Solenoid

A smart IDE for [Flywheel](https://flywheel.polymorphia.dev) and general development. It runs
in a window on your machine, and in the browser at
**[solenoid.polymorphia.dev](https://solenoid.polymorphia.dev)**.

```sh
pulley install polymorphia.solenoid
solenoid                  # open the current folder
solenoid my-project       # or another one
```

| Command | |
|---|---|
| `solenoid [DIRECTORY]` | the IDE in a window; in your browser when Flywheel has no desktop backend |
| `solenoid desktop [DIRECTORY]` | the IDE in a window |
| `solenoid serve [DIRECTORY]` | the IDE at `http://127.0.0.1:4747/` (`--port`, `--host`, `--no-open`) |
| `solenoid config` | where the settings file is |

## What it does

- **Editor**: tabs, multiple cursors, find and replace, folding, bracket matching, comment
  toggling, auto-indent, go to line, a file tree with create, rename, duplicate, and delete,
  search across files, an outline, and a session that reopens what you had open.
- **Project view**: the project as Flywheel sees it, beside the folder tree. Modules by
  their import names (`lib.util`), each opening into its functions and classes; tests, with
  Run; Pulley packages, each opening into its own modules and files; and every other file as
  a resource, sorted by kind. The main module and commands from `pulley.toml` are marked, a
  filter narrows it all, and a module's menu adds its `import` to the open file.
- **Highlighting** for Flywheel and Cogwheel, and for Python, JavaScript, TypeScript, HTML,
  CSS, JSON, Markdown, C, C++, Rust, Go, Java, PHP, SQL, XML, YAML, TOML, shell, Lua, Ruby,
  C#, Kotlin, Scala, Dart, Swift, Perl, PowerShell, Dockerfiles, and diffs.
- **Suggestions** for Flywheel: variables, functions, and classes of the file, the functions
  of a module after `module.` (library modules with their signatures, your own modules, and
  installed packages), members after `this.`, module names after `import`, markup tags,
  snippets, and library modules you have not imported yet (choosing one adds the import).
  Hover shows a declaration or a library function's signature; **F12** or Ctrl+click goes
  to a definition, also in another file.
- **Errors while you type**, underlined and listed under Problems: Flywheel through the
  compiler (`flywheel --check`, including unsaved text), Python, JavaScript, and JSON.
- **Run** (F5) for Flywheel, Python, JavaScript, TypeScript, shell, C, C++, Rust, Go, Ruby,
  PHP, Lua, and Java, with the program's output, its exit status and time, a line for its
  input, and Stop. File positions in the output (`main.fw:3:7`) are links. The commands are
  settings, so any other language is one line away. **Test** runs `flywheel --test`.
- **Built-in browser**: a Flywheel file that returns markup is served and opened beside the
  code; so is any address a running program prints. HTML, Markdown, and Cogwheel files
  preview there, and you can type an address.
- **Pulley** panel: the project's packages, adding one by `author.name` (with its latest
  version looked up as you type), removing, installing, updating, and adding the `import`.
- **Driveshaft console** (Ctrl+`): Flywheel line by line, with highlighting and suggestions.
  `return <markup>` opens in the browser.
- **Terminal**: run commands in the project and type into them.
- **Palette**: Ctrl+P finds files, `>` commands, `@` symbols, `:` a line.
- **Git**: the branch and changed files, marked in the tree.
- **Feel**: a flywheel that gathers speed as you type and spins while a program runs,
  animations (on by default), and typing and run sounds (off by default). Zen mode hides
  everything but the code.

## Settings are a Cogwheel file

Settings (Ctrl+,) opens `solenoid.cw`, a [Cogwheel](https://github.com/pmorphia/cogwheel)
file: Markdown, in which quote lines are the values. The editor follows as you type, and
saving keeps it. It is `~/.config/solenoid/solenoid.cw` (`solenoid config` prints the path).

```markdown
## Feel

> animations = on

> sounds = off

## Theme

One of `flywheel dark`, `flywheel light`, `midnight`, `ember`, `paper`.

> theme = midnight

### Colors

> accent = #7dd3fc

## Run

> fw = {flywheel} run {file}

> zig = zig run {file}

## Keys

> run = F5
```

Sections: **Editor** (font, size, tab size, word wrap, suggestions, checking, auto save,
format on save), **Feel**, **Theme** and its **Colors** (every color of the interface and of
the syntax), **Run** (the command per file extension), **Browser**, and **Keys**.

## In the browser

[solenoid.polymorphia.dev](https://solenoid.polymorphia.dev) is the same editor without a
machine behind it. Files live in the browser's storage. Flywheel runs through
[flywheel.js](https://github.com/fwlang/flywheel.js) (with your own modules and installed
packages importable, pages with working event handlers, and `input()`), JavaScript runs
directly, and Python through Pyodide. Packages install from the registry into the workspace.
There is no compiler, terminal, or other language there; the errors shown for Flywheel are
syntax errors only.

## How it is built

The host is Flywheel ([solenoid.fw](solenoid.fw)): it serves the editor and answers its
requests for files, running programs, diagnostics, formatting, packages, and the console (the
`driveshaft` library, `polymorphia.driveshaft`). `solenoid desktop` shows it in
a `desktop.window`; `solenoid serve` in a browser. The editor itself (`web/`) is HTML, CSS,
and JavaScript on [CodeMirror 6](https://codemirror.net): an editing surface has to handle
every keystroke in the page, which a Flywheel desktop window (it re-renders its tree after
each event) is not made for, and the browser build has no Flywheel host at all.

Requests need the session's key, which is part of the address Solenoid opens, and the host
listens on `127.0.0.1` unless `--host` says otherwise. Anyone with the address can read and
write your files and run programs, so do not share it or serve it on a network you do not
trust.

Requirements: a Flywheel with `os.start` (releases after 2.17), on Linux or macOS. The
window needs Flywheel's desktop backend. Windows is untested.

## Development

```sh
flywheel --test tests/                              # the host
flywheel cli.fw -- serve --no-open .          # the IDE from this checkout
tools/sync-flywheeljs.sh                          # refresh web/vendor/flywheel.js
```

`web/vendor/codemirror.js` is CodeMirror 6 and its language packages (MIT), bundled with
esbuild from `tools/codemirror-entry.js`.

MIT license.
