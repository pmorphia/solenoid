/* The project a new browser workspace starts with. */
(function (root) {
"use strict";

const files = {
  "README.md": `# Welcome to Solenoid

This workspace lives in your browser. Flywheel runs here through
[flywheel.js](https://github.com/fwlang/flywheel.js); files are kept in this browser's storage.

- **F5** runs the open file. \`hello.fw\` prints to the Output panel, \`counter.fw\` opens in the
  built-in browser, with working buttons.
- **Ctrl+P** opens a file, **Ctrl+Shift+P** every command.
- **Ctrl+\`** is the Driveshaft console: Flywheel, line by line.
- **Settings** (Ctrl+,) is \`solenoid.cw\`, a Cogwheel file. Change a value and save.

For the compiler, native speed, Python and other languages, packages on disk, and a terminal,
install Solenoid on your machine:

\`\`\`sh
pulley install polymorphia.solenoid
solenoid
\`\`\`
`,
  "hello.fw": `# Press F5 to run.
import shapes

function greet(string who) returns string
    return "Hello, {who}!"
end

var names = ["Ann", "Bo", "Cy"]
for name in names do
    print greet(name)
end

var squares = [1, 2, 3, 4].map(function(int n) => n * n)
print "squares: {squares}, total: {squares.reduce(0, function(int a, int b) => a + b)}"

var room = shapes.Rect(4.0, 2.5)
print "a {room.width} by {room.height} room has an area of {room.area():.1f}"
print shapes.describe(shapes.Circle(1.0))
`,
  "shapes.fw": `# Shapes, imported by hello.fw.

class Rect
    double width
    double height

    function area() returns double
        return this.width * this.height
    end
end

class Circle
    double radius

    function area() returns double
        return 3.14159265 * this.radius * this.radius
    end
end

# A sentence about a circle.
function describe(Circle c) returns string
    return "a circle of radius {c.radius} covers {c.area():.2f}"
end
`,
  "counter.fw": `# A page: the file returns markup, so F5 opens it in the built-in browser.
# On your machine, \`flywheel desktop counter.fw\` shows the same page in a window.
import html.*

int count = 0

# A handler changes the page it was given: here, the text of the number.
function show() returns void
    element? label = view.query("#count")
    if label != null do
        label.text_content = string(count)
    end
end

function add(int amount) returns function() returns void
    return function() returns void
        count += amount
        show()
    end
end

function reset() returns void
    count = 0
    show()
end

function page() returns element
    return <html>
        <head>
            <title>Counter</title>
            <style>
                body { font-family: system-ui, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; background: #0e0e12; color: #f2f2ee; }
                main { text-align: center; }
                h1 { font-size: 72px; margin: 0 0 16px; color: #d4ff3a; }
                button { font: inherit; padding: 10px 18px; margin: 0 4px; border-radius: 10px; border: 1px solid #2c2c35; background: #121217; color: inherit; cursor: pointer; }
                button:hover { border-color: #d4ff3a; }
            </style>
        </head>
        <body>
            <main>
                <h1 id="count">{count}</h1>
                <button onclick={add(-1)}>− 1</button>
                <button onclick={add(1)}>+ 1</button>
                <button onclick={reset}>reset</button>
            </main>
        </body>
    </html>
end

element view = page()
return view
`,
  "settings.cw": `# App settings

A [Cogwheel](https://github.com/pmorphia/cogwheel) file: Markdown whose quote lines are values.
\`config.fw\` reads it.

## Server

> port = 8080

> host = 127.0.0.1

## Features

> greeting = Hello from Cogwheel

> debug = on
`,
  "config.fw": `# Reads settings.cw with the cogwheel library.
import cogwheel

var conf = cogwheel.parse("# App\\n\\n## Server\\n\\n> port = 8080\\n\\n> host = 127.0.0.1\\n\\n## Features\\n\\n> greeting = Hello from Cogwheel\\n")
var server = conf.getById("Server")
print "listening on {server.get("host")}:{server.get_int("port")}"
print conf.selectorAll()[">greeting"]

server.set("port", "9090")
print conf.source()
`,
  "notes.py": `# Python runs in the browser too (the first run downloads Pyodide).
from collections import Counter

words = "the quick brown fox jumps over the lazy dog the end".split()
for word, count in Counter(words).most_common(3):
    print(f"{word:>6} {'#' * count}")
`,
  "page/index.html": `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Plain HTML</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Plain HTML</h1>
  <p>F5 previews this file in the built-in browser.</p>
  <script>document.querySelector("p").append(" JavaScript works: " + new Date().toLocaleTimeString());</script>
</body>
</html>
`,
  "page/style.css": `body { font-family: system-ui, sans-serif; margin: 40px; background: #fafaf7; color: #18181b; }
h1 { letter-spacing: -0.02em; }
`,
};

root.SolenoidSamples = { files };
})(typeof self !== "undefined" ? self : this);
