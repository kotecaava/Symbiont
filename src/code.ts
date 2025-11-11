const UI_WIDTH = 420;
const UI_HEIGHT = 340;

const STEP_WIDTH = 600;
const STEP_HEIGHT = 400;
const HORIZONTAL_GAP = 200;
const VERTICAL_GAP = 200;

const STEP_PLUGIN_DATA_KEY = 'flow_step_id';
const FLOW_PLUGIN_DATA_KEY = 'flow_id';
const STEP_TITLE_PLUGIN_DATA_KEY = 'flow_step_title';
const STEP_PAGE_PLUGIN_DATA_KEY = 'flow_step_page';

const FONT_NAME: FontName = { family: 'Inter', style: 'Regular' };

type Branch = {
  condition: string;
  next: string;
};

type Step = {
  id: string;
  name: string;
  page: string;
  next?: string;
  branches?: Branch[];
};

type Flow = {
  id: string;
  label: string;
  start: string;
  steps: Step[];
};

type PageSpec = {
  id: string;
  label: string;
  breakpoints?: string[];
  layout?: unknown;
  components: unknown[];
};

type FlowsFile = {
  pds_version: string;
  flows: Flow[];
  pages: PageSpec[];
};

type UiToPluginMessage = {
  type: 'generate-flows';
  raw: string;
};

type PluginToUiMessage =
  | { type: 'done'; flows: number; steps: number }
  | { type: 'error'; message: string };

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

let fontLoaded = false;

figma.ui.onmessage = async (msg: UiToPluginMessage) => {
  if (!msg || msg.type !== 'generate-flows') {
    return;
  }

  try {
    await ensureFontLoaded();
    const flowsFile = parseFlowsFile(msg.raw);
    const stats = await buildFlows(flowsFile);
    const successMessage: PluginToUiMessage = {
      type: 'done',
      flows: stats.flows,
      steps: stats.steps,
    };
    figma.ui.postMessage(successMessage);
    figma.notify(`Generated ${stats.flows} flow page${stats.flows === 1 ? '' : 's'}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMessage: PluginToUiMessage = { type: 'error', message };
    figma.ui.postMessage(errorMessage);
    figma.notify(`Failed to generate flows: ${message}`);
    console.error('[flow-visualizer] generation failed', error);
  }
};

async function ensureFontLoaded() {
  if (!fontLoaded) {
    await figma.loadFontAsync(FONT_NAME);
    fontLoaded = true;
  }
}

function parseFlowsFile(raw: string): FlowsFile {
  if (!raw || !raw.trim()) {
    throw new Error('Paste a flows.json file before generating.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON provided. Please check the flows.json content.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('flows.json content is malformed.');
  }

  const value = parsed as Partial<FlowsFile>;
  if (!Array.isArray(value.flows) || value.flows.length === 0) {
    throw new Error('flows.json does not include any flows.');
  }

  if (!Array.isArray(value.pages)) {
    value.pages = [];
  }

  return value as FlowsFile;
}

async function buildFlows(file: FlowsFile): Promise<{ flows: number; steps: number }> {
  let totalSteps = 0;

  for (const flow of file.flows) {
    totalSteps += await buildFlow(flow);
  }

  return { flows: file.flows.length, steps: totalSteps };
}

async function buildFlow(flow: Flow): Promise<number> {
  const pageName = `Flow – ${flow.label}`;
  const page = ensurePage(pageName);
  const stepsById = new Map(flow.steps.map((step) => [step.id, step] as const));

  const existingFrames = collectExistingFrames(page, flow.id);
  const framesById = new Map<string, FrameNode>();
  const usedStepIds = new Set<string>();

  const layout = computeLayout(flow, stepsById);

  for (const step of flow.steps) {
    const frame = ensureStepFrame(page, existingFrames.get(step.id) ?? null, flow, step);
    applyLayout(frame, layout.positions.get(step.id));
    updateStepContent(frame, step);
    framesById.set(step.id, frame);
    usedStepIds.add(step.id);
  }

  removeUnusedFrames(existingFrames, usedStepIds);
  await connectFrames(flow, framesById);

  return flow.steps.length;
}

function collectExistingFrames(page: PageNode, flowId: string): Map<string, FrameNode> {
  const frames = new Map<string, FrameNode>();
  for (const child of page.children) {
    if (child.type !== 'FRAME') {
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

function ensureStepFrame(
  page: PageNode,
  existing: FrameNode | null,
  flow: Flow,
  step: Step,
): FrameNode {
  const frame = existing ?? figma.createFrame();

  frame.name = `${step.id} – ${step.name}`;
  frame.resizeWithoutConstraints(STEP_WIDTH, STEP_HEIGHT);
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  frame.strokes = [{ type: 'SOLID', color: { r: 0.82, g: 0.85, b: 0.89 } }];
  frame.strokeWeight = 2;
  frame.cornerRadius = 16;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.itemSpacing = 16;
  frame.paddingTop = 32;
  frame.paddingBottom = 32;
  frame.paddingLeft = 32;
  frame.paddingRight = 32;
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';

  frame.setPluginData(STEP_PLUGIN_DATA_KEY, step.id);
  frame.setPluginData(FLOW_PLUGIN_DATA_KEY, flow.id);

  if (frame.parent !== page) {
    page.appendChild(frame);
  }

  return frame;
}

function updateStepContent(frame: FrameNode, step: Step) {
  const title = ensureTextNode(frame, STEP_TITLE_PLUGIN_DATA_KEY);
  title.characters = step.name;
  title.fontName = FONT_NAME;
  title.fontSize = 32;
  title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  title.textAutoResize = 'WIDTH_AND_HEIGHT';

  const pageIdText = ensureTextNode(frame, STEP_PAGE_PLUGIN_DATA_KEY);
  pageIdText.characters = `Page ID: ${step.page}`;
  pageIdText.fontName = FONT_NAME;
  pageIdText.fontSize = 18;
  pageIdText.fills = [{ type: 'SOLID', color: { r: 0.34, g: 0.4, b: 0.47 } }];
  pageIdText.textAutoResize = 'WIDTH_AND_HEIGHT';
}

function ensureTextNode(frame: FrameNode, pluginDataKey: string): TextNode {
  const existing = frame.children.find(
    (child): child is TextNode => child.type === 'TEXT' && child.getPluginData(pluginDataKey) === 'true',
  );

  if (existing) {
    return existing;
  }

  const text = figma.createText();
  text.fontName = FONT_NAME;
  text.setPluginData(pluginDataKey, 'true');
  frame.appendChild(text);
  return text;
}

function removeUnusedFrames(existing: Map<string, FrameNode>, usedStepIds: Set<string>) {
  for (const [stepId, frame] of existing) {
    if (!usedStepIds.has(stepId)) {
      frame.remove();
    }
  }
}

type LayoutPosition = {
  column: number;
  row: number;
};

type LayoutResult = {
  positions: Map<string, LayoutPosition>;
};

function computeLayout(flow: Flow, stepsById: Map<string, Step>): LayoutResult {
  const positions = new Map<string, LayoutPosition>();
  const queue: { id: string; column: number; row: number }[] = [];
  const visited = new Set<string>();

  queue.push({ id: flow.start, column: 0, row: 0 });

  const branchRowOffsets = [0, -1, 1, -2, 2, -3, 3];

  while (queue.length > 0) {
    const current = queue.shift()!;
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
        const rowOffset = usableOffsets[index] ?? usableOffsets[usableOffsets.length - 1];
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

function applyLayout(frame: FrameNode, position?: LayoutPosition) {
  const column = position?.column ?? 0;
  const row = position?.row ?? 0;
  const x = column * (STEP_WIDTH + HORIZONTAL_GAP);
  const y = row * (STEP_HEIGHT + VERTICAL_GAP);
  frame.x = x;
  frame.y = y;
}

async function connectFrames(flow: Flow, framesById: Map<string, FrameNode>) {
  for (const step of flow.steps) {
    const sourceFrame = framesById.get(step.id);
    if (!sourceFrame) {
      continue;
    }

    const reactions: Reaction[] = [];

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
}

function createReaction(target: FrameNode, label?: string): Reaction {
  return {
    trigger: { type: 'ON_CLICK' },
    action: {
      type: 'NODE',
      destinationId: target.id,
      navigation: 'NAVIGATE',
      transition: null,
    },
    ...(label ? { label } : {}),
  } as Reaction;
}

function ensurePage(name: string): PageNode {
  const existing = figma.root.children.find(
    (page): page is PageNode => page.type === 'PAGE' && page.name === name,
  );
  if (existing) {
    return existing;
  }
  const page = figma.createPage();
  page.name = name;
  return page;
}
