/* github.js — read & write files in a GitHub repo from the browser.
 * Uses the REST contents API with a personal access token. Exposes `GitHub`. */

const GitHub = (() => {
  const API = "https://api.github.com";
  const KEY = "katie_github";

  function config() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch { return {}; }
  }
  function saveConfig(cfg) {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  }
  function configured() {
    const c = config();
    return Boolean(c.token && c.owner && c.repo);
  }

  function headers() {
    const { token } = config();
    return {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  // UTF-8 safe base64 helpers (btoa/atob are latin1 only).
  function encodeB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function decodeB64(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
  }

  function joinPath(folder, name) {
    const f = (folder || "").replace(/^\/+|\/+$/g, "");
    return f ? `${f}/${name}` : name;
  }

  async function gh(path, options = {}) {
    const res = await fetch(`${API}${path}`, { ...options, headers: headers() });
    if (res.status === 401) throw new Error("GitHub rejected the token (401). Check it has Contents access.");
    if (res.status === 404) { const e = new Error("Not found (404)."); e.notFound = true; throw e; }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message; } catch {}
      throw new Error(`GitHub error ${res.status}: ${detail || res.statusText}`);
    }
    return res.json();
  }

  // List .py files in the configured folder.
  async function listFiles() {
    const { owner, repo, branch, folder } = config();
    const dir = (folder || "").replace(/^\/+|\/+$/g, "");
    const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(dir).replace(/%2F/g, "/")}` +
                 `?ref=${encodeURIComponent(branch || "main")}`;
    let items;
    try {
      items = await gh(path);
    } catch (e) {
      if (e.notFound) return []; // folder doesn't exist yet
      throw e;
    }
    if (!Array.isArray(items)) return [];
    return items
      .filter((it) => it.type === "file" && it.name.endsWith(".py"))
      .map((it) => ({ name: it.name, path: it.path }));
  }

  // Returns { text, sha } for a file, or null if it doesn't exist.
  async function getFile(name) {
    const { owner, repo, branch, folder } = config();
    const fullPath = joinPath(folder, name);
    const url = `/repos/${owner}/${repo}/contents/${fullPath}?ref=${encodeURIComponent(branch || "main")}`;
    try {
      const data = await gh(url);
      return { text: decodeB64(data.content), sha: data.sha, path: data.path };
    } catch (e) {
      if (e.notFound) return null;
      throw e;
    }
  }

  // Create or update a file. Returns the commit response.
  async function commit(name, content, message) {
    const { owner, repo, branch, folder } = config();
    const fullPath = joinPath(folder, name);

    // Need the current sha to update an existing file.
    let sha;
    const existing = await getFile(name);
    if (existing) sha = existing.sha;

    const body = {
      message: message || `Update ${fullPath} via Katie`,
      content: encodeB64(content),
      branch: branch || "main",
    };
    if (sha) body.sha = sha;

    return gh(`/repos/${owner}/${repo}/contents/${fullPath}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  return { config, saveConfig, configured, listFiles, getFile, commit };
})();
