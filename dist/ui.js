"use strict";
(() => {
  // src/ui.ts
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("form#sync-form");
    const repoInput = document.querySelector('input[name="repo"]');
    const branchInput = document.querySelector('input[name="branch"]');
    const basePathInput = document.querySelector('input[name="basePath"]');
    const statusEl = document.querySelector("#status");
    const button = document.querySelector('button[type="submit"]');
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setStatus(statusEl, "Syncing design data from GitHub\u2026");
      button.disabled = true;
      try {
        const details = parseRepositoryDetails(repoInput.value, branchInput.value, basePathInput.value);
        const payload = await loadPdsaPayload(details);
        parent.postMessage({ pluginMessage: { type: "sync", payload } }, "*");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(statusEl, message, true);
        button.disabled = false;
      }
    });
    window.onmessage = (event) => {
      var _a;
      const message = (_a = event.data.pluginMessage) != null ? _a : event.data;
      if (!message) {
        return;
      }
      if (message.type === "sync-success") {
        setStatus(statusEl, `Sync complete. Generated ${message.details.flows} flow page(s).`);
        button.disabled = false;
      }
      if (message.type === "sync-error") {
        setStatus(statusEl, `Sync failed: ${message.error}`, true);
        button.disabled = false;
      }
    };
  });
  function setStatus(el, message, isError = false) {
    el.textContent = message;
    el.dataset.state = isError ? "error" : "info";
  }
  function parseRepositoryDetails(repoValue, branchValue, basePathValue) {
    const trimmed = repoValue.trim();
    if (!trimmed.includes("/")) {
      throw new Error('Enter the repository as "owner/repo".');
    }
    const [owner, repo] = trimmed.split("/", 2).map((part) => part.trim());
    if (!owner || !repo) {
      throw new Error("Both owner and repo are required.");
    }
    const branch = branchValue.trim() || "main";
    const basePath = normalizeBasePath(basePathValue);
    return { owner, repo, branch, basePath };
  }
  async function loadPdsaPayload(details) {
    var _a, _b;
    const pds = await fetchJsonFile(details, "pds.json", true);
    if (!(pds == null ? void 0 : pds.product)) {
      throw new Error("pds.json is missing or malformed.");
    }
    const flows = {};
    for (const flow of (_a = pds.product.flows) != null ? _a : []) {
      const definition = await fetchJsonFile(details, flow.file);
      flows[flow.id] = definition;
    }
    const designSystemId = (_b = pds.product.design_system) == null ? void 0 : _b.id;
    if (!designSystemId) {
      throw new Error("Design system is not defined in pds.json.");
    }
    const designSystemPath = joinPath("design_systems", `${designSystemId}.map.json`);
    const designSystem = await fetchJsonFile(details, designSystemPath);
    return {
      repo: details,
      pds,
      flows,
      designSystem
    };
  }
  async function fetchJsonFile(details, relativePath, allowMarkdownFallback = false) {
    const normalizedPath = joinPath(details.basePath, relativePath);
    try {
      return await fetchGitHubJson(details, normalizedPath);
    } catch (error) {
      if (allowMarkdownFallback && normalizedPath.endsWith(".json")) {
        const markdownPath = normalizedPath.replace(/\.json$/i, ".md");
        return await fetchGitHubJson(details, markdownPath);
      }
      throw error;
    }
  }
  async function fetchGitHubJson(details, path) {
    const url = buildContentsUrl(details, path);
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json"
      }
    });
    if (!response.ok) {
      throw new Error(`GitHub responded with ${response.status} for ${path}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      throw new Error(`${path} is a directory; expected a file.`);
    }
    if (!data.content || data.encoding !== "base64") {
      throw new Error(`Unexpected GitHub API response for ${path}`);
    }
    const decoded = atob(String(data.content).replace(/\n/g, ""));
    try {
      return JSON.parse(decoded);
    } catch (error) {
      console.error("Failed to parse JSON", { path, decoded });
      throw new Error(`Unable to parse JSON for ${path}`);
    }
  }
  function buildContentsUrl(details, path) {
    const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
    return `https://api.github.com/repos/${details.owner}/${details.repo}/contents/${encodedPath}?ref=${encodeURIComponent(details.branch)}`;
  }
  function joinPath(...segments) {
    return segments.filter(Boolean).map((segment) => segment.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
  }
  function normalizeBasePath(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "/" || trimmed === ".") {
      return "";
    }
    return trimmed.replace(/^\/+|\/+$/g, "");
  }
})();
