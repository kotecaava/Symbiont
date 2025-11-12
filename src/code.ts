const UI_WIDTH = 440;
const UI_HEIGHT = 520;

const PNG_EXPORT_OPTIONS: ExportSettingsImage = {
  format: 'PNG',
  constraint: { type: 'SCALE', value: 2 },
};

const MAX_CONCURRENT_EXPORTS = 4;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

figma.ui.onmessage = async (msg: UiMessage) => {
  if (!msg) {
    return;
  }

  switch (msg.type) {
    case 'scan': {
      const registry = scanDocument();
      const message: PluginToUiScanResult = {
        type: 'scan-result',
        payload: registry,
      };
      figma.ui.postMessage(message);
      break;
    }

    case 'thumbnail': {
      const dataUrl = await getThumbnail(msg.nodeId);
      const message: PluginToUiThumbnailResult = {
        type: 'thumbnail-result',
        nodeId: msg.nodeId,
        dataUrl,
      };
      figma.ui.postMessage(message);
      break;
    }

    case 'close': {
      figma.closePlugin();
      break;
    }

    default:
      break;
  }
};

figma.ui.postMessage({ type: 'ready' });

// Message types -----------------------------------------------------------------

type UiMessage =
  | { type: 'scan' }
  | { type: 'thumbnail'; nodeId: string }
  | { type: 'close' };

type PluginToUiMessage = PluginToUiScanResult | PluginToUiThumbnailResult | PluginToUiError | PluginToUiReady;

type PluginToUiScanResult = { type: 'scan-result'; payload: Registry };

type PluginToUiThumbnailResult = { type: 'thumbnail-result'; nodeId: string; dataUrl: string | null };

type PluginToUiError = { type: 'error'; message: string };

type PluginToUiReady = { type: 'ready' };

// Registry ----------------------------------------------------------------------

type Registry = {
  fileKey: string | null;
  collectedAt: string;
  total: number;
  items: ComponentItem[];
};

type ComponentItem = {
  id: string;
  key?: string;
  name: string;
  canonical: string;
  description?: string;
  from: 'COMPONENT' | 'VARIANT' | 'COMPONENT_SET';
  variantProps?: Record<string, string>;
  pageName?: string;
};

// Scanning ----------------------------------------------------------------------

function scanDocument(): Registry {
  const items: ComponentItem[] = [];

  for (const page of figma.root.children) {
    if (page.type !== 'PAGE') {
      continue;
    }

    traverseChildren(page, page.name, items);
  }

  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    fileKey: figma.fileKey ?? null,
    collectedAt: new Date().toISOString(),
    total: items.length,
    items,
  };
}

function traverseChildren(parent: ChildrenMixin, pageName: string, items: ComponentItem[]) {
  for (const child of parent.children) {
    processNode(child as SceneNode | ComponentSetNode, pageName, items);
  }
}

function processNode(node: SceneNode | ComponentSetNode, pageName: string, items: ComponentItem[]) {
  if (node.type === 'COMPONENT') {
    items.push(createComponentItem(node, 'COMPONENT', pageName));
  }

  if (node.type === 'COMPONENT_SET') {
    items.push(createComponentSetItem(node, pageName));
    for (const variant of node.children) {
      if (variant.type !== 'COMPONENT') {
        continue;
      }
      items.push(createVariantItem(node, variant, pageName));
    }
  }

  if ('children' in node && node.type !== 'COMPONENT_SET') {
    traverseChildren(node as unknown as ChildrenMixin, pageName, items);
  }
}

function createComponentItem(node: ComponentNode, from: 'COMPONENT', pageName: string): ComponentItem {
  return {
    id: node.id,
    key: node.key ?? undefined,
    name: node.name,
    canonical: canonicalize(node.name),
    description: sanitizeDescription(node.description),
    from,
    pageName,
  };
}

function createComponentSetItem(node: ComponentSetNode, pageName: string): ComponentItem {
  return {
    id: node.id,
    key: node.key ?? undefined,
    name: node.name,
    canonical: canonicalize(node.name),
    description: sanitizeDescription(node.description),
    from: 'COMPONENT_SET',
    pageName,
  };
}

function createVariantItem(set: ComponentSetNode, node: ComponentNode, pageName: string): ComponentItem {
  const variantProps = parseVariantProps(node.name);
  const description = sanitizeDescription(node.description) ?? sanitizeDescription(set.description);

  return {
    id: node.id,
    key: node.key ?? undefined,
    name: node.name,
    canonical: canonicalize(node.name),
    description: description,
    from: 'VARIANT',
    variantProps: variantProps ?? undefined,
    pageName,
  };
}

// Helpers -----------------------------------------------------------------------

function canonicalize(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return trimmed
    .replace(/\s+/g, '-')
    .replace(/\//g, '.')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.');
}

function sanitizeDescription(description?: string): string | undefined {
  if (!description) {
    return undefined;
  }
  const value = description.trim();
  return value.length > 0 ? value : undefined;
}

function parseVariantProps(name: string): Record<string, string> | null {
  const parts = name.split(',');
  const result: Record<string, string> = {};
  let found = false;

  for (const rawPart of parts) {
    const cleaned = rawPart.trim();
    if (!cleaned) {
      continue;
    }

    const equalsIndex = cleaned.indexOf('=');
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

// Thumbnails --------------------------------------------------------------------

const thumbnailCache = new Map<string, string | null>();
const thumbnailPromises = new Map<string, Promise<string | null>>();
const thumbnailQueue: Array<() => Promise<void>> = [];
let activeExports = 0;

async function getThumbnail(nodeId: string): Promise<string | null> {
  if (thumbnailCache.has(nodeId)) {
    return thumbnailCache.get(nodeId) ?? null;
  }

  const existing = thumbnailPromises.get(nodeId);
  if (existing) {
    return existing;
  }

  const promise = new Promise<string | null>((resolve) => {
    thumbnailQueue.push(async () => {
      try {
        const node = figma.getNodeById(nodeId);
        if (!node || !isExportableNode(node)) {
          thumbnailCache.set(nodeId, null);
          resolve(null);
          return;
        }

        const data = await node.exportAsync(PNG_EXPORT_OPTIONS);
        const dataUrl = `data:image/png;base64,${figma.base64Encode(data)}`;
        thumbnailCache.set(nodeId, dataUrl);
        resolve(dataUrl);
      } catch (error) {
        console.error('[component-browser] Thumbnail export failed', error);
        thumbnailCache.set(nodeId, null);
        const message: PluginToUiError = {
          type: 'error',
          message: 'Thumbnail export failed. Please try again.',
        };
        figma.ui.postMessage(message);
        resolve(null);
      }
    });
    processQueue();
  });

  thumbnailPromises.set(nodeId, promise);
  promise.finally(() => {
    thumbnailPromises.delete(nodeId);
  });

  return promise;
}

function processQueue() {
  while (activeExports < MAX_CONCURRENT_EXPORTS && thumbnailQueue.length > 0) {
    const task = thumbnailQueue.shift();
    if (!task) {
      continue;
    }

    activeExports += 1;
    task()
      .catch((error) => {
        console.error('[component-browser] Thumbnail task failed', error);
      })
      .finally(() => {
        activeExports = Math.max(0, activeExports - 1);
        processQueue();
      });
  }
}

function isExportableNode(node: BaseNode): node is ExportMixin {
  return 'exportAsync' in node && typeof (node as ExportMixin).exportAsync === 'function';
}
