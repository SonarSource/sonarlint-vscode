/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();
let errorMessageElement;
let emailInput;
let joinBtn;

function showError(message) {
  if (errorMessageElement) {
    errorMessageElement.textContent = message;
    errorMessageElement.style.display = 'block';
  }
}

function hideError() {
  if (errorMessageElement) {
    errorMessageElement.style.display = 'none';
    errorMessageElement.textContent = '';
  }
}

function setLoading(loading) {
  if (joinBtn) {
    const buttonText = joinBtn.querySelector('.button-text');
    if (loading) {
      joinBtn.disabled = true;
      joinBtn.classList.add('loading');
      if (buttonText) {
        buttonText.innerHTML = '<span class="spinner"></span>...';
      }
    } else {
      joinBtn.disabled = false;
      joinBtn.classList.remove('loading');
      if (buttonText) {
        buttonText.innerHTML = 'Join SonarQube for IDE Labs';
      }
    }
  }
}

function init() {
  errorMessageElement = document.getElementById('errorMessage');
  emailInput = document.getElementById('email');
  joinBtn = document.getElementById('joinBtn');

  // Clear error when user starts typing
  if (emailInput) {
    emailInput.addEventListener('input', () => {
      hideError();
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      const email = emailInput ? emailInput.value : '';
      if (email && email.includes('@')) {
        hideError();
        vscode.postMessage({
          command: 'signup',
          email: email
        });
      } else {
        showError('Please enter a valid email address');
      }
    });
  }

  // Links
  const links = {
    preCommitAnalysisLink: 'preCommitAnalysisLink',
    mcpIntegrationLink: 'mcpIntegrationLink',
    dependencyRiskManagementLink: 'dependencyRiskManagementLink',
    termsLink: 'earlyAccessTerms',
    privacyLink: 'privacyNotice'
  };

  for (const [elementId, linkId] of Object.entries(links)) {
    const element = document.getElementById(elementId);
    if (element) {
      element.addEventListener('click', e => {
        e.preventDefault();
        vscode.postMessage({ command: 'openLink', linkId });
      });
    }
  }
}

function handleMessage(event) {
  const message = event.data;
  switch (message.command) {
    case 'signupLoading':
      setLoading(true);
      break;
    case 'signupError':
      setLoading(false);
      showError(message.message);
      break;
    case 'signupSuccess':
      setLoading(false);
      hideError();
      if (emailInput) {
        emailInput.value = '';
      }
      break;
  }
}

window.addEventListener('load', init);
window.addEventListener('message', handleMessage);
