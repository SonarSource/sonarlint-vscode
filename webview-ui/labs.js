/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();
let errorMessageElement;
let successMessageElement;
let emailInput;
let joinBtn;
let currentView = 'signup';
let labsFeatures = [];
let isIdeLabsEnabled = false;

const CONFETTI_TO_FEATURES_DELAY = 2000;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
window.addEventListener('message', handleMessage);

function updateLogoForTheme() {
  const logo = document.getElementById('labsLogo');
  if (!logo) {
    return;
  }

  const {lightSrc, darkSrc} = logo.dataset;
  
  // Check if IDE is using a dark theme
  const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                      document.body.classList.contains('vscode-high-contrast');
  
  logo.src = isDarkTheme ? darkSrc : lightSrc;
}

function init() {
  console.log('Labs view initializing...');
  vscode.postMessage({ command: 'ready' });
}

function showSignupView() {
  currentView = 'signup';
  const signupView = document.getElementById('signup-view');
  const featuresView = document.getElementById('features-view');
  
  if (signupView) {
    signupView.style.display = 'block';
  }
  if (featuresView) {
    featuresView.style.display = 'none';
  }
  initSignupView();
}

function showFeaturesView() {
  currentView = 'features';
  const signupView = document.getElementById('signup-view');
  const featuresView = document.getElementById('features-view');
  
  if (signupView) {
    signupView.style.display = 'none';
  }
  if (featuresView) {
    featuresView.style.display = 'block';
  }
  
  initFeaturesView();
}

function initSignupView() {
  errorMessageElement = document.getElementById('errorMessage');
  successMessageElement = document.getElementById('successMessage');
  emailInput = document.getElementById('email');
  joinBtn = document.getElementById('joinBtn');

  updateLogoForTheme();

  // Clear error when user starts typing
  if (emailInput) {
    emailInput.addEventListener('input', () => {
      hideError();
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      const email = emailInput ? emailInput.value : '';
      if (email?.includes('@')) {
        hideError();
        vscode.postMessage({
          command: 'signup',
          email
        });
      } else {
        showError('Please enter a valid email address');
      }
    });
  }

  // Setup help links (Terms, Privacy, Get Help)
  setupHelpLinks();
  
  // Setup learn more links in signup view
  setupLearnMoreLinks();
}

function initFeaturesView() {
  if (labsFeatures.length > 0) {
    renderFeatures(labsFeatures);
  } else {
    console.error('No labs features available');
  }
}

function renderFeatures(features) {
  const grid = document.querySelector('.features-grid');

  if (!grid) {
    console.error('Features grid element not found');
    return;
  }

  grid.innerHTML = features.map((feature, index) => {
    const hasExperimentalTag = feature.tags.includes('experimental');
    const isDisabled = !isIdeLabsEnabled && hasExperimentalTag;
    const disabledClass = isDisabled ? ' feature-card-disabled' : '';
    
    return `
    <div class="feature-card${disabledClass}">
      <div class="feature-image">
        <div class="feature-tags">
          ${feature.tags.map(tag => renderTag(tag)).join('')}
        </div>
        <img src="${escapeHtml(feature.imageUrl)}" 
             alt="${escapeHtml(feature.title)}" />
      </div>
      <div class="feature-content">
        <div class="feature-header">
          <button class="feature-toggle" aria-expanded="false" aria-controls="feature-details-${index}">
            <span class="toggle-icon">›</span>
            <h3 class="feature-title">${escapeHtml(feature.title)}</h3>
          </button>
          <a href="#" class="feedback-button" data-element-type="feedback-link" data-feature-id="${escapeHtml(feature.id)}">
            Feedback
          </a>
        </div>
        <div class="feature-details" id="feature-details-${index}" hidden>
          <p class="feature-description">${escapeHtml(feature.description)}</p>
          <a href="#" class="learn-more-link" data-element-type="learn-more-link" data-feature-id="${escapeHtml(feature.id)}">
            Learn More
          </a>
        </div>
      </div>
    </div>
  `;
  }).join('');
  
  setupFeatureToggles();
  setupLearnMoreLinks();
  setupFeedbackLinks();
  setupHelpLinks();
}

function renderTag(tag) {
  const tagLabels = {
    'stable': 'Stable',
    'experimental': 'Experimental',
    'connected-mode': 'Connected Mode',
    'new': 'New'
  };

  const tagTooltips = {
    'stable': 'This feature is live for all users. We welcome your feedback to help improve it.',
    'experimental': 'Exclusive Labs feature. May be unstable as we test and refine functionality.',
    'connected-mode': 'This feature requires Connected Mode to be enabled.',
    'new': 'This feature is available to all users. We are actively iterating on this feature, expect some changes.'
  }

  const label = tagLabels[tag] || tag;
  const tooltip = tagTooltips[tag] || '';
  return `<span class="feature-tag feature-tag-${escapeHtml(tag)}" title="${escapeHtml(tooltip)}">${escapeHtml(label)}</span>`;
}

function escapeHtml(str) {
  if (typeof str !== 'string') {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setupFeatureToggles() {
  const toggleButtons = document.querySelectorAll('.feature-toggle');
  
  for (const button of toggleButtons) {
    button.addEventListener('click', () => {
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      const detailsId = button.getAttribute('aria-controls');
      const detailsElement = document.getElementById(detailsId);
      
      if (detailsElement) {
        button.setAttribute('aria-expanded', !isExpanded);
        detailsElement.hidden = isExpanded;
        button.classList.toggle('expanded', !isExpanded);
      }
    });
  }
}

function setupLearnMoreLinks() {
  const learnMoreLinks = document.querySelectorAll('[data-element-type="learn-more-link"]');
  for (const link of learnMoreLinks) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({ 
        command: 'openLearnMoreLink', 
        featureId: link.dataset.featureId
      });
    });
  }
}

function setupFeedbackLinks() {
  const feedbackLinks = document.querySelectorAll('[data-element-type="feedback-link"]');
  for (const link of feedbackLinks) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({ 
        command: 'openFeedbackLink', 
        featureId: link.dataset.featureId
      });
    });
  }
}

function setupHelpLinks() {
  const helpLinks = document.querySelectorAll('[data-element-type="help-link"]');
  for (const link of helpLinks) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({ 
        command: 'openHelpLink', 
        linkId: link.dataset.linkId
      });
    });
  }
}

// Signup form helpers
function showError(message) {
  if (errorMessageElement) {
    errorMessageElement.textContent = message;
    errorMessageElement.style.display = 'block';
  }
}

function showSuccess(message) {
  if (successMessageElement) {
    successMessageElement.textContent = message;
    successMessageElement.style.display = 'block';
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
        buttonText.innerHTML = '<span class="spinner"></span>';
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

function handleMessage(event) {
  const message = event.data;
  switch (message.command) {
    case 'initialState':
      labsFeatures = message.features || [];
      isIdeLabsEnabled = message.isIdeLabsEnabled || false;
      if (message.isSignedUp) {
        showFeaturesView();
      } else {
        showSignupView();
      }
      break;
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
      if (typeof triggerConfettiAnimation === 'function') {
        triggerConfettiAnimation();
      }
      showSuccess('Successfully joined SonarQube for IDE Labs!');
      setTimeout(() => {
        isIdeLabsEnabled = true;
        showFeaturesView();
      }, CONFETTI_TO_FEATURES_DELAY);
      break;
    case 'ideLabsEnabled':
      isIdeLabsEnabled = true;
      if (currentView === 'features' && labsFeatures.length > 0) {
        renderFeatures(labsFeatures);
      }
      break;
    case 'ideLabsDisabled':
      isIdeLabsEnabled = false;
      if (currentView === 'features' && labsFeatures.length > 0) {
        renderFeatures(labsFeatures);
      }
      break;
    case 'themeChanged':
      updateLogoForTheme();
      break;
  }
}
