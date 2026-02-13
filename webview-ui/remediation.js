(function() {
  const vscode = acquireVsCodeApi();

  function attachEventListeners() {
    document.querySelectorAll('.event-item').forEach(item => {
      item.addEventListener('click', () => {
        const eventId = item.getAttribute('data-event-id');
        vscode.postMessage({ command: 'navigateToEvent', eventId });
      });
    });
  }

  // Initial attachment
  attachEventListeners();

  // Listen for content updates
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateContent') {
      const container = document.getElementById('remediation-container');
      if (container && message.html) {
        container.innerHTML = message.html;
        attachEventListeners();
      }
    }
  });
})();
