# Solenoid

These are Solenoid's settings. The file is [Cogwheel](https://github.com/pmorphia/cogwheel):
ordinary Markdown, in which every quote line with `=` is a setting. Change the value after
`=` and save (Ctrl+S); the editor follows at once.

## Editor

> font = JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace

> font size = 14

> line height = 1.6

> tab size = 4

> word wrap = off

> line numbers = on

> highlight active line = on

> close brackets = on

Suggestions of variables, functions, modules, and keywords while typing:

> suggestions = on

Check the file for errors while typing, and underline them:

> check while typing = on

Save a changed file of any kind after this many seconds without typing, and every changed
file when the window loses focus (`off` to save only with Ctrl+S). Running a program saves
every changed file either way:

> auto save = off

Indent Flywheel files with the Flywheel formatter when saving:

> format on save = off

## Feel

Motion in the interface: panels, tabs, the caret, the run pulse.

> animations = on

The flywheel in the corner gathers speed as you type and spins while a program runs:

> momentum = on

Quiet clicks for typing, and tones for saving, running, success, and failure:

> sounds = off

> volume = 0.4

## Theme

One of `flywheel dark`, `flywheel light`, `midnight`, `ember`, `paper`.

> theme = flywheel dark

### Colors

Entries here replace single colors of the theme. The names are: `background`, `panel`,
`panel raised`, `text`, `dim`, `faint`, `line`, `accent`, `selection`, `keyword`, `type`,
`string`, `number`, `comment`, `function`, `variable`, `constant`, `operator`, `tag`,
`attribute`, `error`, `warning`, `success`. For example:

```markdown
> accent = #7dd3fc

> comment = #6b7280
```

## Run

The command that runs a file, by extension. `{file}` is the file, `{dir}` its directory,
`{name}` its name without the extension, and `{flywheel}` the Flywheel compiler Solenoid
itself runs on. Add a line for any other extension.

> fw = {flywheel} {file}

> fly = {flywheel} {file}

> py = python3 -u {file}

> js = node {file}

> mjs = node {file}

> ts = npx tsx {file}

> sh = bash {file}

> c = cc {file} -o /tmp/{name} && /tmp/{name}

> cpp = c++ -std=c++20 {file} -o /tmp/{name} && /tmp/{name}

> rs = rustc {file} -o /tmp/{name} && /tmp/{name}

> go = go run {file}

> rb = ruby {file}

> php = php {file}

> lua = lua {file}

> java = java {file}

A Flywheel file that returns markup at the top level is a page, and runs with this instead:

> fw page = {flywheel} --serve {file} --port 0

The command behind the Test button:

> test = {flywheel} --test

## Browser

Open addresses that a running program prints (`Serving at http://127.0.0.1:8000/`) in the
built-in browser:

> open served sites = on

> home = https://flywheel.polymorphia.dev

## Keys

Shortcuts for commands. Write keys as `Ctrl+Shift+P`, `Alt+W`, `F5`.

> run = F5

> run again = Ctrl+Enter

> stop = Shift+F5

> save = Ctrl+S

> quick open = Ctrl+P

> command palette = Ctrl+Shift+P

> find in files = Ctrl+Shift+F

> toggle sidebar = Ctrl+B

> toggle panel = Ctrl+J

> toggle browser = Ctrl+Shift+B

> console = Ctrl+`

> close tab = Alt+W

> next tab = Ctrl+Alt+Right

> previous tab = Ctrl+Alt+Left

> new file = Alt+N

> settings = Ctrl+,

> format = Shift+Alt+F

> zen mode = Alt+Z
