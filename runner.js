/* runner.js — main-thread side of the Python runtime.
 *
 * Primary path: Pyodide runs in worker.js, and input() blocks on a
 * SharedArrayBuffer that we feed from the live console. Needs cross-origin
 * isolation (provided by coi-serviceworker.js).
 *
 * Fallback path: if isolation isn't available, Pyodide runs here on the main
 * thread and input() uses a window.prompt dialog so the app still works. */

const Runner = (() => {
  const hooks = {
    onText: (_t, _stream) => {},   // stream: "out" | "err"
    onImage: (_b64) => {},
    onSvg: (_svg) => {},           // turtle drawing rendered to SVG markup
    onStatus: (_t, _kind) => {},   // kind: "" | "busy" | "ok" | "error"
    onInputRequest: () => {},      // worker is blocked waiting for a console line
    onDone: () => {},
  };

  let mode = null;                 // "worker" | "inline"
  let ready = false;
  let booting = null;
  let running = false;

  // ---- worker path state ----
  let worker = null;
  let ctrl = null, data = null;
  const encoder = new TextEncoder();
  const inputQueue = [];           // type-ahead: lines entered before they're requested
  let awaiting = false;            // worker is currently blocked on input

  // ---- inline path state ----
  let pyodide = null;

  function isolated() {
    return typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated === true;
  }

  function boot() {
    if (booting) return booting;
    booting = isolated() ? bootWorker() : bootInline();
    return booting;
  }

  // ---------------------------------------------------------------- worker path
  function bootWorker() {
    return new Promise((resolve, reject) => {
      mode = "worker";
      const controlSAB = new SharedArrayBuffer(8);   // Int32Array(2)
      const dataSAB = new SharedArrayBuffer(1 << 16); // 64 KB line buffer
      ctrl = new Int32Array(controlSAB);
      data = new Uint8Array(dataSAB);

      worker = new Worker("worker.js");
      worker.onerror = (e) => { hooks.onStatus("Worker failed to start", "error"); reject(e); };
      worker.onmessage = (e) => {
        const m = e.data;
        switch (m.type) {
          case "status": hooks.onStatus(m.text, m.kind); break;
          case "stdout": hooks.onText(m.text, "out"); break;
          case "stderr": hooks.onText(m.text, "err"); break;
          case "image":  hooks.onImage(m.b64); break;
          case "svg":    hooks.onSvg(m.svg); break;
          case "input-request": serveOrWait(); break;
          case "ready":  ready = true; resolve(); break;
          case "done":   running = false; hooks.onDone(); break;
        }
      };
      worker.postMessage({ type: "init", controlSAB, dataSAB });
    });
  }

  function serveOrWait() {
    if (inputQueue.length) writeLine(inputQueue.shift());
    else { awaiting = true; hooks.onInputRequest(); }
  }

  function writeLine(line) {
    const bytes = encoder.encode(line + "\n");
    const n = Math.min(bytes.length, data.length);
    data.set(bytes.subarray(0, n));
    Atomics.store(ctrl, 1, n);
    Atomics.store(ctrl, 0, 1);
    Atomics.notify(ctrl, 0, 1);
    awaiting = false;
  }

  // ---------------------------------------------------------------- inline path
  const INLINE_BOOT = `
import os, builtins, sys
os.environ['MPLBACKEND'] = 'AGG'

def _katie_input(prompt=''):
    import js
    res = js.window.prompt(str(prompt))
    if res is None:
        raise KeyboardInterrupt('input was cancelled')
    print(str(prompt) + str(res))
    return res
builtins.input = _katie_input

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

def _katie_collect_turtle_svg():
    mod = sys.modules.get('turtle')
    if mod is None or not hasattr(mod, '_katie_collect_turtle'):
        return None
    return mod._katie_collect_turtle()

def _katie_reset_turtle():
    mod = sys.modules.get('turtle')
    if mod is not None and hasattr(mod, '_katie_reset_turtle'):
        mod._katie_reset_turtle()
`;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.crossOrigin = "anonymous";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function bootInline() {
    mode = "inline";
    hooks.onStatus("Loading Python runtime…", "busy");
    await loadScript("https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js");
    pyodide = await loadPyodide();
    const dec = new TextDecoder();
    pyodide.setStdout({ write: (b) => { hooks.onText(dec.decode(b), "out"); return b.length; } });
    pyodide.setStderr({ write: (b) => { hooks.onText(dec.decode(b), "err"); return b.length; } });
    await pyodide.runPythonAsync(INLINE_BOOT);
    await pyodide.runPythonAsync(self.KATIE_PY_TURTLE);   // register the `turtle` module
    ready = true;
    hooks.onStatus("Ready", "ok");
  }

  async function runInline(code) {
    hooks.onStatus("Running…", "busy");
    try { await pyodide.runPythonAsync("_katie_reset_turtle()"); } catch (_) {}
    try { await pyodide.loadPackagesFromImports(code); } catch (_) {}
    let failed = false;
    const ns = pyodide.toPy({ __name__: "__main__" });
    try {
      await pyodide.runPythonAsync(code, { globals: ns });
    } catch (err) {
      hooks.onText(formatError(err), "err");
      failed = true;
    } finally {
      ns.destroy();
    }
    try {
      const figsProxy = await pyodide.runPythonAsync("_katie_collect_figures()");
      const figs = figsProxy.toJs(); figsProxy.destroy();
      for (const b64 of figs) hooks.onImage(b64);
    } catch (_) {}
    try {
      const svg = await pyodide.runPythonAsync("_katie_collect_turtle_svg()");
      if (svg) hooks.onSvg(svg);
    } catch (_) {}
    hooks.onStatus(failed ? "Finished with an error" : "Done", failed ? "error" : "ok");
    running = false;
    hooks.onDone();
  }

  function formatError(err) {
    const msg = (err && err.message) ? err.message : String(err);
    const i = msg.indexOf("Traceback (most recent call last):");
    return (i >= 0 ? msg.slice(i) : msg).trimEnd() + "\n";
  }

  // ---------------------------------------------------------------- public API
  async function run(code) {
    if (running) return;
    if (!ready) await boot();
    running = true;
    if (mode === "worker") worker.postMessage({ type: "run", code });
    else runInline(code);
  }

  // A line typed in the console. In worker mode it feeds Python's stdin;
  // type-ahead is buffered until input() asks for it.
  function submitInput(line) {
    if (mode !== "worker") return false; // inline mode uses window.prompt instead
    if (awaiting) writeLine(line);
    else inputQueue.push(line);
    return true;
  }

  return {
    boot, run, submitInput, hooks,
    isReady: () => ready,
    isRunning: () => running,
    isInteractive: () => mode === "worker",
    isAwaitingInput: () => awaiting,
  };
})();
