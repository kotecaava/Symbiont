"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/ui.ts
  var ROW_HEIGHT = 88;
  var THUMBNAIL_SIZE = 44;
  var SEARCH_DEBOUNCE = 40;
  var LOG_PREFIX = "[component-browser][ui]";
  function log(...values) {
    console.log(LOG_PREFIX, ...values);
  }
  function logError(...values) {
    console.error(LOG_PREFIX, ...values);
  }
  var thumbnails = /* @__PURE__ */ new Map();
  var pendingThumbnails = /* @__PURE__ */ new Set();
  var rowCache = /* @__PURE__ */ new Map();
  var registry = null;
  var items = [];
  var filtered = [];
  var searchTerm = "";
  var isScanning = false;
  var scheduledFrame = 0;
  var searchInput;
  var rescanButton;
  var metaLine;
  var listElement;
  var listInner;
  var emptyState;
  var errorBanner;
  var searchDebounceHandle;
  document.addEventListener("DOMContentLoaded", () => {
    log("UI booting");
    searchInput = document.getElementById("searchInput");
    rescanButton = document.getElementById("rescanButton");
    metaLine = document.getElementById("metaLine");
    listElement = document.getElementById("results");
    listInner = document.getElementById("resultsInner");
    emptyState = document.getElementById("emptyState");
    errorBanner = document.getElementById("errorBanner");
    searchInput.focus();
    searchInput.addEventListener("input", () => {
      if (searchDebounceHandle) {
        window.clearTimeout(searchDebounceHandle);
      }
      const value = searchInput.value;
      log("Search input changed", value);
      searchDebounceHandle = window.setTimeout(() => {
        applySearch(value);
      }, SEARCH_DEBOUNCE);
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (searchInput.value) {
          searchInput.value = "";
          applySearch("");
          event.preventDefault();
        }
      }
    });
    rescanButton.addEventListener("click", () => {
      log("Rescan button clicked");
      requestScan();
    });
    listElement.addEventListener("scroll", () => {
      if (scheduledFrame) {
        return;
      }
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = 0;
        renderVisibleRows();
      });
    });
    window.onmessage = (event) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }
      log("Received plugin message", message.type);
      handlePluginMessage(message);
    };
    requestScan();
  });
  function handlePluginMessage(message) {
    switch (message.type) {
      case "scan-result":
        onScanResult(message.payload);
        break;
      case "thumbnail-result":
        onThumbnailResult(message);
        break;
      case "ready":
        log("Plugin signaled ready");
        requestScan();
        break;
      case "error":
        showError(message.message);
        break;
      default:
        break;
    }
  }
  function onScanResult(payload) {
    isScanning = false;
    rescanButton.disabled = false;
    hideError();
    log("Scan result received", { total: payload.total, collectedAt: payload.collectedAt });
    rowCache.clear();
    pendingThumbnails.clear();
    registry = payload;
    items = payload.items.map((item) => augmentItem(item));
    filtered = applyFilter(items, searchTerm);
    listElement.scrollTop = 0;
    render();
    const timestamp = formatTimestamp(payload.collectedAt);
    metaLine.textContent = `Scanned ${payload.total} components \u2022 ${timestamp}`;
  }
  function onThumbnailResult(message) {
    pendingThumbnails.delete(message.nodeId);
    thumbnails.set(message.nodeId, message.dataUrl);
    log("Thumbnail result received", { nodeId: message.nodeId, hasData: Boolean(message.dataUrl) });
    const elements = rowCache.get(message.nodeId);
    if (elements) {
      updateThumbnail(elements.thumbnail, message.nodeId);
    }
  }
  function augmentItem(item) {
    var _a, _b, _c;
    const tokens = [
      item.name,
      item.canonical,
      (_a = item.description) != null ? _a : "",
      (_b = item.pageName) != null ? _b : "",
      item.from
    ];
    if (item.variantProps) {
      for (const [key, value] of Object.entries(item.variantProps)) {
        tokens.push(key, value, `${key}:${value}`);
      }
    }
    const searchText = tokens.filter(Boolean).join(" ").toLowerCase();
    return __spreadProps(__spreadValues({}, item), {
      searchText,
      truncatedDescription: truncate((_c = item.description) != null ? _c : "", 120)
    });
  }
  function applySearch(value) {
    searchTerm = value.trim().toLowerCase();
    filtered = applyFilter(items, searchTerm);
    listElement.scrollTop = 0;
    render();
    log("Applied search", { term: searchTerm, results: filtered.length });
  }
  function applyFilter(source, term) {
    if (!term) {
      return [...source];
    }
    const tokens = term.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return [...source];
    }
    return source.filter((item) => tokens.every((token) => item.searchText.includes(token)));
  }
  function requestScan() {
    if (isScanning) {
      log("Scan request ignored because scan is already running");
      return;
    }
    isScanning = true;
    rescanButton.disabled = true;
    metaLine.textContent = "Scanning\u2026";
    log("Requesting scan from plugin");
    parent.postMessage({ pluginMessage: { type: "scan" } }, "*");
  }
  function render() {
    updateEmptyState();
    listInner.style.height = `${filtered.length * ROW_HEIGHT}px`;
    renderVisibleRows();
  }
  function renderVisibleRows() {
    const scrollTop = listElement.scrollTop;
    const viewportHeight = listElement.clientHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
    const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 4);
    const fragment = document.createDocumentFragment();
    for (let index = startIndex; index < endIndex; index += 1) {
      const item = filtered[index];
      const row = ensureRow(item);
      row.container.style.transform = `translateY(${index * ROW_HEIGHT}px)`;
      fragment.appendChild(row.container);
      maybeRequestThumbnail(item);
    }
    listInner.replaceChildren(fragment);
  }
  function ensureRow(item) {
    let existing = rowCache.get(item.id);
    if (!existing) {
      existing = createRow(item);
      rowCache.set(item.id, existing);
    }
    updateRow(existing, item);
    return existing;
  }
  function createRow(item) {
    const button = document.createElement("button");
    button.className = "component-row";
    button.type = "button";
    button.dataset.nodeId = item.id;
    button.addEventListener("click", () => {
      navigator.clipboard.writeText(item.id).catch(() => {
        showError("Unable to copy node id to clipboard.");
      });
    });
    const thumbnailWrapper = document.createElement("div");
    thumbnailWrapper.className = "component-row__thumb";
    const img = document.createElement("img");
    img.width = THUMBNAIL_SIZE;
    img.height = THUMBNAIL_SIZE;
    img.alt = "";
    img.decoding = "async";
    thumbnailWrapper.appendChild(img);
    const content = document.createElement("div");
    content.className = "component-row__content";
    const name = document.createElement("div");
    name.className = "component-row__name";
    const canonical = document.createElement("div");
    canonical.className = "component-row__canonical";
    const description = document.createElement("div");
    description.className = "component-row__description";
    const tags = document.createElement("div");
    tags.className = "component-row__tags";
    content.appendChild(name);
    content.appendChild(canonical);
    content.appendChild(description);
    content.appendChild(tags);
    button.appendChild(thumbnailWrapper);
    button.appendChild(content);
    return {
      container: button,
      thumbnailWrapper,
      thumbnail: img,
      name,
      canonical,
      description,
      tags
    };
  }
  function updateRow(elements, item) {
    elements.container.dataset.nodeId = item.id;
    elements.name.textContent = item.name;
    elements.canonical.textContent = item.canonical;
    elements.description.textContent = item.truncatedDescription;
    updateTags(elements.tags, item);
    updateThumbnail(elements.thumbnail, item.id);
  }
  function updateTags(container, item) {
    container.replaceChildren();
    const from = document.createElement("span");
    from.className = "tag";
    from.textContent = item.from;
    container.appendChild(from);
    if (item.variantProps) {
      for (const [key, value] of Object.entries(item.variantProps)) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `${key}:${value}`;
        container.appendChild(tag);
      }
    }
    if (item.pageName) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = `page:${item.pageName}`;
      container.appendChild(tag);
    }
  }
  function updateThumbnail(img, nodeId) {
    const dataUrl = thumbnails.get(nodeId);
    if (dataUrl) {
      if (img.src !== dataUrl) {
        img.src = dataUrl;
      }
      img.style.opacity = "1";
    } else {
      img.removeAttribute("src");
      img.style.opacity = "0";
    }
  }
  function maybeRequestThumbnail(item) {
    if (thumbnails.has(item.id) || pendingThumbnails.has(item.id)) {
      return;
    }
    pendingThumbnails.add(item.id);
    log("Requesting thumbnail", { nodeId: item.id });
    parent.postMessage({ pluginMessage: { type: "thumbnail", nodeId: item.id } }, "*");
  }
  function updateEmptyState() {
    if (!registry) {
      emptyState.classList.add("hidden");
      return;
    }
    if (registry.total === 0) {
      emptyState.textContent = "No components found in this file.";
      emptyState.classList.remove("hidden");
      return;
    }
    if (filtered.length === 0) {
      emptyState.textContent = "No results. Try a different search.";
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");
  }
  function truncate(value, maxLength) {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 1).trimEnd()}\u2026`;
  }
  function formatTimestamp(iso) {
    const date = new Date(iso);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }
  function showError(message) {
    logError("Displaying error", message);
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    if (isScanning) {
      isScanning = false;
      rescanButton.disabled = false;
    }
  }
  function hideError() {
    log("Hiding error banner");
    errorBanner.textContent = "";
    errorBanner.classList.add("hidden");
  }
})();
