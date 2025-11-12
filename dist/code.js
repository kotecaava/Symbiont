"use strict";
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/code.ts
var UI_WIDTH = 440;
var UI_HEIGHT = 520;
var PNG_EXPORT_OPTIONS = {
  format: "PNG",
  constraint: { type: "SCALE", value: 2 }
};
var MAX_CONCURRENT_EXPORTS = 4;
figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });
figma.ui.onmessage = (msg) => __async(exports, null, function* () {
  if (!msg) {
    return;
  }
  switch (msg.type) {
    case "scan": {
      const registry = scanDocument();
      const message = {
        type: "scan-result",
        payload: registry
      };
      figma.ui.postMessage(message);
      break;
    }
    case "thumbnail": {
      const dataUrl = yield getThumbnail(msg.nodeId);
      const message = {
        type: "thumbnail-result",
        nodeId: msg.nodeId,
        dataUrl
      };
      figma.ui.postMessage(message);
      break;
    }
    case "close": {
      figma.closePlugin();
      break;
    }
    default:
      break;
  }
});
figma.ui.postMessage({ type: "ready" });
function scanDocument() {
  var _a;
  const items = [];
  for (const page of figma.root.children) {
    if (page.type !== "PAGE") {
      continue;
    }
    traverseChildren(page, page.name, items);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
  return {
    fileKey: (_a = figma.fileKey) != null ? _a : null,
    collectedAt: (/* @__PURE__ */ new Date()).toISOString(),
    total: items.length,
    items
  };
}
function traverseChildren(parent, pageName, items) {
  for (const child of parent.children) {
    processNode(child, pageName, items);
  }
}
function processNode(node, pageName, items) {
  if (node.type === "COMPONENT") {
    items.push(createComponentItem(node, "COMPONENT", pageName));
  }
  if (node.type === "COMPONENT_SET") {
    items.push(createComponentSetItem(node, pageName));
    for (const variant of node.children) {
      if (variant.type !== "COMPONENT") {
        continue;
      }
      items.push(createVariantItem(node, variant, pageName));
    }
  }
  if ("children" in node && node.type !== "COMPONENT_SET") {
    traverseChildren(node, pageName, items);
  }
}
function createComponentItem(node, from, pageName) {
  var _a;
  return {
    id: node.id,
    key: (_a = node.key) != null ? _a : void 0,
    name: node.name,
    canonical: canonicalize(node.name),
    description: sanitizeDescription(node.description),
    from,
    pageName
  };
}
function createComponentSetItem(node, pageName) {
  var _a;
  return {
    id: node.id,
    key: (_a = node.key) != null ? _a : void 0,
    name: node.name,
    canonical: canonicalize(node.name),
    description: sanitizeDescription(node.description),
    from: "COMPONENT_SET",
    pageName
  };
}
function createVariantItem(set, node, pageName) {
  var _a, _b;
  const variantProps = parseVariantProps(node.name);
  const description = (_a = sanitizeDescription(node.description)) != null ? _a : sanitizeDescription(set.description);
  return {
    id: node.id,
    key: (_b = node.key) != null ? _b : void 0,
    name: node.name,
    canonical: canonicalize(node.name),
    description,
    from: "VARIANT",
    variantProps: variantProps != null ? variantProps : void 0,
    pageName
  };
}
function canonicalize(name) {
  const trimmed = name.trim().toLowerCase();
  return trimmed.replace(/\s+/g, "-").replace(/\//g, ".").replace(/_+/g, "_").replace(/-+/g, "-").replace(/\.+/g, ".");
}
function sanitizeDescription(description) {
  if (!description) {
    return void 0;
  }
  const value = description.trim();
  return value.length > 0 ? value : void 0;
}
function parseVariantProps(name) {
  const parts = name.split(",");
  const result = {};
  let found = false;
  for (const rawPart of parts) {
    const cleaned = rawPart.trim();
    if (!cleaned) {
      continue;
    }
    const equalsIndex = cleaned.indexOf("=");
    if (equalsIndex === -1) {
      return null;
    }
    const key = cleaned.slice(0, equalsIndex).trim();
    const value = cleaned.slice(equalsIndex + 1).trim();
    if (!key || !value) {
      return null;
    }
    result[key] = value;
    found = true;
  }
  return found ? result : null;
}
var thumbnailCache = /* @__PURE__ */ new Map();
var thumbnailPromises = /* @__PURE__ */ new Map();
var thumbnailQueue = [];
var activeExports = 0;
function getThumbnail(nodeId) {
  return __async(this, null, function* () {
    var _a;
    if (thumbnailCache.has(nodeId)) {
      return (_a = thumbnailCache.get(nodeId)) != null ? _a : null;
    }
    const existing = thumbnailPromises.get(nodeId);
    if (existing) {
      return existing;
    }
    const promise = new Promise((resolve) => {
      thumbnailQueue.push(() => __async(this, null, function* () {
        try {
          const node = figma.getNodeById(nodeId);
          if (!node || !isExportableNode(node)) {
            thumbnailCache.set(nodeId, null);
            resolve(null);
            return;
          }
          const data = yield node.exportAsync(PNG_EXPORT_OPTIONS);
          const dataUrl = `data:image/png;base64,${figma.base64Encode(data)}`;
          thumbnailCache.set(nodeId, dataUrl);
          resolve(dataUrl);
        } catch (error) {
          console.error("[component-browser] Thumbnail export failed", error);
          thumbnailCache.set(nodeId, null);
          const message = {
            type: "error",
            message: "Thumbnail export failed. Please try again."
          };
          figma.ui.postMessage(message);
          resolve(null);
        }
      }));
      processQueue();
    });
    thumbnailPromises.set(nodeId, promise);
    promise.finally(() => {
      thumbnailPromises.delete(nodeId);
    });
    return promise;
  });
}
function processQueue() {
  while (activeExports < MAX_CONCURRENT_EXPORTS && thumbnailQueue.length > 0) {
    const task = thumbnailQueue.shift();
    if (!task) {
      continue;
    }
    activeExports += 1;
    task().catch((error) => {
      console.error("[component-browser] Thumbnail task failed", error);
    }).finally(() => {
      activeExports = Math.max(0, activeExports - 1);
      processQueue();
    });
  }
}
function isExportableNode(node) {
  return "exportAsync" in node && typeof node.exportAsync === "function";
}
