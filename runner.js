/* runner.js — runs Python in the browser via Pyodide (CPython on WebAssembly).
 * Exposes a small global `Runner` used by app.js. */

const Runner = (() => {
  let pyodide = null;
  let ready = false;
  let booting = null;

  // Callbacks wired up by app.js
  const hooks = {
    onText: (_text, _stream) => {},   // stream: "out" | "err"
    onImage: (_b64png) => {},
    onStatus: (_text, _kind) => {},   // kind: "" | "busy" | "ok" | "error"
  };

  function status(text, kind = "") { hooks.onStatus(text, kind); }

  // Python helpers installed once at boot.
  const BOOT_PY = `
import os, builtins, sys

# Headless matplotlib so figures render to PNG instead of needing a window.
os.environ['MPLBACKEND'] = 'AGG'

def _katie_input(prompt=''):
    import js
    res = js.window.prompt(str(prompt))
    if res is None:
        raise KeyboardInterrupt('input was cancelled')
    # Echo the prompt + answer so the console reads naturally.
    print(str(prompt) + str(res))
    return res

builtins.input = _katie_input

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

  async function boot() {
    if (booting) return booting;
    booting = (async () => {
      status("Loading Python runtime…", "busy");
      pyodide = await loadPyodide();
      pyodide.setStdout({ batched: (s) => hooks.onText(s, "out") });
      pyodide.setStderr({ batched: (s) => hooks.onText(s, "err") });
      await pyodide.runPythonAsync(BOOT_PY);
      ready = true;
      status("Ready", "ok");
    })();
    return booting;
  }

  async function run(code) {
    if (!ready) {
      status("Still loading Python…", "busy");
      await boot();
    }
    status("Running…", "busy");

    // Pull in any packages the program imports (numpy, pandas, matplotlib, …).
    try {
      await pyodide.loadPackagesFromImports(code);
    } catch (_) {
      // A missing package will surface as a normal ImportError below.
    }

    // Fresh namespace each run so programs don't leak state into each other.
    const ns = pyodide.toPy({ __name__: "__main__" });
    let failed = false;
    try {
      await pyodide.runPythonAsync(code, { globals: ns });
    } catch (err) {
      hooks.onText(formatError(err), "err");
      failed = true;
    } finally {
      ns.destroy();
    }

    // Render any plots the program produced.
    try {
      const figsProxy = await pyodide.runPythonAsync("_katie_collect_figures()");
      const figs = figsProxy.toJs();
      figsProxy.destroy();
      for (const b64 of figs) hooks.onImage(b64);
    } catch (_) { /* no figures */ }

    status(failed ? "Finished with an error" : "Done", failed ? "error" : "ok");
  }

  // Pyodide error messages include a long JS stack; keep the Python traceback.
  function formatError(err) {
    const msg = (err && err.message) ? err.message : String(err);
    const marker = "Traceback (most recent call last):";
    const i = msg.indexOf(marker);
    return (i >= 0 ? msg.slice(i) : msg).trimEnd() + "\n";
  }

  return { boot, run, hooks, isReady: () => ready };
})();
