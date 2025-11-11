"use strict";
var __defProp = Object.defineProperty;
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
var UI_WIDTH = 420;
var UI_HEIGHT = 340;
var STEP_WIDTH = 600;
var STEP_HEIGHT = 400;
var HORIZONTAL_GAP = 200;
var VERTICAL_GAP = 200;
var STEP_PLUGIN_DATA_KEY = "flow_step_id";
var FLOW_PLUGIN_DATA_KEY = "flow_id";
var STEP_TITLE_PLUGIN_DATA_KEY = "flow_step_title";
var STEP_PAGE_PLUGIN_DATA_KEY = "flow_step_page";
var FONT_NAME = { family: "Inter", style: "Regular" };
figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });
var fontLoaded = false;
figma.ui.onmessage = (msg) => __async(exports, null, function* () {
  if (!msg || msg.type !== "generate-flows") {
    return;
  }
  try {
    yield ensureFontLoaded();
    const flowsFile = parseFlowsFile(msg.raw);
    const stats = yield buildFlows(flowsFile);
    const successMessage = {
      type: "done",
      flows: stats.flows,
      steps: stats.steps
    };
    figma.ui.postMessage(successMessage);
    figma.notify(`Generated ${stats.flows} flow page${stats.flows === 1 ? "" : "s"}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMessage = { type: "error", message };
    figma.ui.postMessage(errorMessage);
    figma.notify(`Failed to generate flows: ${message}`);
    console.error("[flow-visualizer] generation failed", error);
  }
});
function ensureFontLoaded() {
  return __async(this, null, function* () {
    if (!fontLoaded) {
      yield figma.loadFontAsync(FONT_NAME);
      fontLoaded = true;
    }
  });
}
function parseFlowsFile(raw) {
  if (!raw || !raw.trim()) {
    throw new Error("Paste a flows.json file before generating.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON provided. Please check the flows.json content.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("flows.json content is malformed.");
  }
  const value = parsed;
  if (!Array.isArray(value.flows) || value.flows.length === 0) {
    throw new Error("flows.json does not include any flows.");
  }
  if (!Array.isArray(value.pages)) {
    value.pages = [];
  }
  return value;
}
function buildFlows(file) {
  return __async(this, null, function* () {
    let totalSteps = 0;
    for (const flow of file.flows) {
      totalSteps += yield buildFlow(flow);
    }
    return { flows: file.flows.length, steps: totalSteps };
  });
}
function buildFlow(flow) {
  return __async(this, null, function* () {
    var _a;
    const pageName = `Flow \u2013 ${flow.label}`;
    const page = ensurePage(pageName);
    const stepsById = new Map(flow.steps.map((step) => [step.id, step]));
    const existingFrames = collectExistingFrames(page, flow.id);
    const framesById = /* @__PURE__ */ new Map();
    const usedStepIds = /* @__PURE__ */ new Set();
    const layout = computeLayout(flow, stepsById);
    for (const step of flow.steps) {
      const frame = ensureStepFrame(page, (_a = existingFrames.get(step.id)) != null ? _a : null, flow, step);
      applyLayout(frame, layout.positions.get(step.id));
      updateStepContent(frame, step);
      framesById.set(step.id, frame);
      usedStepIds.add(step.id);
    }
    removeUnusedFrames(existingFrames, usedStepIds);
    yield connectFrames(flow, framesById);
    return flow.steps.length;
  });
}
function collectExistingFrames(page, flowId) {
  const frames = /* @__PURE__ */ new Map();
  for (const child of page.children) {
    if (child.type !== "FRAME") {
      continue;
    }
    const stepId = child.getPluginData(STEP_PLUGIN_DATA_KEY);
    const recordedFlowId = child.getPluginData(FLOW_PLUGIN_DATA_KEY);
    if (stepId && recordedFlowId === flowId) {
      frames.set(stepId, child);
    }
  }
  return frames;
}
function ensureStepFrame(page, existing, flow, step) {
  const frame = existing != null ? existing : figma.createFrame();
  frame.name = `${step.id} \u2013 ${step.name}`;
  frame.resizeWithoutConstraints(STEP_WIDTH, STEP_HEIGHT);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.strokes = [{ type: "SOLID", color: { r: 0.82, g: 0.85, b: 0.89 } }];
  frame.strokeWeight = 2;
  frame.cornerRadius = 16;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.itemSpacing = 16;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.primaryAxisAlignItems = "MIN";
  frame.counterAxisAlignItems = "MIN";
  frame.setPluginData(STEP_PLUGIN_DATA_KEY, step.id);
  frame.setPluginData(FLOW_PLUGIN_DATA_KEY, flow.id);
  if (frame.parent !== page) {
    page.appendChild(frame);
  }
  return frame;
}
function updateStepContent(frame, step) {
  const title = ensureTextNode(frame, STEP_TITLE_PLUGIN_DATA_KEY);
  title.characters = step.name;
  title.fontName = FONT_NAME;
  title.fontSize = 32;
  title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
  title.textAutoResize = "WIDTH_AND_HEIGHT";
  const pageIdText = ensureTextNode(frame, STEP_PAGE_PLUGIN_DATA_KEY);
  pageIdText.characters = `Page ID: ${step.page}`;
  pageIdText.fontName = FONT_NAME;
  pageIdText.fontSize = 18;
  pageIdText.fills = [{ type: "SOLID", color: { r: 0.34, g: 0.4, b: 0.47 } }];
  pageIdText.textAutoResize = "WIDTH_AND_HEIGHT";
}
function ensureTextNode(frame, pluginDataKey) {
  const existing = frame.children.find(
    (child) => child.type === "TEXT" && child.getPluginData(pluginDataKey) === "true"
  );
  if (existing) {
    return existing;
  }
  const text = figma.createText();
  text.fontName = FONT_NAME;
  text.setPluginData(pluginDataKey, "true");
  frame.appendChild(text);
  return text;
}
function removeUnusedFrames(existing, usedStepIds) {
  for (const [stepId, frame] of existing) {
    if (!usedStepIds.has(stepId)) {
      frame.remove();
    }
  }
}
function computeLayout(flow, stepsById) {
  const positions = /* @__PURE__ */ new Map();
  const queue = [];
  const visited = /* @__PURE__ */ new Set();
  queue.push({ id: flow.start, column: 0, row: 0 });
  const branchRowOffsets = [0, -1, 1, -2, 2, -3, 3];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current.id)) {
      continue;
    }
    visited.add(current.id);
    positions.set(current.id, { column: current.column, row: current.row });
    const step = stepsById.get(current.id);
    if (!step) {
      continue;
    }
    if (step.next) {
      const nextId = step.next;
      if (!positions.has(nextId)) {
        queue.push({ id: nextId, column: current.column + 1, row: current.row });
      }
    }
    if (step.branches && step.branches.length > 0) {
      const usableOffsets = branchRowOffsets.slice(1);
      step.branches.forEach((branch, index) => {
        var _a;
        const rowOffset = (_a = usableOffsets[index]) != null ? _a : usableOffsets[usableOffsets.length - 1];
        const targetRow = current.row + rowOffset;
        if (!positions.has(branch.next)) {
          queue.push({ id: branch.next, column: current.column + 1, row: targetRow });
        }
      });
    }
  }
  for (const step of flow.steps) {
    if (!positions.has(step.id)) {
      positions.set(step.id, { column: flow.steps.indexOf(step), row: 0 });
    }
  }
  return { positions };
}
function applyLayout(frame, position) {
  var _a, _b;
  const column = (_a = position == null ? void 0 : position.column) != null ? _a : 0;
  const row = (_b = position == null ? void 0 : position.row) != null ? _b : 0;
  const x = column * (STEP_WIDTH + HORIZONTAL_GAP);
  const y = row * (STEP_HEIGHT + VERTICAL_GAP);
  frame.x = x;
  frame.y = y;
}
function connectFrames(flow, framesById) {
  return __async(this, null, function* () {
    for (const step of flow.steps) {
      const sourceFrame = framesById.get(step.id);
      if (!sourceFrame) {
        continue;
      }
      const reactions = [];
      if (step.next) {
        const target = framesById.get(step.next);
        if (target) {
          reactions.push(createReaction(target));
        }
      }
      if (step.branches) {
        step.branches.forEach((branch) => {
          const target = framesById.get(branch.next);
          if (target) {
            reactions.push(createReaction(target, branch.condition));
          }
        });
      }
      sourceFrame.reactions = reactions;
    }
  });
}
function createReaction(target, label) {
  return __spreadValues({
    trigger: { type: "ON_CLICK" },
    action: {
      type: "NODE",
      destinationId: target.id,
      navigation: "NAVIGATE",
      transition: null
    }
  }, label ? { label } : {});
}
function ensurePage(name) {
  const existing = figma.root.children.find(
    (page2) => page2.type === "PAGE" && page2.name === name
  );
  if (existing) {
    return existing;
  }
  const page = figma.createPage();
  page.name = name;
  return page;
}
