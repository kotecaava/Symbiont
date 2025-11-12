interface Registry {
  fileKey: string | null;
  collectedAt: string;
  total: number;
  items: ComponentItem[];
}

interface ComponentItem {
  id: string;
  key?: string;
  name: string;
  canonical: string;
  description?: string;
  from: 'COMPONENT' | 'VARIANT' | 'COMPONENT_SET';
  variantProps?: Record<string, string>;
  pageName?: string;
}

interface AugmentedItem extends ComponentItem {
  searchText: string;
  truncatedDescription: string;
}

interface PluginScanMessage {
  type: 'scan-result';
  payload: Registry;
}

interface PluginThumbnailMessage {
  type: 'thumbnail-result';
  nodeId: string;
  dataUrl: string | null;
}

interface PluginReadyMessage {
  type: 'ready';
}

interface PluginErrorMessage {
  type: 'error';
  message: string;
}

type PluginMessage = PluginScanMessage | PluginThumbnailMessage | PluginReadyMessage | PluginErrorMessage;

const ROW_HEIGHT = 88;
const THUMBNAIL_SIZE = 44;
const SEARCH_DEBOUNCE = 40;

const thumbnails = new Map<string, string | null>();
const pendingThumbnails = new Set<string>();
const rowCache = new Map<string, RowElements>();

let registry: Registry | null = null;
let items: AugmentedItem[] = [];
let filtered: AugmentedItem[] = [];
let searchTerm = '';
let isScanning = false;
let scheduledFrame = 0;

let searchInput: HTMLInputElement;
let rescanButton: HTMLButtonElement;
let metaLine: HTMLDivElement;
let listElement: HTMLDivElement;
let listInner: HTMLDivElement;
let emptyState: HTMLDivElement;
let errorBanner: HTMLDivElement;

let searchDebounceHandle: number | undefined;

interface RowElements {
  container: HTMLButtonElement;
  thumbnailWrapper: HTMLDivElement;
  thumbnail: HTMLImageElement;
  name: HTMLDivElement;
  canonical: HTMLDivElement;
  description: HTMLDivElement;
  tags: HTMLDivElement;
}

document.addEventListener('DOMContentLoaded', () => {
  searchInput = document.getElementById('searchInput') as HTMLInputElement;
  rescanButton = document.getElementById('rescanButton') as HTMLButtonElement;
  metaLine = document.getElementById('metaLine') as HTMLDivElement;
  listElement = document.getElementById('results') as HTMLDivElement;
  listInner = document.getElementById('resultsInner') as HTMLDivElement;
  emptyState = document.getElementById('emptyState') as HTMLDivElement;
  errorBanner = document.getElementById('errorBanner') as HTMLDivElement;

  searchInput.focus();

  searchInput.addEventListener('input', () => {
    if (searchDebounceHandle) {
      window.clearTimeout(searchDebounceHandle);
    }
    const value = searchInput.value;
    searchDebounceHandle = window.setTimeout(() => {
      applySearch(value);
    }, SEARCH_DEBOUNCE);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (searchInput.value) {
        searchInput.value = '';
        applySearch('');
        event.preventDefault();
      }
    }
  });

  rescanButton.addEventListener('click', () => {
    requestScan();
  });

  listElement.addEventListener('scroll', () => {
    if (scheduledFrame) {
      return;
    }
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = 0;
      renderVisibleRows();
    });
  });

  window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
    const message = event.data.pluginMessage;
    if (!message) {
      return;
    }

    handlePluginMessage(message);
  };

  requestScan();
});

function handlePluginMessage(message: PluginMessage) {
  switch (message.type) {
    case 'scan-result':
      onScanResult(message.payload);
      break;
    case 'thumbnail-result':
      onThumbnailResult(message);
      break;
    case 'ready':
      requestScan();
      break;
    case 'error':
      showError(message.message);
      break;
    default:
      break;
  }
}

function onScanResult(payload: Registry) {
  isScanning = false;
  rescanButton.disabled = false;
  hideError();

  rowCache.clear();
  pendingThumbnails.clear();

  registry = payload;
  items = payload.items.map((item) => augmentItem(item));
  filtered = applyFilter(items, searchTerm);

  listElement.scrollTop = 0;
  render();

  const timestamp = formatTimestamp(payload.collectedAt);
  metaLine.textContent = `Scanned ${payload.total} components • ${timestamp}`;
}

function onThumbnailResult(message: PluginThumbnailMessage) {
  pendingThumbnails.delete(message.nodeId);
  thumbnails.set(message.nodeId, message.dataUrl);

  const elements = rowCache.get(message.nodeId);
  if (elements) {
    updateThumbnail(elements.thumbnail, message.nodeId);
  }
}

function augmentItem(item: ComponentItem): AugmentedItem {
  const tokens: string[] = [
    item.name,
    item.canonical,
    item.description ?? '',
    item.pageName ?? '',
    item.from,
  ];

  if (item.variantProps) {
    for (const [key, value] of Object.entries(item.variantProps)) {
      tokens.push(key, value, `${key}:${value}`);
    }
  }

  const searchText = tokens
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    ...item,
    searchText,
    truncatedDescription: truncate(item.description ?? '', 120),
  };
}

function applySearch(value: string) {
  searchTerm = value.trim().toLowerCase();
  filtered = applyFilter(items, searchTerm);
  listElement.scrollTop = 0;
  render();
}

function applyFilter(source: AugmentedItem[], term: string): AugmentedItem[] {
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
    return;
  }
  isScanning = true;
  rescanButton.disabled = true;
  metaLine.textContent = 'Scanning…';
  parent.postMessage({ pluginMessage: { type: 'scan' } }, '*');
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

function ensureRow(item: AugmentedItem): RowElements {
  let existing = rowCache.get(item.id);
  if (!existing) {
    existing = createRow(item);
    rowCache.set(item.id, existing);
  }

  updateRow(existing, item);
  return existing;
}

function createRow(item: AugmentedItem): RowElements {
  const button = document.createElement('button');
  button.className = 'component-row';
  button.type = 'button';
  button.dataset.nodeId = item.id;

  button.addEventListener('click', () => {
    navigator.clipboard.writeText(item.id).catch(() => {
      showError('Unable to copy node id to clipboard.');
    });
  });

  const thumbnailWrapper = document.createElement('div');
  thumbnailWrapper.className = 'component-row__thumb';

  const img = document.createElement('img');
  img.width = THUMBNAIL_SIZE;
  img.height = THUMBNAIL_SIZE;
  img.alt = '';
  img.decoding = 'async';
  thumbnailWrapper.appendChild(img);

  const content = document.createElement('div');
  content.className = 'component-row__content';

  const name = document.createElement('div');
  name.className = 'component-row__name';

  const canonical = document.createElement('div');
  canonical.className = 'component-row__canonical';

  const description = document.createElement('div');
  description.className = 'component-row__description';

  const tags = document.createElement('div');
  tags.className = 'component-row__tags';

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
    tags,
  };
}

function updateRow(elements: RowElements, item: AugmentedItem) {
  elements.container.dataset.nodeId = item.id;
  elements.name.textContent = item.name;
  elements.canonical.textContent = item.canonical;
  elements.description.textContent = item.truncatedDescription;
  updateTags(elements.tags, item);
  updateThumbnail(elements.thumbnail, item.id);
}

function updateTags(container: HTMLDivElement, item: AugmentedItem) {
  container.replaceChildren();

  const from = document.createElement('span');
  from.className = 'tag';
  from.textContent = item.from;
  container.appendChild(from);

  if (item.variantProps) {
    for (const [key, value] of Object.entries(item.variantProps)) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${key}:${value}`;
      container.appendChild(tag);
    }
  }

  if (item.pageName) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `page:${item.pageName}`;
    container.appendChild(tag);
  }
}

function updateThumbnail(img: HTMLImageElement, nodeId: string) {
  const dataUrl = thumbnails.get(nodeId);
  if (dataUrl) {
    if (img.src !== dataUrl) {
      img.src = dataUrl;
    }
    img.style.opacity = '1';
  } else {
    img.removeAttribute('src');
    img.style.opacity = '0';
  }
}

function maybeRequestThumbnail(item: AugmentedItem) {
  if (thumbnails.has(item.id) || pendingThumbnails.has(item.id)) {
    return;
  }
  pendingThumbnails.add(item.id);
  parent.postMessage({ pluginMessage: { type: 'thumbnail', nodeId: item.id } }, '*');
}

function updateEmptyState() {
  if (!registry) {
    emptyState.classList.add('hidden');
    return;
  }

  if (registry.total === 0) {
    emptyState.textContent = 'No components found in this file.';
    emptyState.classList.remove('hidden');
    return;
  }

  if (filtered.length === 0) {
    emptyState.textContent = 'No results. Try a different search.';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function showError(message: string) {
  errorBanner.textContent = message;
  errorBanner.classList.remove('hidden');
  if (isScanning) {
    isScanning = false;
    rescanButton.disabled = false;
  }
}

function hideError() {
  errorBanner.textContent = '';
  errorBanner.classList.add('hidden');
}
