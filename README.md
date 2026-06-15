# Katie · Python Playground

A clean, ad-free, tracker-free Python playground that runs entirely in your browser. No server, no backend, no account — just a static website you can host for free on GitHub Pages.

Python runs through [Pyodide](https://pyodide.org), which is real CPython compiled to WebAssembly. Your code never leaves your computer, and packages like NumPy, pandas and matplotlib load on demand the first time you import them.

## Features

- A modern, minimalist editor with Python syntax highlighting and autocompletion
- Runs in the browser — print output, errors, `input()` prompts, and matplotlib graphs all appear inline
- Light and dark themes, adjustable font size, a draggable split between code and output
- Your code is auto-saved in the browser between visits
- Optional GitHub sync: open and commit `.py` files in a repository of your choice
- Loads instantly and works offline once cached

## What works, and what can't

Most Python works: the language itself, the standard library, file I/O on a virtual in-memory filesystem, NumPy, pandas, matplotlib, scikit-learn, and many other pure-Python and scientific packages.

A few things can't work inside a browser sandbox, no matter the host: desktop GUI windows (tkinter, pygame, turtle graphics in a window), real network sockets, `subprocess`/shelling out, and multiprocessing. These need the underlying operating system, which the browser deliberately walls off.

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

## Project layout

```
index.html     structure and CDN includes
styles.css     all styling (light/dark via CSS variables)
runner.js      Pyodide: run code, capture stdout/stderr, render plots, input()
github.js      read & write files via the GitHub REST API
examples.js    starter programs for the Examples menu
app.js         wires the editor, runner, GitHub sync and UI together
```
