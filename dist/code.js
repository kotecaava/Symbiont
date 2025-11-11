"use strict";

// src/code.ts
var LIBRARY_PAGE_NAME = "System \u2013 Library";
var PARTS_PREFIX = "Parts \u2013 ";
var FLOW_PREFIX = "Flow \u2013 ";
var FONT_NAME = { family: "Inter", style: "Regular" };
var fontLoaded = false;
figma.showUI(__html__, { width: 360, height: 520 });
figma.ui.onmessage = async (msg) => {
  if (msg.type !== "sync") {
    return;
  }
  try {
    await ensureFont();
    await runSync(msg.payload);
    const successMessage = {
      type: "sync-success",
      details: { flows: Object.keys(msg.payload.flows).length }
    };
    figma.ui.postMessage(successMessage);
    figma.notify("PDSA sync complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMessage = { type: "sync-error", error: message };
    figma.ui.postMessage(errorMessage);
    figma.notify("Failed to sync PDSA data");
    console.error("[pdsa-sync] Error during sync", error);
  }
};
async function ensureFont() {
  if (!fontLoaded) {
    await figma.loadFontAsync(FONT_NAME);
    fontLoaded = true;
  }
}
async function runSync(payload) {
  const { pds, flows, designSystem } = payload;
  if (!(pds == null ? void 0 : pds.product)) {
    throw new Error("Invalid PDSA product definition received.");
  }
  await buildSystemLibraryPage(designSystem);
  for (const flowSummary of pds.product.flows) {
    const flowDefinition = flows[flowSummary.id];
    if (!flowDefinition) {
      console.warn(`[pdsa-sync] Missing flow definition for ${flowSummary.id}`);
      continue;
    }
    await buildFlowPage(flowDefinition, designSystem);
  }
}
async function buildSystemLibraryPage(designSystem) {
  var _a, _b, _c;
  const page = findOrCreatePage(LIBRARY_PAGE_NAME);
  removeAllChildren(page);
  const libraryBoard = createFrame("System Library Layout");
  libraryBoard.layoutMode = "VERTICAL";
  libraryBoard.primaryAxisSizingMode = "AUTO";
  libraryBoard.counterAxisSizingMode = "AUTO";
  libraryBoard.itemSpacing = 48;
  libraryBoard.paddingTop = 64;
  libraryBoard.paddingBottom = 64;
  libraryBoard.paddingLeft = 64;
  libraryBoard.paddingRight = 64;
  libraryBoard.name = "Library \u2013 Components";
  page.appendChild(libraryBoard);
  const componentsByCategory = /* @__PURE__ */ new Map();
  for (const [logicalId, entry] of Object.entries(designSystem.components)) {
    const category = formatCategory((_a = entry.category) != null ? _a : "uncategorized");
    const group = (_b = componentsByCategory.get(category)) != null ? _b : [];
    group.push([logicalId, entry]);
    componentsByCategory.set(category, group);
  }
  const sortedCategories = Array.from(componentsByCategory.keys()).sort(
    (a, b) => a.localeCompare(b)
  );
  for (const category of sortedCategories) {
    const sectionFrame = createFrame(`Category \u2013 ${category}`);
    sectionFrame.layoutMode = "VERTICAL";
    sectionFrame.primaryAxisSizingMode = "AUTO";
    sectionFrame.counterAxisSizingMode = "AUTO";
    sectionFrame.itemSpacing = 24;
    sectionFrame.paddingTop = 32;
    sectionFrame.paddingBottom = 32;
    sectionFrame.paddingLeft = 32;
    sectionFrame.paddingRight = 32;
    sectionFrame.fills = [];
    const heading = figma.createText();
    heading.fontName = FONT_NAME;
    heading.characters = category;
    heading.name = `Heading \u2013 ${category}`;
    heading.fontSize = 24;
    heading.fills = [{ type: "SOLID", color: { r: 0.11, g: 0.11, b: 0.11 } }];
    sectionFrame.appendChild(heading);
    const gridFrame = createFrame(`${category} Components`);
    gridFrame.layoutMode = "HORIZONTAL";
    gridFrame.layoutWrap = "WRAP";
    gridFrame.primaryAxisSizingMode = "AUTO";
    gridFrame.counterAxisSizingMode = "AUTO";
    gridFrame.itemSpacing = 24;
    gridFrame.counterAxisSpacing = 24;
    gridFrame.paddingTop = 8;
    gridFrame.paddingBottom = 8;
    gridFrame.paddingLeft = 8;
    gridFrame.paddingRight = 8;
    gridFrame.name = `${category} Component Grid`;
    gridFrame.fills = [];
    const categoryEntries = (_c = componentsByCategory.get(category)) != null ? _c : [];
    for (const [logicalId, entry] of categoryEntries.sort(
      (a, b) => a[0].localeCompare(b[0])
    )) {
      const node = await createComponentInstance(entry.figma_ref, logicalId, entry.category);
      node.name = `${logicalId} \u2013 ${entry.figma_ref}`;
      node.setPluginData("pdsa_component_id", logicalId);
      gridFrame.appendChild(node);
    }
    sectionFrame.appendChild(gridFrame);
    libraryBoard.appendChild(sectionFrame);
  }
  page.selection = [libraryBoard];
}
async function buildFlowPage(flow, designSystem) {
  var _a;
  const page = findOrCreatePage(`${FLOW_PREFIX}${flow.label}`);
  removeAllChildren(page);
  const breakpoints = flow.breakpoints && flow.breakpoints.length > 0 ? flow.breakpoints : Array.from(new Set(flow.screens.map((screen) => screen.breakpoint)));
  const board = createFrame(`Flow \u2013 ${flow.label} \u2013 Screens`);
  board.layoutMode = "HORIZONTAL";
  board.primaryAxisSizingMode = "AUTO";
  board.counterAxisSizingMode = "AUTO";
  board.itemSpacing = 160;
  board.paddingTop = 64;
  board.paddingBottom = 64;
  board.paddingLeft = 64;
  board.paddingRight = 64;
  board.layoutWrap = "NOTHING";
  board.name = `Screens \u2013 ${flow.label}`;
  board.fills = [];
  page.appendChild(board);
  const screenNodeMap = /* @__PURE__ */ new Map();
  const componentNodeMap = /* @__PURE__ */ new Map();
  const uniqueComponentIds = /* @__PURE__ */ new Set();
  for (const breakpoint of breakpoints) {
    const columnFrame = createFrame(`Breakpoint \u2013 ${breakpoint}`);
    columnFrame.layoutMode = "VERTICAL";
    columnFrame.primaryAxisSizingMode = "AUTO";
    columnFrame.counterAxisSizingMode = "AUTO";
    columnFrame.itemSpacing = 48;
    columnFrame.paddingTop = 16;
    columnFrame.paddingBottom = 16;
    columnFrame.paddingLeft = 16;
    columnFrame.paddingRight = 16;
    columnFrame.fills = [];
    columnFrame.name = `Breakpoint \u2013 ${breakpoint}`;
    board.appendChild(columnFrame);
    const screensForBreakpoint = flow.screens.filter(
      (screen) => screen.breakpoint === breakpoint
    );
    for (const screen of screensForBreakpoint) {
      const screenFrame = createFrame(`${screen.name}`);
      screenFrame.layoutMode = "VERTICAL";
      screenFrame.primaryAxisSizingMode = "AUTO";
      screenFrame.counterAxisSizingMode = "AUTO";
      screenFrame.itemSpacing = 24;
      screenFrame.paddingTop = 40;
      screenFrame.paddingBottom = 40;
      screenFrame.paddingLeft = 40;
      screenFrame.paddingRight = 40;
      screenFrame.fills = [
        { type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.97 } }
      ];
      screenFrame.name = `${screen.name} / ${breakpoint}`;
      screenFrame.setPluginData("pdsa_screen_id", screen.id);
      columnFrame.appendChild(screenFrame);
      screenNodeMap.set(screen.id, screenFrame);
      const instancesForScreen = /* @__PURE__ */ new Map();
      const components = (_a = screen.components) != null ? _a : [];
      for (const componentDef of components) {
        const node = await createNodeForComponentInstance(
          componentDef,
          designSystem
        );
        node.setPluginData("pdsa_component_id", componentDef.id);
        node.name = componentDef.label ? `${componentDef.label} (${componentDef.id})` : componentDef.id;
        screenFrame.appendChild(node);
        instancesForScreen.set(componentDef.id, node);
        uniqueComponentIds.add(componentDef.id);
      }
      componentNodeMap.set(screen.id, instancesForScreen);
    }
  }
  await wireInteractions(flow.screens, screenNodeMap, componentNodeMap);
  await buildPartsArea(page, flow, Array.from(uniqueComponentIds), designSystem, board);
  page.selection = [board];
}
async function buildPartsArea(page, flow, componentIds, designSystem, board) {
  const partsFrame = createFrame(`${PARTS_PREFIX}${flow.label}`);
  partsFrame.layoutMode = "HORIZONTAL";
  partsFrame.layoutWrap = "WRAP";
  partsFrame.primaryAxisSizingMode = "AUTO";
  partsFrame.counterAxisSizingMode = "AUTO";
  partsFrame.itemSpacing = 32;
  partsFrame.counterAxisSpacing = 32;
  partsFrame.paddingTop = 48;
  partsFrame.paddingBottom = 48;
  partsFrame.paddingLeft = 48;
  partsFrame.paddingRight = 48;
  partsFrame.name = `${PARTS_PREFIX}${flow.label}`;
  partsFrame.fills = [];
  partsFrame.x = board.x;
  partsFrame.y = board.y + board.height + 320;
  for (const componentId of componentIds.sort()) {
    const entry = designSystem.components[componentId];
    const node = entry ? await createComponentInstance(entry.figma_ref, componentId, entry.category) : await createPlaceholderNode(`Missing mapping for ${componentId}`);
    node.setPluginData("pdsa_component_id", componentId);
    node.name = `Part \u2013 ${componentId}`;
    partsFrame.appendChild(node);
  }
  page.appendChild(partsFrame);
}
async function wireInteractions(screens, screenNodeMap, componentNodeMap) {
  var _a, _b;
  for (const screen of screens) {
    const interactions = (_a = screen.interactions) != null ? _a : [];
    if (interactions.length === 0) {
      continue;
    }
    const componentMap = componentNodeMap.get(screen.id);
    if (!componentMap) {
      continue;
    }
    for (const interaction of interactions) {
      if (interaction.action !== "navigate") {
        continue;
      }
      const fromNode = componentMap.get(interaction.from_component_id);
      const destinationFrame = screenNodeMap.get(interaction.to_screen_id);
      if (!fromNode || !destinationFrame) {
        console.warn("[pdsa-sync] Unable to wire interaction", interaction);
        continue;
      }
      const reactions = (_b = fromNode.reactions) != null ? _b : [];
      const filtered = reactions.filter(
        (reaction) => !(reaction.trigger.type === "ON_CLICK" && reaction.action.type === "NODE")
      );
      fromNode.reactions = [
        ...filtered,
        {
          trigger: { type: "ON_CLICK" },
          action: {
            type: "NODE",
            destinationId: destinationFrame.id
          }
        }
      ];
    }
  }
}
async function createNodeForComponentInstance(componentDef, designSystem) {
  const mapping = designSystem.components[componentDef.id];
  if (!mapping) {
    return createPlaceholderNode(`Unmapped component: ${componentDef.id}`);
  }
  return createComponentInstance(mapping.figma_ref, componentDef.id, mapping.category);
}
async function createComponentInstance(figmaRef, logicalId, category) {
  const componentNode = findComponentNode(figmaRef);
  if (!componentNode) {
    return createPlaceholderNode(`Missing Figma component: ${figmaRef}`);
  }
  let instance;
  if (componentNode.type === "COMPONENT") {
    instance = componentNode.createInstance();
  } else {
    const defaultVariant = componentNode.defaultVariant;
    const baseVariant = defaultVariant != null ? defaultVariant : componentNode.children[0];
    if (!baseVariant) {
      return createPlaceholderNode(`Empty component set: ${figmaRef}`);
    }
    instance = baseVariant.createInstance();
  }
  instance.setPluginData("pdsa_component_id", logicalId);
  if (category) {
    instance.setPluginData("pdsa_category", category);
  }
  return instance;
}
function findComponentNode(figmaRef) {
  return figma.root.findOne((node) => {
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      return node.name === figmaRef;
    }
    return false;
  });
}
async function createPlaceholderNode(message) {
  const frame = createFrame(`Placeholder \u2013 ${message}`);
  frame.resizeWithoutConstraints(240, 120);
  frame.fills = [
    { type: "SOLID", color: { r: 0.98, g: 0.92, b: 0.9 } }
  ];
  frame.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.62, b: 0.38 } }];
  frame.strokeWeight = 2;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingTop = 16;
  frame.paddingBottom = 16;
  frame.paddingLeft = 16;
  frame.paddingRight = 16;
  const text = figma.createText();
  text.fontName = FONT_NAME;
  text.characters = message;
  text.name = "Placeholder Message";
  text.fontSize = 14;
  text.fills = [{ type: "SOLID", color: { r: 0.36, g: 0.15, b: 0.02 } }];
  frame.appendChild(text);
  frame.setPluginData("pdsa_placeholder", "true");
  return frame;
}
function createFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.clipsContent = false;
  frame.cornerRadius = 8;
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.effects = [];
  frame.strokes = [];
  return frame;
}
function findOrCreatePage(name) {
  const existing = figma.root.children.find((page2) => page2.name === name);
  if (existing) {
    return existing;
  }
  const page = figma.createPage();
  page.name = name;
  return page;
}
function removeAllChildren(parent) {
  for (const child of parent.children.slice()) {
    child.remove();
  }
}
function formatCategory(category) {
  return category.split(/[-_\s]+/).filter(Boolean).map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(" ");
}
