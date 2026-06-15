/* worker.js — runs Python (Pyodide) off the main thread so input() can block.
 *
 * Live console input works like a real terminal: when Python calls input(), the
 * worker sleeps on a SharedArrayBuffer via Atomics.wait until the main thread
 * writes the line you typed and wakes it. (Atomics.wait isn't allowed on the
 * main thread, which is why Python has to live here.) */

let pyodide = null;
let stdinCtrl = null;   // Int32Array(2): [0]=signal, [1]=byte length (or -1 for EOF)
let stdinData = null;   // Uint8Array shared buffer for the typed line
const decoder = new TextDecoder();

const BOOT_PY = `
import os, sys

# Headless matplotlib so figures render to PNG instead of needing a window.
os.environ['MPLBACKEND'] = 'AGG'

# Collect any open matplotlib figures as base64 PNGs, then clear them.
def _katie_collect_figures():
    if 'matplotlib' not in sys.modules:
        return []
    import matplotlib.pyplot as plt, io, base64
    out = []
    for num in plt.get_fignums():
        fig = plt.figure(num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=110)
        buf.seek(0)
        out.append(base64.b64encode(buf.read()).decode('ascii'))
    plt.close('all')
    return out
`;

function post(type, payload = {}) { self.postMessage({ type, ...payload }); }

// Called synchronously by Pyodide whenever Python reads from stdin.
function blockingStdin() {
  Atomics.store(stdinCtrl, 0, 0);     // mark "waiting" before announcing
  post("input-request");              // ask the main thread for a line
  Atomics.wait(stdinCtrl, 0, 0);      // sleep until the signal flips to 1
  const len = Atomics.load(stdinCtrl, 1);
  if (len < 0) return null;           // EOF
  // Copy the bytes out, then return the line (already includes a trailing \n).
  return decoder.decode(stdinData.slice(0, len));
}

async function boot() {
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");
  post("status", { text: "Loading Python runtime…", kind: "busy" });
  pyodide = await loadPyodide();
  // Unbuffered write handlers (not "batched") so a prompt with no trailing
  // newline — like input("Name? ") — shows immediately, before we read stdin.
  pyodide.setStdout({ write: (buf) => { post("stdout", { text: decoder.decode(buf) }); return buf.length; } });
  pyodide.setStderr({ write: (buf) => { post("stderr", { text: decoder.decode(buf) }); return buf.length; } });
  pyodide.setStdin({ stdin: blockingStdin, isatty: true });
  await pyodide.runPythonAsync(BOOT_PY);
  post("status", { text: "Ready", kind: "ok" });
  post("ready");
}

async function run(code) {
  post("status", { text: "Running…", kind: "busy" });
  try {
    await pyodide.loadPackagesFromImports(code);
  } catch (_) { /* a missing package surfaces as a normal ImportError below */ }

  let failed = false;
  const ns = pyodide.toPy({ __name__: "__main__" }); // fresh namespace each run
  try {
    await pyodide.runPythonAsync(code, { globals: ns });
  } catch (err) {
    post("stderr", { text: formatError(err) });
    failed = true;
  } finally {
    ns.destroy();
  }

  try {
    const figsProxy = await pyodide.runPythonAsync("_katie_collect_figures()");
    const figs = figsProxy.toJs();
    figsProxy.destroy();
    for (const b64 of figs) post("image", { b64 });
  } catch (_) { /* no figures */ }

  post("status", { text: failed ? "Finished with an error" : "Done", kind: failed ? "error" : "ok" });
  post("done");
}

function formatError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const i = msg.indexOf("Traceback (most recent call last):");
  return (i >= 0 ? msg.slice(i) : msg).trimEnd() + "\n";
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    stdinCtrl = new Int32Array(msg.controlSAB);
    stdinData = new Uint8Array(msg.dataSAB);
    try { await boot(); }
    catch (err) { post("status", { text: "Failed to load Python", kind: "error" }); post("stderr", { text: String(err) + "\n" }); }
  } else if (msg.type === "run") {
    await run(msg.code);
  }
};
