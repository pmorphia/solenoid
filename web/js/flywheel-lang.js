/* Flywheel for the editor: the syntax highlighter, what the library modules provide, the names
 * a file declares, suggestions, and hover text. Used by app.js through `FlywheelLang`. */
(function (root) {
"use strict";

const KEYWORDS = ("and as assert attr break case catch class component computed const constructor continue defer destructor " +
  "do elements else end enum error extends finally for function if implements import in interface is match not or otherwise " +
  "private protected public reactive readonly return returns run spawn static super this throw try unit unitconv " +
  "unitns unless var when which while with").split(" ");
const TYPES = ("bool i8 i16 i32 i64 u8 u16 u32 u64 int float double string void element fragment char array tuple map " +
  "set Result weak Error RuntimeError FileError InputError ProcessError IndexError KeyError NumericError AssertionError " +
  "JsonError ResultError CastError SelectorError DesktopError RegexError NetworkError ValueError HttpError DatabaseError " +
  "NativeError").split(" ");
const CONSTANTS = ["true", "false", "null"];
const BUILTINS = {
  print: ["print value, ...", "Writes the values, separated by spaces, and a line break."],
  input: ["input(string prompt = \"\") returns string", "Reads one line from standard input."],
  len: ["len(value) returns int", "The number of characters or items."],
  typeof: ["typeof(value) returns string", "The name of the value's type."],
  render: ["render(element) returns string", "The HTML of a markup tree."],
  string: ["string(value) returns string", "Formats any value as text."],
  int: ["int(value) returns int", "Converts a number or parses text."],
  double: ["double(value) returns double", "Converts a number or parses text."],
  bool: ["bool(value) returns bool", "Parses \"true\" or \"false\"."],
  char: ["char(value) returns char", "A character from text or a code point."],
};
const KW = new Set(KEYWORDS), TY = new Set(TYPES), CO = new Set(CONSTANTS);

/* module -> [description, { member: [signature, description] }] */
const M = (doc, members) => ({ doc, members });
const LIBRARY = {
  args: M("Command-line argument parsing.", {
    Parser: ["Parser(string name, string description)", "A parser with flag(), option(), positional(), parse(os.args())."],
    Usage: ["Usage", "Raised by parse_or_throw for wrong arguments."] }),
  bigint: M("Arbitrary-precision integers.", {
    of: ["of(int n)", "A big integer from an int."], parse: ["parse(string text)", "A big integer from text."] }),
  cogwheel: M("Cogwheel (.cw) configuration: Markdown with sections and `> key = value` entries.", {
    confile: ["confile(string path) returns Node", "Reads a .cw file."],
    parse: ["parse(string text) returns Node", "Reads .cw text."],
    quote: ["quote(string value) returns string", "How a value is written."],
    unquote: ["unquote(string text) returns string", "How a written value is read."],
    from_markup: ["from_markup(element) returns Node", "A document from <cogwheel.cw> markup."],
    render: ["render(element) returns string", ".cw text from markup."],
    Node: ["Node", "A document, section, entry, or text: get, set, find, sections, entries, save."] }),
  collections: M("Collection helpers.", { range: ["range(int start = 0, int end) returns int[]", "The integers of a half-open interval."] }),
  compress: M("gzip, zlib, deflate, CRC-32, and zip archives.", {
    gzip: ["gzip(string text, int level = 6) returns string", "gzip-compresses."], gunzip: ["gunzip(string data) returns string", "Reads gzip data."],
    zlib: ["zlib(string text, int level = 6) returns string", ""], unzlib: ["unzlib(string data) returns string", ""],
    deflate: ["deflate(string text, int level = 6) returns string", ""], inflate: ["inflate(string data) returns string", ""],
    crc32: ["crc32(string text) returns int", "CRC-32 checksum."],
    zip: ["zip(map<string, string> files) returns string", "A zip archive of name → contents."],
    unzip: ["unzip(string data) returns map<string, string>", "The files of a zip archive."] }),
  crypto: M("Hashes, HMAC, and secure random numbers.", {
    sha256: ["sha256(string text) returns string", "Lower-case hex digest."], sha1: ["sha1(string text) returns string", ""], md5: ["md5(string text) returns string", ""],
    hmac_sha256: ["hmac_sha256(string key, string text) returns string", ""],
    random_bytes: ["random_bytes(int n) returns string", "Secure random bytes."], random_hex: ["random_hex(int n) returns string", ""],
    token: ["token(int n = 32) returns string", "Random bytes as unpadded base64url."],
    random_int: ["random_int(int low, int high) returns int", "A secure random integer (inclusive)."],
    secure_equal: ["secure_equal(string a, string b) returns bool", "Constant-time comparison."] }),
  csv: M("CSV reading and writing.", {
    parse: ["parse(string text, char separator = ',') returns string[][]", ""],
    parse_records: ["parse_records(string text) returns map<string, string>[]", "Rows keyed by the first row's names."],
    format: ["format(string[][] rows) returns string", ""], format_row: ["format_row(string[] fields) returns string", ""] }),
  decimal: M("Exact decimal numbers.", { parse: ["parse(string text)", ""], of: ["of(int n)", ""], Rounding: ["Rounding", "HalfEven, HalfUp, Down, Up, Floor, Ceiling."] }),
  desktop: M("Native windows that show markup.", {
    window: ["window(string title = \"Flywheel\", int width = 960, int height = 640)", "A window: load(tree), bind(name, f), eval(script), run()."],
    Window: ["Window", "Alias of desktop.window."],
    run: ["run(desktop.window[] windows)", "Shows several windows with one event loop."],
    quit: ["quit()", "Closes every window."] }),
  encoding: M("base64, hex, URL and form encoding.", {
    base64_encode: ["base64_encode(string) returns string", ""], base64_decode: ["base64_decode(string) returns string", ""],
    base64url_encode: ["base64url_encode(string) returns string", ""], base64url_decode: ["base64url_decode(string) returns string", ""],
    hex_encode: ["hex_encode(string) returns string", ""], hex_decode: ["hex_decode(string) returns string", ""],
    url_encode: ["url_encode(string) returns string", ""], url_decode: ["url_decode(string) returns string", ""],
    form_encode: ["form_encode(string) returns string", ""], form_decode: ["form_decode(string) returns string", ""] }),
  flywheel: M("Runs other Flywheel programs and returns what they return.", {
    run: ["run(string file, string[] args = []) returns json.value", ""], desktop: ["desktop(string file, string[] args = [])", ""],
    serve: ["serve(string file, int port = 8000, string host = \"127.0.0.1\")", ""], debug: ["debug(string file, string[] args = [])", ""],
    export: ["export(string file, string output, string[] args = [])", ""] }),
  fs: M("Files, directories, and paths.", {
    exists: ["exists(string path) returns bool", ""], is_dir: ["is_dir(string path) returns bool", ""], is_file: ["is_file(string path) returns bool", ""],
    read: ["read(string path) returns string", "The whole file. Raises FileError."], write: ["write(string path, string text)", "Replaces the file."],
    append: ["append(string path, string text)", ""], try_read: ["try_read(string path) returns Result<string, FileError>", ""],
    size: ["size(string path) returns int", "Bytes."], list: ["list(string path) returns string[]", "Sorted names in a directory."],
    walk: ["walk(string path) returns string[]", "Relative paths of everything below."], mkdir: ["mkdir(string path)", "Creates the directory and missing parents."],
    copy: ["copy(string from, string to)", ""], move: ["move(string from, string to)", ""], remove: ["remove(string path)", ""],
    remove_all: ["remove_all(string path) returns int", "Removes a tree."], join: ["join(string a, string b, ...) returns string", "Joins path parts."],
    basename: ["basename(string path) returns string", ""], dirname: ["dirname(string path) returns string", ""],
    extension: ["extension(string path) returns string", ""], stem: ["stem(string path) returns string", ""],
    absolute: ["absolute(string path) returns string", ""], normalize: ["normalize(string path) returns string", ""],
    cwd: ["cwd() returns string", "The working directory."], temp_dir: ["temp_dir() returns string", ""] }),
  gc: M("Cycle collection.", { collect: ["collect() returns int", "Frees unreachable cycles."] }),
  html: M("HTML tags (`import html.*`), rendering, parsing, and tree queries.", {
    render: ["render(element) returns string", ""], parse: ["parse(string text) returns fragment", "Reads HTML leniently, as browsers do."],
    query: ["query(element tree, string selector) returns element?", ""], query_all: ["query_all(element tree, string selector) returns element[]", ""],
    get_by_id: ["get_by_id(element tree, string id) returns element?", ""] }),
  imperial: M("British imperial units: inch, ft, yd, mi, oz, lb, ...", {}),
  io: M("Stream-style terminal input and output, and files.", {
    read_line: ["read_line() returns string?", "The next line, or null at end of input."], read_all: ["read_all() returns string", ""],
    write: ["write(value)", "Writes without a line break."], write_error: ["write_error(value)", "Writes to standard error."],
    flush: ["flush()", ""], open: ["open(string path, string mode = \"r\") returns io.file", "Modes: r, w, a, r+."] }),
  json: M("JSON parsing, querying, encoding, and typed decoding.", {
    parse: ["parse(string text) returns json.value", ""], stringify: ["stringify(json.value) returns string", ""],
    encode: ["encode(value, int indent = 0) returns string", "Encodes any value: maps, arrays, class instances."],
    decode: ["decode(text) returns T", "Converts JSON into the type the result is assigned to."],
    load: ["load(string path) returns json.value", ""], dump: ["dump(value, string path, int indent = 0)", ""],
    loads: ["loads(string text) returns json.value", ""], dumps: ["dumps(value, int indent = 0) returns string", ""],
    get: ["get(json.value, string key) returns json.value", ""], at: ["at(json.value, int index) returns json.value", ""],
    has: ["has(json.value, string key) returns bool", ""], length: ["length(json.value) returns int", ""],
    keys: ["keys(json.value) returns string[]", ""], items: ["items(json.value) returns json.value[]", ""],
    is_null: ["is_null(json.value) returns bool", ""], kind: ["kind(json.value) returns string", "null, bool, number, string, array, or object."],
    as_string: ["as_string(json.value) returns string", ""], as_int: ["as_int(json.value) returns int", ""],
    as_double: ["as_double(json.value) returns double", ""], as_bool: ["as_bool(json.value) returns bool", ""],
    value: ["json.value", "A parsed JSON document."] }),
  log: M("Leveled logging to standard error.", {
    debug: ["debug(string message, map<string, string> fields = {})", ""], info: ["info(string message, map<string, string> fields = {})", ""],
    warn: ["warn(string message, map<string, string> fields = {})", ""], error: ["error(string message, map<string, string> fields = {})", ""],
    set_level: ["set_level(log.Level level)", ""], set_level_name: ["set_level_name(string name)", ""], use_json: ["use_json(bool on)", ""], to_file: ["to_file(string path)", ""] }),
  math: M("Numeric functions and random numbers.", {
    PI: ["PI", "3.14159…"], TAU: ["TAU", "2π"], E: ["E", "2.71828…"], INF: ["INF", ""], NAN: ["NAN", ""],
    sqrt: ["sqrt(double x) returns double", ""], sin: ["sin(double x) returns double", ""], cos: ["cos(double x) returns double", ""], tan: ["tan(double x) returns double", ""],
    asin: ["asin(double x) returns double", ""], acos: ["acos(double x) returns double", ""], atan: ["atan(double x) returns double", ""], atan2: ["atan2(double y, double x) returns double", ""],
    hypot: ["hypot(double x, double y) returns double", ""], exp: ["exp(double x) returns double", ""], log: ["log(double x, double base = E) returns double", ""],
    log10: ["log10(double x) returns double", ""], log2: ["log2(double x) returns double", ""], pow: ["pow(double a, double b) returns double", ""], cbrt: ["cbrt(double x) returns double", ""],
    floor: ["floor(double x) returns double", ""], ceil: ["ceil(double x) returns double", ""], round: ["round(double x) returns double", "Half away from zero."], trunc: ["trunc(double x) returns double", ""],
    is_nan: ["is_nan(double x) returns bool", ""], is_finite: ["is_finite(double x) returns bool", ""], gcd: ["gcd(int a, int b) returns int", ""], lcm: ["lcm(int a, int b) returns int", ""],
    factorial: ["factorial(int n) returns int", ""], sign: ["sign(x)", "-1, 0, or 1."], abs: ["abs(x)", ""], min: ["min(a, b, ...)", ""], max: ["max(a, b, ...)", ""],
    clamp: ["clamp(x, low, high)", ""], random: ["random() returns double", "A double in [0, 1)."], random_int: ["random_int(int low, int high) returns int", "Inclusive."], seed: ["seed(int n)", ""] }),
  metric: M("Metric units: mm, cm, m, km, g, kg, l, ...", {}),
  net: M("TCP sockets and name resolution.", {
    resolve: ["resolve(string host) returns string[]", ""], connect: ["connect(string host, int port, double timeout = 0.0) returns net.socket", ""],
    listen: ["listen(string host, int port) returns net.listener", "Port 0 picks a free port."] }),
  os: M("Environment, arguments, and child processes.", {
    env: ["env(string name) returns string", "An environment variable."], args: ["args() returns string[]", "The program's arguments."],
    exit: ["exit(int code = 0)", "Ends the program at once."], pid: ["pid() returns int", "This program's process ID."],
    run: ["run(string[] command) returns os.result", "Runs a program and captures status, stdout, stderr."],
    process: ["process(string[] command) returns os.process", "A process to configure: input, cwd, env, timeout, capture; then run() or start()."],
    pipeline: ["pipeline(string[][] commands, string input = \"\") returns os.result", ""],
    shell: ["shell(string line) returns int", "Runs a shell line with this program's terminal."],
    command: ["command(string[] argv) returns int", "Runs a program with this program's terminal."],
    start: ["start(command, string log = \"\") returns int", "Starts a program in the background; returns its process ID."],
    alive: ["alive(int pid) returns bool", ""], wait: ["wait(int pid) returns int", "Waits for a started program; its exit status."],
    kill: ["kill(int pid, int signal = 15) returns bool", ""] }),
  random: M("Pseudo-random values.", {
    seed: ["seed(int n)", ""], random: ["random() returns double", ""], integer: ["integer(int low, int high) returns int", "Inclusive."],
    below: ["below(int n) returns int", ""], uniform: ["uniform(double low, double high) returns double", ""], chance: ["chance(double p = 0.5) returns bool", ""],
    normal: ["normal(double mean = 0.0, double stddev = 1.0) returns double", ""], choice: ["choice(items)", "One item of an array."],
    weighted: ["weighted(items, double[] weights)", ""], shuffle: ["shuffle(items)", "Shuffles in place."], shuffled: ["shuffled(items)", ""], sample: ["sample(items, int count)", ""] }),
  regex: M("Regular expressions (JavaScript syntax).", {
    matches: ["matches(string pattern, string text) returns bool", "The whole text matches."], contains: ["contains(string pattern, string text) returns bool", ""],
    find: ["find(string pattern, string text) returns string?", ""], find_all: ["find_all(string pattern, string text) returns string[]", ""],
    groups: ["groups(string pattern, string text) returns string[]?", ""], replace: ["replace(string pattern, string text, string replacement) returns string", ""],
    split: ["split(string pattern, string text) returns string[]", ""] }),
  sqlite: M("SQLite 3 databases.", { open: ["open(string path) returns sqlite.database", "execute(sql, values...), query(sql, values...), close()."] }),
  svg: M("SVG tags (`import svg.*`).", {}),
  testing: M("Assertions for `flywheel --test`.", {
    assert: ["assert(bool condition, string message = \"\")", ""], assert_equal: ["assert_equal(actual, expected, string message = \"\")", ""],
    fail: ["fail(string message)", ""], expect_error: ["expect_error(ErrorType, function)", "Requires the function to raise the error; returns it."],
    live_objects: ["live_objects() returns int", ""] }),
  thread: M("Threads, channels, and mutexes.", {
    spawn: ["spawn(function() returns T) returns thread.task<T>", ""], channel: ["channel<T>(int capacity = 0)", "send, receive, try_receive, close."],
    mutex: ["mutex()", "lock(), unlock(), try_lock()."], cores: ["cores() returns int", ""] }),
  time: M("Clocks, sleeping, dates, and the time units.", {
    monotonic: ["monotonic() returns double", "Seconds from a steady clock."], sleep: ["sleep(seconds)", "Pauses; takes seconds or a time quantity (500ms)."],
    now: ["now() returns double", "Seconds since the Unix epoch."], format: ["format(double seconds, string pattern) returns string", "UTC text, strftime patterns."],
    format_local: ["format_local(double seconds, string pattern) returns string", ""], parse: ["parse(string text, string pattern) returns double", ""],
    date: ["date(double seconds) returns time.datetime", ""], local_date: ["local_date(double seconds) returns time.datetime", ""],
    from_date: ["from_date(int year, int month, int day, ...) returns double", ""], delay: ["delay(seconds)", ""], sleep_ms: ["sleep_ms(int milliseconds)", ""],
    millis: ["millis() returns int", ""], elapsed: ["elapsed(double start) returns double", ""], unix: ["unix() returns int", ""],
    today: ["today() returns string", "2026-11-04"], clock: ["clock() returns string", "14:05:09"], timestamp: ["timestamp() returns string", "ISO 8601, UTC."] }),
  toml: M("TOML 1.0.", { parse: ["parse(string text) returns json.value", ""] }),
  url: M("URLs.", {
    parse: ["parse(string text) returns url.Url", ""], join: ["join(string base, string reference) returns string", ""], encode: ["encode(string) returns string", ""],
    decode: ["decode(string) returns string", ""], parse_query: ["parse_query(string text) returns map<string, string>", ""], query_string: ["query_string(map<string, string>) returns string", ""] }),
  uuid: M("UUIDs.", { v4: ["v4() returns string", "A random UUID."], v7: ["v7() returns string", "A time-ordered UUID."], is_valid: ["is_valid(string text) returns bool", ""] }),
  web: M("HTTP servers and client.", {
    serve: ["serve(string route, handler, int port, string host = \"127.0.0.1\") returns string", "Registers a GET route."],
    route: ["route(string method, string route, handler, int port, string host)", ""], static: ["static(string prefix, string directory, int port, string host)", "Serves files."],
    tls: ["tls(string certificate, string key, int port, string host)", ""], wait: ["wait()", "Serves until the server stops."], workers: ["workers(int n)", "Runs handlers on n threads."],
    get: ["get(string url, map<string, string> headers = {}) returns web.response", ""], post: ["post(string url, body, map<string, string> headers = {}) returns web.response", ""],
    put: ["put(string url, body, headers = {}) returns web.response", ""], patch: ["patch(string url, body, headers = {}) returns web.response", ""],
    delete: ["delete(string url, headers = {}) returns web.response", ""], head: ["head(string url, headers = {}) returns web.response", ""],
    fetch: ["fetch(string method, string url, string body = \"\", headers = {}, double timeout = 30.0) returns web.response", ""],
    text: ["text(string body, int status = 200) returns web.response", ""], html: ["html(element, int status = 200) returns web.response", ""],
    json: ["json(value, int status = 200) returns web.response", ""], redirect: ["redirect(string location, int status = 302) returns web.response", ""],
    request: ["web.request", "method, path, query, headers, body, params, form, remote."], response: ["web.response", "status, body, headers."] }),
  yaml: M("YAML 1.2.", { parse: ["parse(string text) returns json.value", ""] }),
};

/* Methods of built-in values, suggested after `value.` */
const METHODS = {
  length: "characters or items", upper: "string", lower: "string", trim: "string", trim_start: "string", trim_end: "string",
  split: "string → string[]", lines: "string → string[]", chars: "string → char[]", find: "index or -1", find_last: "index or -1",
  contains: "bool", starts_with: "bool", ends_with: "bool", count: "int", replace: "string", pad_start: "string", pad_end: "string",
  reverse: "", repeat: "string", is_empty: "bool", join: "string", slice: "part", push: "append", pop: "remove the last", insert: "at an index",
  remove_at: "by index", remove: "by value or key", clear: "", extend: "append all", sort: "in place", index_of: "index or -1", copy: "shallow copy",
  map: "new array", filter: "new array", reduce: "fold", any: "bool", all: "bool", each: "", freeze: "immutable", is_frozen: "bool",
  keys: "map keys", values: "map values", add: "to a set", items: "set items", union: "", intersection: "", difference: "", is_subset: "bool",
  unwrap: "Result value", is_ok: "bool", is_error: "bool", error: "Result error", message: "error text", name: "error type",
  render: "HTML text", query: "first match", query_all: "all matches", get_by_id: "", text_content: "text", inner_html: "", outer_html: "", children: "elements",
  attributes: "map", append: "", prepend: "", set_attribute: "", get_attribute: "string?", has_attribute: "bool", remove_attribute: "",
  add_class: "", remove_class: "", toggle_class: "", has_class: "bool", clone: "", parent: "element?", tag: "string", id: "string",
  join_task: "", done: "bool", send: "to a channel", receive: "from a channel", close: "", lock: "", unlock: "", to_string: "string",
};

const HTML_TAGS = ("a abbr address article aside audio b blockquote body br button canvas caption code col dd details dialog div dl dt em " +
  "fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe img input label legend li link main meta nav " +
  "ol optgroup option p pre progress script section select small span strong style sub summary sup table tbody td textarea tfoot th thead " +
  "title tr u ul video").split(" ");

const SNIPPETS = [
  ["function", "function ${name}(${params}) returns ${void}\n\t${}\nend", "function declaration"],
  ["class", "class ${Name}\n\t${}\nend", "class declaration"],
  ["if", "if ${condition} do\n\t${}\nend", "if block"],
  ["ifelse", "if ${condition} do\n\t${}\nelse do\n\t\nend", "if / else"],
  ["unless", "unless ${condition} do\n\t${}\nend", "unless block (if not)"],
  ["for", "for ${item} in ${items} do\n\t${}\nend", "for loop"],
  ["fori", "for ${i} in 0..<${n} do\n\t${}\nend", "counting loop"],
  ["while", "while ${condition} do\n\t${}\nend", "while loop"],
  ["try", "try\n\t${}\ncatch ${Error} ${e}\n\t\nend", "try / catch"],
  ["match", "match ${value}\n\tcase ${pattern} do\n\t\t${}\n\telse do\n\t\t\nend", "match"],
  ["matchexpr", "var ${result} = match ${value}\n\tcase ${pattern} => ${}\n\telse => \nend", "match expression"],
  ["deferwhen", "defer when ${condition} do\n\t${}\nend", "reactive condition checked between statements"],
  ["enum", "enum ${Name}\n\t${}\nend", "enum declaration"],
  ["interface", "interface ${Name}\n\t${}\nend", "interface declaration"],
  ["test", "function test_${name}() returns void\n\ttesting.assert_equal(${actual}, ${expected})\nend", "test function"],
  ["page", "import html.*\n\nreturn <html>\n\t<head><title>${Title}</title></head>\n\t<body>\n\t\t<h1>${Hello}</h1>\n\t</body>\n</html>", "a page (flywheel --serve / desktop)"],
  ["lambda", "function(${int x}) => ${x}", "expression lambda"],
  ["main", "function main() returns void\n\t${}\nend\n\nmain()", "main function"],
];

/* ------------------------------------------------------------------ highlighting */

const WORD = /^[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*/;
const DECORATES = /^(?:\.[A-Za-z_]\w*)*(?:\([^()]*\))?[ \t]+(?:[A-Za-z_][\w.]*(?:\([^()]*\))?[ \t]+)*(?:class|function)[ \t]+[A-Za-z_]/;
const OPENS = /^\s*(?:(?:public|private|protected|static|readonly)\s+)*(?:class|interface|enum|elements|component|try|match|constructor|destructor|catch|finally|else|case|defer\s*$)\b|^\s*(?:(?:public|private)\s+)?struct\s+[A-Za-z_]\w*\s*$|\bdo\s*$|(?:^|[\s=(,\[])match\s+(?!.*\bend\b)\S.*$|^\s*(?:[\w.]+(?:\([^()]*\))?\s+)+class\s+\w+|^\s*(?:[\w.]+(?:\([^()]*\))?\s+)*function\s+[\w]+|\bfunction\s*(?:\([^()]*\))?(?:\s*returns\s+[\w<>\[\], .?]+)?\s*$/;

function stripComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') quote = !quote;
    else if (c === "#" && !quote) return line.slice(0, i);
  }
  return line;
}

/* A CodeMirror stream mode. State: `str` inside a string, `interp` brace depth of an
 * interpolation, `tag` inside a markup tag's attributes, `indent`/`opens` for auto-indent. */
const mode = {
  name: "flywheel",
  startState() { return { str: false, interp: 0, tag: false, close: false, indent: 0, opens: false, after: "", prev: "" }; },
  copyState(s) { return Object.assign({}, s); },
  token(stream, state) {
    if (stream.sol() && !state.str) {
      const line = stripComment(stream.string);
      if (line.trim() !== "") { state.indent = stream.indentation(); state.opens = OPENS.test(line.replace(/\s+$/, "")) && !/=>/.test(line); state.head = (/^\s*(\w+)/.exec(line) || [])[1] || ""; state.match = /(?:^|[\s=(,\[])match\s/.test(line) && !/\bend\b/.test(line); }
    }
    if (state.str && state.interp === 0) return stringBody(stream, state);
    if (stream.eatSpace()) return null;
    const ch = stream.peek();
    if (state.interp > 0) {
      if (ch === "{") { state.interp++; stream.next(); return "bracket"; }
      if (ch === "}") { state.interp--; stream.next(); return state.interp === 0 ? "escape" : "bracket"; }
      if (ch === '"') { stream.next(); stream.match(/^(?:[^"\\]|\\.)*"?/); return "string"; }
    }
    if (ch === "#") { stream.skipToEnd(); return "comment"; }
    if (ch === '"') { stream.next(); state.str = true; return stringBody(stream, state); }
    if (ch === "'" && stream.match(/^'(?:\\.|[^'\\])'/)) return "string";
    if (/\d/.test(ch)) { stream.match(/^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/); stream.match(/^[A-Za-z_][\w.]*/); state.prev = "number"; return "number"; }
    if (ch === "<") {
      if (stream.match(/^<\/[A-Za-z][\w.:-]*\s*>/) || stream.match(/^<\/>/) || stream.match(/^<>/)) { state.prev = "tag"; return "tagName"; }
      const operand = state.prev === "word" || state.prev === "number" || state.prev === ")" || state.prev === "string";
      if (!operand && stream.match(/^<[A-Za-z][\w.:-]*/)) { state.tag = true; state.prev = "tag"; return "tagName"; }
    }
    if (state.tag) {
      if (stream.match("/>") || stream.match(">")) { state.tag = false; state.prev = "tag"; return "tagName"; }
      if (stream.match(/^[A-Za-z_:][\w:.-]*(?==)/)) return "attributeName";
      if (stream.match(/^[A-Za-z_:][\w:.-]*/)) return "attributeName";
    }
    if (stream.match(WORD)) {
      const word = stream.current();
      const after = state.after;
      state.after = word;
      const wasDot = state.prev === ".", wasKeyword = state.prev === "kw";
      state.prev = "word";
      if (wasDot && state.decorator) return "macroName";
      if (wasDot) return stream.peek() === "(" ? "propertyName.function" : "propertyName";
      state.decorator = false;
      // Decorators come before `class Name` or `function name` on the same line:
      // `register class Store`, `logged("db") memoize function fib(int n)`.
      if (!KW.has(word) && !TY.has(word) && DECORATES.test(stream.string.slice(stream.pos))) { state.decorator = true; return "macroName"; }
      if (after === "function" || after === "class" || after === "interface" || after === "enum" || after === "error" || after === "component" || (after === "struct" && wasKeyword))
        return after === "function" ? "variableName.function.definition" : "typeName.definition";
      // `struct Name` alone on its line declares a value type; elsewhere `struct` is a name.
      if (word === "struct" && state.head === "struct" && stream.match(/^\s+[A-Za-z_]\w*\s*(?:#.*)?$/, false)) { state.prev = "kw"; return "keyword"; }
      // `x is Dog`, and constraints such as `<T is comparable>`, name a type.
      if (after === "is" && !KW.has(word) && !CO.has(word)) return "typeName";
      if (KW.has(word)) { state.prev = "kw"; return word === "this" || word === "super" ? "self" : "keyword"; }
      if (CO.has(word)) return word === "null" ? "null" : "bool";
      if (TY.has(word)) return "typeName";
      if (stream.peek() === "(") return word in BUILTINS ? "variableName.function.standard" : "variableName.function";
      if (word in BUILTINS && (word === "print" || word === "input")) { state.prev = "kw"; return "variableName.standard"; }
      if (LIBRARY[word] && stream.peek() === ".") return "namespace";
      if (/^[A-Z]/.test(word)) return /^[A-Z][A-Z0-9_]+$/.test(word) ? "variableName.constant" : "typeName";
      return "variableName";
    }
    state.after = "";
    if (stream.match(/^(?:\.\.<|\.\.|=>|==|!=|<=|>=|\/\/=?|\?\?|[+\-*\/%]=)/)) { state.prev = "op"; return "operator"; }
    stream.next();
    if ("()[]{}".includes(ch)) { state.prev = ch === ")" || ch === "]" ? ")" : "op"; return "bracket"; }
    if (ch === ".") { state.prev = "."; return "punctuation"; }
    if (ch === ",") { state.prev = "op"; return "punctuation"; }
    state.prev = "op";
    return "+-*/%=<>?!:".includes(ch) ? "operator" : null;
  },
  indent(state, textAfter, cx) {
    if (state.str) return null;
    const unit = cx.unit;
    let depth = state.indent + (state.opens ? unit : 0);
    const closing = /^\s*(end|else|catch|finally|case)\b/.exec(textAfter);
    if (closing && !(closing[1] === "case" && state.match)) depth -= unit;
    return Math.max(0, depth);
  },
  languageData: {
    commentTokens: { line: "#" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*(?:end|else|catch|finally|case)$/,
    wordChars: "_",
  },
};

function stringBody(stream, state) {
  while (!stream.eol()) {
    const c = stream.peek();
    if (c === "\\") { stream.next(); stream.next(); continue; }
    if (c === '"') { stream.next(); state.str = false; state.prev = "string"; return "string"; }
    if (c === "{") {
      const next = stream.string[stream.pos + 1];
      if (next === "{") { stream.next(); stream.next(); continue; }
      if (next !== undefined && next !== " " && next !== "\t") {
        if (stream.pos > stream.start) return "string";
        stream.next(); state.interp = 1; return "escape";
      }
    }
    stream.next();
  }
  return "string";
}

/* ------------------------------------------------------------------ symbols */

const DECL = /^(\s*)((?:(?:public|private|protected|static|readonly)\s+)*)(?:[\w.]+(?:\([^)]*\))?\s+)*?(function|class|interface|enum|error|component|elements)\s+([\w]+)(.*)$/;
const VAR = /^(\s*)((?:(?:public|private|protected|static|readonly)\s+)*)(var|const|reactive|computed)\s+(?:[\w<>\[\], .?]+\s+)?([A-Za-z_]\w*)\s*=/;
const TYPED = /^(\s*)((?:(?:public|private|protected|static|readonly)\s+)*)([A-Za-z_][\w.]*(?:<[^=]*>)?(?:\[\])*\??)\s+([A-Za-z_]\w*)\s*(=.*)?$/;
const IMPORT = /^\s*import(?:\+\+)?\s+(?:(c|cxx|rust|zig)\s+)?("?)([\w./:*-]+)\2(?:\s+as\s+(\w+))?/;

/* The names a Flywheel file declares:
 * [{ name, kind: function|method|class|interface|enum|variable|field|constant|module, line (1-based),
 *    detail, container, doc, module }] */
function symbols(text) {
  const out = [];
  const lines = text.split("\n");
  const stack = [];   // { indent, name, kind }
  let comment = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComment(raw);
    const trimmed = line.trim();
    if (trimmed === "") { if (raw.trim().startsWith("#")) comment.push(raw.trim().replace(/^#\s?/, "")); else comment = []; continue; }
    const indent = /^\s*/.exec(line)[0].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const top = stack[stack.length - 1];
    const doc = comment.join(" ").trim();
    comment = [];
    let m;
    if ((m = IMPORT.exec(line))) {
      const path = m[3].replace(/\.\*$/, "");
      const base = path.split(/[./]/).filter(Boolean).pop().replace(/\.(fw|fly)$/, "");
      out.push({ name: m[4] || base, kind: "module", line: i + 1, detail: trimmed, module: path, wildcard: /\.\*$/.test(m[3]), native: m[1] || "" });
    } else if ((m = DECL.exec(line))) {
      const kind = m[3] === "function" ? (top && (top.kind === "class" || top.kind === "interface") ? "method" : "function") : (m[3] === "error" ? "class" : m[3]);
      out.push({ name: m[4], kind, line: i + 1, detail: trimmed.replace(/\s+/g, " "), container: top ? top.name : "", doc, private: /private/.test(m[2]) });
      stack.push({ indent, name: m[4], kind });
    } else if (/^\s*(constructor|destructor)\b/.test(line) && top) {
      stack.push({ indent, name: top.name, kind: "function" });
    } else if ((m = VAR.exec(line))) {
      out.push({ name: m[4], kind: m[3] === "const" ? "constant" : (top && top.kind === "class" ? "field" : "variable"), line: i + 1, detail: trimmed, container: top ? top.name : "", doc, local: !!top && top.kind !== "class" });
    } else if ((m = TYPED.exec(line)) && !KW.has(m[3]) && m[3] !== "print" && !(top && top.kind === "enum")) {
      if (top && (top.kind === "class" || top.kind === "error")) out.push({ name: m[4], kind: "field", line: i + 1, detail: trimmed, container: top.name, doc });
      else if (m[5]) out.push({ name: m[4], kind: "variable", line: i + 1, detail: trimmed, container: top ? top.name : "", doc, local: !!top });
    } else if (top && top.kind === "enum" && /^[A-Z]\w*/.test(trimmed)) {
      out.push({ name: /^\w+/.exec(trimmed)[0], kind: "constant", line: i + 1, detail: top.name + "." + trimmed, container: top.name, doc });
    } else if ((m = /^\s*for\s+(\w+)(?:\s*,\s*(\w+))?\s+in\b/.exec(line))) {
      out.push({ name: m[1], kind: "variable", line: i + 1, detail: trimmed, container: top ? top.name : "", local: true });
      if (m[2]) out.push({ name: m[2], kind: "variable", line: i + 1, detail: trimmed, container: top ? top.name : "", local: true });
    }
    // Parameters of the function on this line.
    const fn = /\bfunction\s*\w*\s*\(([^)]*)\)/.exec(line) || /^\s*constructor\s*\(?([^)]*)\)?/.exec(line);
    if (fn && fn[1].trim()) {
      for (const part of fn[1].split(",")) {
        const p = /([A-Za-z_]\w*)\s*(?:=.*)?$/.exec(part.trim());
        if (p && /\s/.test(part.trim())) out.push({ name: p[1], kind: "variable", line: i + 1, detail: part.trim(), container: "", local: true, parameter: true });
      }
    }
  }
  return out;
}

/* A rough outline for other languages: [{ name, kind, line, detail }] */
const OUTLINES = {
  python: [[/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/, "function"], [/^(\s*)class\s+(\w+)/, "class"]],
  javascript: [[/^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*\(([^)]*)\)/, "function"], [/^(\s*)(?:export\s+)?(?:default\s+)?class\s+(\w+)/, "class"],
    [/^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/, "function"], [/^(\s{2,})(?:static\s+|async\s+)*(\w+)\s*\(([^)]*)\)\s*\{/, "method"]],
  rust: [[/^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/, "function"], [/^(\s*)(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/, "class"], [/^(\s*)impl(?:<[^>]*>)?\s+([\w:<>]+)/, "class"]],
  go: [[/^(\s*)func\s+(?:\([^)]*\)\s*)?(\w+)/, "function"], [/^(\s*)type\s+(\w+)/, "class"]],
  cpp: [[/^(\s*)(?:class|struct|enum(?:\s+class)?)\s+(\w+)/, "class"], [/^(\s*)[\w:<>*&~\s]+?\b(\w+)\s*\([^;]*\)\s*(?:const\s*)?\{?\s*$/, "function"]],
  java: [[/^(\s*)(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+)*(?:class|interface|enum|record)\s+(\w+)/, "class"],
    [/^(\s+)(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)+[\w<>\[\], ]+\s+(\w+)\s*\(/, "method"]],
  ruby: [[/^(\s*)def\s+([\w.?!]+)/, "function"], [/^(\s*)(?:class|module)\s+([\w:]+)/, "class"]],
  php: [[/^(\s*)(?:public\s+|private\s+|protected\s+|static\s+)*function\s+(\w+)/, "function"], [/^(\s*)(?:abstract\s+|final\s+)?class\s+(\w+)/, "class"]],
  lua: [[/^(\s*)(?:local\s+)?function\s+([\w.:]+)/, "function"]],
  shell: [[/^(\s*)(?:function\s+)?(\w+)\s*\(\)\s*\{?/, "function"]],
  markdown: [[/^()(#{1,6})\s+(.+)$/, "heading"]],
  css: [[/^()([^{}@\/][^{}]*?)\s*\{\s*$/, "rule"]],
};
OUTLINES.typescript = OUTLINES.javascript;
OUTLINES.c = OUTLINES.cpp;
OUTLINES.cogwheel = OUTLINES.markdown;

function outline(text, language) {
  if (language === "flywheel") return symbols(text).filter(s => !s.local && s.kind !== "module");
  const rules = OUTLINES[language];
  if (!rules) return [];
  const out = [];
  let fence = false;
  text.split("\n").forEach((line, i) => {
    if (language === "markdown" || language === "cogwheel") { if (/^\s*(```|~~~)/.test(line)) fence = !fence; if (fence) return; }
    for (const [pattern, kind] of rules) {
      const m = pattern.exec(line);
      if (!m) continue;
      if (kind === "heading") out.push({ name: m[3].replace(/\s+#+$/, ""), kind, line: i + 1, depth: m[2].length - 1, detail: "" });
      else if (!/^(if|for|while|switch|return|else|catch)$/.test(m[2])) out.push({ name: m[2].trim(), kind, line: i + 1, depth: Math.floor(m[1].length / 2), detail: line.trim() });
      break;
    }
  });
  return out;
}

/* ------------------------------------------------------------------ suggestions */

/* `env` supplies what lies outside the file:
 *   modules(): names that `import` can load here (project files and installed packages)
 *   moduleSymbols(name): symbols of such a module, or null */
function completions(text, pos, env) {
  const before = text.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);
  const word = /[A-Za-z_][\w]*$/.exec(line);
  const partial = word ? word[0] : "";
  const from = pos - partial.length;
  const lead = line.slice(0, line.length - partial.length);
  const own = symbols(text);
  const options = [];
  const add = (label, type, detail, info, boost, apply) => options.push({ label, type, detail: detail || undefined, info: info || undefined, boost: boost || 0, apply });

  // Inside a comment or a string (but not an interpolation): nothing.
  const code = stripComment(line);
  if (code.length < line.length) return null;
  let quotes = 0, depth = 0;
  for (let i = 0; i < lead.length; i++) {
    const c = lead[i];
    if (c === "\\") { i++; continue; }
    if (c === '"') { quotes++; depth = 0; }
    else if (quotes % 2 && c === "{" && lead[i + 1] !== " ") depth++;
    else if (quotes % 2 && c === "}" && depth) depth--;
  }
  if (quotes % 2 && depth === 0) return null;

  const importing = /^\s*import(?:\+\+)?\s+([\w.]*)$/.exec(line);
  if (importing) {
    const seen = new Set();
    for (const name of (env && env.modules ? env.modules() : [])) if (!seen.has(name)) { seen.add(name); add(name, "namespace", "project", null, 3); }
    for (const name of Object.keys(LIBRARY)) if (!seen.has(name)) add(name, "namespace", "library", LIBRARY[name].doc, 1);
    return { from, options, validFor: /^\w*$/ };
  }

  const member = /([A-Za-z_]\w*)\s*\.\s*$/.exec(lead);
  if (member) {
    const base = member[1];
    const imported = own.find(s => s.kind === "module" && s.name === base);
    const moduleName = imported ? imported.module.split(/[./]/).filter(Boolean).pop().replace(/\.(fw|fly)$/, "") : base;
    const external = env && env.moduleSymbols ? env.moduleSymbols(imported ? imported.module : base) : null;
    if (external) {
      for (const s of external) if (!s.local && !s.private && !s.container && s.kind !== "module") add(s.name, kindType(s.kind), s.detail, s.doc, 2);
      return { from, options, validFor: /^\w*$/ };
    }
    if (LIBRARY[moduleName] && (imported || !own.some(s => s.name === base))) {
      for (const [name, [signature, doc]] of Object.entries(LIBRARY[moduleName].members)) add(name, /^[A-Z_]+$/.test(name) ? "constant" : /^[A-Z]/.test(name) ? "class" : "function", signature, doc, 2);
      return { from, options, validFor: /^\w*$/ };
    }
    // this.<member>: the enclosing class; otherwise members of every class in the file, then methods.
    let container = "";
    if (base === "this" || base === "super") {
      const lineNo = text.slice(0, pos).split("\n").length;
      const classes = own.filter(s => (s.kind === "class") && s.line <= lineNo);
      if (classes.length) container = classes[classes.length - 1].name;
    } else if (own.some(s => (s.kind === "class" || s.kind === "enum") && s.name === base)) container = base;
    const seen = new Set();
    for (const s of own) {
      if (!s.container || (s.kind !== "field" && s.kind !== "method" && s.kind !== "constant")) continue;
      if (container && s.container !== container) continue;
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      add(s.name, kindType(s.kind), s.detail, s.doc, container ? 3 : 1);
    }
    if (!container || base === "this") for (const [name, detail] of Object.entries(METHODS)) if (!seen.has(name) && !container) add(name, "method", detail, null, 0);
    return { from, options, validFor: /^\w*$/ };
  }

  // A markup tag name.
  if (/<\/?$/.test(lead) && /import\s+html/.test(text)) {
    for (const tag of HTML_TAGS) add(tag, "type", "tag");
    for (const s of own) if (s.kind === "component") add(s.name, "class", "component", null, 2);
    return { from, options, validFor: /^[\w-]*$/ };
  }
  if (!partial) return null;

  const lineNo = before.split("\n").length;
  const seen = new Set();
  for (const s of own) {
    if (seen.has(s.name) || s.container && (s.kind === "field" || s.kind === "method")) continue;
    if (s.local && s.line > lineNo) continue;
    seen.add(s.name);
    add(s.name, kindType(s.kind), s.kind === "module" ? "import " + s.module : s.detail, s.doc, s.local ? 4 : 3);
  }
  // Names of modules imported with `.*`.
  for (const s of own) {
    if (s.kind !== "module" || !s.wildcard || !env || !env.moduleSymbols) continue;
    for (const e of env.moduleSymbols(s.module) || []) if (!e.local && !e.private && !e.container && !seen.has(e.name)) { seen.add(e.name); add(e.name, kindType(e.kind), e.detail, e.doc, 2); }
  }
  for (const [name, [signature, doc]] of Object.entries(BUILTINS)) if (!seen.has(name)) { seen.add(name); add(name, "function", signature, doc, 1); }
  for (const k of KEYWORDS) if (!seen.has(k)) add(k, "keyword", null, null, 0);
  for (const t of TYPES) if (!seen.has(t)) add(t, "type", null, null, 0);
  for (const c of CONSTANTS) add(c, "constant", null, null, 0);
  const startOfStatement = /^\s*$/.test(lead);
  if (startOfStatement) for (const [name, body, detail] of SNIPPETS) options.push({ label: name, type: "text", detail, snippet: body, boost: -1 });
  // A library module that is not imported yet: suggest it, and add the import when chosen.
  for (const name of Object.keys(LIBRARY)) if (!seen.has(name) && name.startsWith(partial) && partial.length >= 2) options.push({ label: name, type: "namespace", detail: "import " + name, info: LIBRARY[name].doc, boost: -2, addImport: name });
  return { from, options, validFor: /^\w*$/ };
}

function kindType(kind) {
  return { function: "function", method: "method", class: "class", interface: "interface", enum: "enum", variable: "variable", field: "property", constant: "constant", module: "namespace", component: "class", elements: "class" }[kind] || "variable";
}

/* What to show when the pointer rests on a word: { title, text } or null. */
function hover(text, pos, env) {
  let start = pos, end = pos;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  if (start === end) return null;
  const word = text.slice(start, end);
  const own = symbols(text);
  const base = /([A-Za-z_]\w*)\s*\.$/.exec(text.slice(Math.max(0, start - 60), start));
  if (base) {
    const imported = own.find(s => s.kind === "module" && s.name === base[1]);
    const moduleName = imported ? imported.module.split(/[./]/).pop() : base[1];
    const external = env && env.moduleSymbols ? env.moduleSymbols(imported ? imported.module : base[1]) : null;
    if (external) { const s = external.find(x => x.name === word && !x.container); if (s) return { from: start, to: end, title: s.detail, text: s.doc || "" }; }
    if (LIBRARY[moduleName] && LIBRARY[moduleName].members[word]) { const [sig, doc] = LIBRARY[moduleName].members[word]; return { from: start, to: end, title: moduleName + "." + sig, text: doc }; }
    const member = own.find(s => s.name === word && s.container);
    if (member) return { from: start, to: end, title: member.detail, text: (member.doc ? member.doc + " " : "") + "(in " + member.container + ")" };
    return null;
  }
  const lineNo = text.slice(0, pos).split("\n").length;
  const candidates = own.filter(s => s.name === word && !(s.container && (s.kind === "field" || s.kind === "method")));
  const found = candidates.filter(s => s.line <= lineNo).pop() || candidates[0];
  if (found) return { from: start, to: end, title: found.detail, text: found.doc || (found.kind === "module" && LIBRARY[found.module] ? LIBRARY[found.module].doc : ""), line: found.line };
  if (BUILTINS[word]) return { from: start, to: end, title: BUILTINS[word][0], text: BUILTINS[word][1] };
  if (LIBRARY[word]) return { from: start, to: end, title: "module " + word, text: LIBRARY[word].doc };
  return null;
}

/* Where `word` (at pos) is declared: { line } in this file, or { module, name } in another. */
function definition(text, pos) {
  let start = pos, end = pos;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word) return null;
  const own = symbols(text);
  const base = /([A-Za-z_]\w*)\s*\.$/.exec(text.slice(Math.max(0, start - 60), start));
  if (base) {
    const imported = own.find(s => s.kind === "module" && s.name === base[1]);
    if (imported) return { module: imported.module, name: word };
    const member = own.find(s => s.name === word && s.container);
    return member ? { line: member.line } : null;
  }
  const lineNo = text.slice(0, pos).split("\n").length;
  const candidates = own.filter(s => s.name === word);
  const found = candidates.filter(s => s.line <= lineNo && !s.container).pop() || candidates[0];
  if (!found) return null;
  if (found.kind === "module") return { module: found.module, name: "" };
  return { line: found.line };
}

/* Re-indents Flywheel code by block structure (what `flywheel --format` does), for the web build. */
function format(text, unit) {
  unit = unit || "    ";
  const stack = [];
  let inString = false;
  const out = [];
  const top = () => stack[stack.length - 1];
  for (const raw of text.replace(/\s+$/, "").split("\n")) {
    if (inString) { out.push(raw); if ((raw.match(/(?<!\\)"/g) || []).length % 2) inString = false; continue; }
    const line = raw.trim();
    const code = stripComment(line).trim();
    if (line === "") { out.push(""); continue; }
    let here = stack.length;
    if (/^end\b/.test(code)) {
      if (top() === "case") stack.pop();
      stack.pop();
      here = stack.length;
    } else if (/^case\b/.test(code) || (/^else\b/.test(code) && (top() === "case" || top() === "match"))) {
      if (top() === "case") stack.pop();
      here = stack.length;
      stack.push("case");
    } else if (/^(else|catch|finally)\b/.test(code)) {
      here = Math.max(0, stack.length - 1);
    } else if (OPENS.test(code) && !/=>/.test(code)) {
      stack.push(/(?:^|[\s=(,\[])match\s/.test(code) ? "match" : "block");
    }
    out.push(unit.repeat(here) + line);
    if ((code.match(/(?<!\\)"/g) || []).length % 2) inString = true;
  }
  return out.join("\n") + "\n";
}

root.FlywheelLang = { mode, OPENS, METHODS, HTML_TAGS, LIBRARY, KEYWORDS, TYPES, BUILTINS, SNIPPETS, symbols, outline, completions, hover, definition, format, stripComment };
})(typeof self !== "undefined" ? self : this);
