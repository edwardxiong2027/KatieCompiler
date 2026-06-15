/* app.js — wires the editor, runner, GitHub sync and UI together. */

(() => {
  const $ = (sel) => document.querySelector(sel);

  // ---------- editor ----------
  ace.require("ace/ext/language_tools");
  const editor = ace.edit("editor");
  ace.config.set("basePath", "https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.6/");
  editor.session.setMode("ace/mode/python");
  editor.setOptions({
    fontSize: 14,
    showPrintMargin: false,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    scrollPastEnd: 0.5,
    useSoftTabs: true,
    tabSize: 4,
  });
  editor.setValue(localStorage.getItem("katie_code") || EXAMPLES.hello, -1);
  editor.session.on("change", debounce(() => {
    localStorage.setItem("katie_code", editor.getValue());
  }, 400));

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    editor.setTheme(theme === "dark" ? "ace/theme/tomorrow_night" : "ace/theme/chrome");
    localStorage.setItem("katie_theme", theme);
  }
  applyTheme(localStorage.getItem("katie_theme") || "light");
  $("#theme").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // ---------- output ----------
  const outEl = $("#output");
  function showPlaceholder() {
    outEl.innerHTML = '<span class="placeholder">Output will appear here. Press Run to start.</span>';
  }
  function clearOutput() { outEl.textContent = ""; }
  function appendText(text, stream) {
    if (outEl.querySelector(".placeholder")) outEl.textContent = "";
    const span = document.createElement("span");
    if (stream === "err") span.className = "err";
    span.textContent = text;
    outEl.appendChild(span);
    outEl.scrollTop = outEl.scrollHeight;
  }
  function appendImage(b64) {
    if (outEl.querySelector(".placeholder")) outEl.textContent = "";
    const img = document.createElement("img");
    img.className = "figure";
    img.src = "data:image/png;base64," + b64;
    outEl.appendChild(img);
    outEl.scrollTop = outEl.scrollHeight;
  }
  showPlaceholder();

  // ---------- status ----------
  const statusEl = $("#status");
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  // ---------- runner wiring ----------
  Runner.hooks.onText = appendText;
  Runner.hooks.onImage = appendImage;
  Runner.hooks.onStatus = setStatus;
  Runner.boot(); // start loading Python immediately

  const runBtn = $("#run");
  async function runCode() {
    if (runBtn.disabled) return;
    runBtn.disabled = true;
    clearOutput();
    try {
      await Runner.run(editor.getValue());
    } finally {
      runBtn.disabled = false;
      editor.focus();
    }
  }
  runBtn.addEventListener("click", runCode);
  $("#clear").addEventListener("click", () => { showPlaceholder(); setStatus(Runner.isReady() ? "Ready" : "Booting…", Runner.isReady() ? "ok" : ""); });

  // Ctrl/Cmd + Enter runs
  editor.commands.addCommand({
    name: "run",
    bindKey: { win: "Ctrl-Enter", mac: "Cmd-Enter" },
    exec: runCode,
  });

  // ---------- examples ----------
  $("#examples").addEventListener("change", (e) => {
    const key = e.target.value;
    if (EXAMPLES[key]) {
      editor.setValue(EXAMPLES[key], -1);
      editor.focus();
    }
    e.target.selectedIndex = 0;
  });

  // ---------- settings modal ----------
  const settingsModal = $("#settings-modal");
  $("#settings-btn").addEventListener("click", () => openModal(settingsModal));
  $("#set-fontsize").addEventListener("input", (e) => editor.setFontSize(parseInt(e.target.value, 10)));
  $("#set-wrap").addEventListener("change", (e) => editor.session.setUseWrapMode(e.target.checked));
  $("#set-autocomplete").addEventListener("change", (e) => editor.setOption("enableLiveAutocompletion", e.target.checked));

  // ---------- github modal ----------
  const ghModal = $("#github-modal");
  const ghStatus = $("#gh-status");
  const ghFiles = $("#gh-files");

  $("#github").addEventListener("click", () => {
    const c = GitHub.config();
    $("#gh-token").value = c.token || "";
    $("#gh-owner").value = c.owner || "";
    $("#gh-repo").value = c.repo || "";
    $("#gh-branch").value = c.branch || "main";
    $("#gh-path").value = c.folder || "";
    ghStatus.textContent = "";
    ghFiles.hidden = true;
    openModal(ghModal);
  });

  function readGhForm() {
    return {
      token: $("#gh-token").value.trim(),
      owner: $("#gh-owner").value.trim(),
      repo: $("#gh-repo").value.trim(),
      branch: $("#gh-branch").value.trim() || "main",
      folder: $("#gh-path").value.trim(),
    };
  }

  $("#gh-save-settings").addEventListener("click", () => {
    GitHub.saveConfig(readGhForm());
    ghStatus.textContent = "Settings saved in this browser.";
  });

  $("#gh-commit").addEventListener("click", async () => {
    GitHub.saveConfig(readGhForm());
    if (!GitHub.configured()) { ghStatus.textContent = "Add a token, owner and repository first."; return; }
    const name = $("#filename").value.trim() || "main.py";
    ghStatus.textContent = `Committing ${name}…`;
    try {
      const res = await GitHub.commit(name, editor.getValue(), `Update ${name} via Katie`);
      const url = res.content && res.content.html_url;
      ghStatus.innerHTML = url ? `Committed. <a href="${url}" target="_blank" rel="noopener">View on GitHub →</a>` : "Committed.";
    } catch (e) {
      ghStatus.textContent = e.message;
    }
  });

  $("#gh-open").addEventListener("click", async () => {
    GitHub.saveConfig(readGhForm());
    if (!GitHub.configured()) { ghStatus.textContent = "Add a token, owner and repository first."; return; }
    ghStatus.textContent = "Loading file list…";
    ghFiles.hidden = true;
    ghFiles.innerHTML = "";
    try {
      const files = await GitHub.listFiles();
      if (!files.length) { ghStatus.textContent = "No .py files found in that folder yet."; return; }
      ghStatus.textContent = `${files.length} file${files.length > 1 ? "s" : ""} found:`;
      for (const f of files) {
        const b = document.createElement("button");
        b.textContent = f.name;
        b.addEventListener("click", async () => {
          ghStatus.textContent = `Loading ${f.name}…`;
          try {
            const file = await GitHub.getFile(f.name);
            editor.setValue(file.text, -1);
            $("#filename").value = f.name;
            closeModal(ghModal);
            editor.focus();
          } catch (e) { ghStatus.textContent = e.message; }
        });
        ghFiles.appendChild(b);
      }
      ghFiles.hidden = false;
    } catch (e) {
      ghStatus.textContent = e.message;
    }
  });

  // ---------- modal helpers ----------
  function openModal(m) { m.hidden = false; }
  function closeModal(m) { m.hidden = true; }
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal(b.closest(".modal-backdrop"))));
  document.querySelectorAll(".modal-backdrop").forEach((bg) =>
    bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(bg); }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-backdrop:not([hidden])").forEach(closeModal);
  });

  // ---------- splitter ----------
  const splitter = $("#splitter");
  const editorPane = document.querySelector(".editor-pane");
  let dragging = false;
  splitter.addEventListener("mousedown", () => { dragging = true; document.body.style.cursor = "col-resize"; });
  window.addEventListener("mouseup", () => { dragging = false; document.body.style.cursor = ""; });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const ws = document.querySelector(".workspace").getBoundingClientRect();
    const pct = ((e.clientX - ws.left) / ws.width) * 100;
    if (pct > 15 && pct < 85) {
      editorPane.style.flex = `0 0 ${pct}%`;
      editor.resize();
    }
  });

  // ---------- utils ----------
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
})();
