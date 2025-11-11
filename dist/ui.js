"use strict";
(() => {
  // src/ui.ts
  document.addEventListener("DOMContentLoaded", () => {
    const textarea = document.getElementById("flowsInput");
    const generateButton = document.getElementById("generateButton");
    const status = document.getElementById("status");
    generateButton.addEventListener("click", () => {
      const raw = textarea.value.trim();
      if (!raw) {
        setStatus(status, "Paste a flows.json file before generating.", true);
        return;
      }
      setStatus(status, "Generating flows\u2026");
      generateButton.disabled = true;
      const message = {
        type: "generate-flows",
        raw
      };
      parent.postMessage({ pluginMessage: message }, "*");
    });
    window.onmessage = (event) => {
      const message = event.data.pluginMessage;
      if (!message) {
        return;
      }
      if (message.type === "done") {
        setStatus(
          status,
          `Created ${message.flows} flow page${message.flows === 1 ? "" : "s"} with ${message.steps} step frame${message.steps === 1 ? "" : "s"}.`
        );
        generateButton.disabled = false;
      }
      if (message.type === "error") {
        setStatus(status, message.message, true);
        generateButton.disabled = false;
      }
    };
  });
  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.dataset.variant = isError ? "error" : "info";
  }
})();
