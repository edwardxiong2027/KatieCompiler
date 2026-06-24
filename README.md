# Katie · Python Playground

A clean, ad-free, tracker-free Python playground that runs entirely in your browser. No server, no backend, no account — just a static website you can host for free on GitHub Pages.

Python runs through [Pyodide](https://pyodide.org), which is real CPython compiled to WebAssembly. Your code never leaves your computer, and packages like NumPy, pandas and matplotlib load on demand the first time you import them.

## Features

- A modern, minimalist editor with Python syntax highlighting and autocompletion
- Runs in the browser — print output, errors, and matplotlib graphs all appear inline
- `turtle` graphics work too: the drawing is rendered to a crisp SVG image in the Output panel
- An interactive console: `input()` lets you type directly on the console line, like a real terminal
- Light and dark themes, adjustable font size, a draggable split between code and output
- Your code is auto-saved in the browser between visits
- Optional GitHub sync: open and commit `.py` files in a repository of your choice
- Loads instantly and works offline once cached

## What works, and what can't

Most Python works: the language itself, the standard library, file I/O on a virtual in-memory filesystem, NumPy, pandas, matplotlib, scikit-learn, and many other pure-Python and scientific packages.

**Turtle graphics** are supported through a drop-in `turtle` module (`pyturtle.js`) that records every pen stroke and renders the finished drawing to SVG — the standard tkinter `turtle` can't run in a browser, so this re-implements the common classroom subset (movement, headings, pen/fill colours, `circle`, `dot`, `stamp`, `write`, and the `Screen` helpers). It draws the final picture rather than animating live, and GUI/event hooks like `onkey` and `mainloop` are accepted as no-ops. Other graphing libraries that render through matplotlib (e.g. `networkx`) work as well.

A few things can't work inside a browser sandbox, no matter the host: live desktop GUI windows (tkinter, pygame), real network sockets, `subprocess`/shelling out, and multiprocessing. These need the underlying operating system, which the browser deliberately walls off.

## Running it locally

Because it's just static files, open `index.html` through a tiny local server (opening the file directly with `file://` blocks some browser features):

```bash
cd KatieCompiler
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick the `main` branch and the `/ (root)` folder, then **Save**.
4. After a minute or two your playground is live at `https://<username>.github.io/<repo>/`.

Pages serves a public site. The repository itself can be private only on a paid GitHub plan; on the free plan the repo must be public for Pages to publish.

## GitHub sync

The **GitHub** button lets you open and commit `.py` files straight from a repository. It works client-side using a GitHub personal access token:

1. On GitHub: **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Scope it to the single repository you want, with **Contents: Read and write**.
3. Paste it into the GitHub panel here, along with the owner, repository, branch, and an optional folder.

The token is stored only in your browser's local storage. Anyone with access to that browser profile can read it, so use a fine-grained token limited to one repository, and revoke it on GitHub if you ever need to.

## Updating versions

The two external libraries are pinned in `index.html`: the Ace editor (cdnjs) and Pyodide (`v0.27.2` on jsDelivr). To move to a newer Python runtime, change the Pyodide version in that one URL.

## How interactive input works

So `input()` can pause the program and wait for you to type, Python runs in a Web Worker and blocks on a `SharedArrayBuffer` until the console hands it the line you typed. `SharedArrayBuffer` requires the page to be "cross-origin isolated", which GitHub Pages can't enable through HTTP headers — so `coi-serviceworker.js` registers a tiny service worker that supplies the needed headers. The first time you open the site it reloads itself once to turn this on; after that it's instant. If the service worker can't run (for example in a private window with workers blocked), the app falls back to a `window.prompt` dialog so it still works.

## Project layout

```
index.html            structure and CDN includes
styles.css            all styling (light/dark via CSS variables)
worker.js             Pyodide runs here: execute code, stdout/stderr, plots, turtle SVG, blocking stdin
pyturtle.js           pure-Python `turtle` module that renders drawings to SVG (shared by worker + fallback)
runner.js             main-thread side: manages the worker + shared-memory input (prompt fallback)
coi-serviceworker.js  enables cross-origin isolation so SharedArrayBuffer works on Pages
github.js             read & write files via the GitHub REST API
examples.js           starter programs for the Examples menu
app.js                wires the editor, runner, console input, GitHub sync and UI together
```
