interface GenerateFlowsMessage {
  type: 'generate-flows';
  raw: string;
}

interface PluginDoneMessage {
  type: 'done';
  flows: number;
  steps: number;
}

interface PluginErrorMessage {
  type: 'error';
  message: string;
}

type PluginMessage = PluginDoneMessage | PluginErrorMessage;

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('flowsInput') as HTMLTextAreaElement;
  const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLDivElement;

  generateButton.addEventListener('click', () => {
    const raw = textarea.value.trim();
    if (!raw) {
      setStatus(status, 'Paste a flows.json file before generating.', true);
      return;
    }

    setStatus(status, 'Generating flows…');
    generateButton.disabled = true;

    const message: GenerateFlowsMessage = {
      type: 'generate-flows',
      raw,
    };

    parent.postMessage({ pluginMessage: message }, '*');
  });

  window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
    const message = event.data.pluginMessage;
    if (!message) {
      return;
    }

    if (message.type === 'done') {
      setStatus(
        status,
        `Created ${message.flows} flow page${message.flows === 1 ? '' : 's'} with ${message.steps} step frame${
          message.steps === 1 ? '' : 's'
        }.`,
      );
      generateButton.disabled = false;
    }

    if (message.type === 'error') {
      setStatus(status, message.message, true);
      generateButton.disabled = false;
    }
  };
});

function setStatus(element: HTMLDivElement, message: string, isError = false) {
  element.textContent = message;
  element.dataset.variant = isError ? 'error' : 'info';
}
