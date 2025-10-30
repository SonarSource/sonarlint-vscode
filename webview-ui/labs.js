/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

window.addEventListener('load', init);

function init() {
  const dataElement = document.getElementById('labs-features-data');
  if (!dataElement) {
    console.error('No features data element found');
    return;
  }

  try {
    const features = JSON.parse(dataElement.textContent);
    renderFeatures(features);
  } catch (error) {
    console.error('Failed to parse features data:', error);
  }
}

function renderFeatures(features) {
  const grid = document.querySelector('.features-grid');

  if (!grid) {
    console.error('Features grid element not found');
    return;
  }

  grid.innerHTML = features.map(feature => `
    <div class="feature-card">
      <div class="feature-image">
        <div class="feature-tags">
          ${feature.tags.map(tag => renderTag(tag)).join('')}
        </div>
        <img src="${escapeHtml(feature.imageUrl)}" alt="${escapeHtml(feature.title)}" />
      </div>
      <div class="feature-content">
        <h3 class="feature-title">${escapeHtml(feature.title)}</h3>
        <p class="feature-description">${escapeHtml(feature.description)}</p>
        <div class="feature-actions">
          <a href="${escapeHtml(feature.learnMoreUrl)}" target="_blank" class="learn-more-link">
            Learn More
          </a>
          <a href="${escapeHtml(feature.feedbackUrl)}" target="_blank" class="feedback-button">
            Give Feedback
          </a>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTag(tag) {
  const tagLabels = {
    'feedback': 'Feedback',
    'experimental': 'Experimental',
    'connected-mode': 'Connected Mode'
  };

  const tagTooltips = {
    'feedback': 'This feature is available to all users. We welcome your feedback to help improve it.',
    'experimental': 'Exclusive Labs feature. May be unstable as we test and refine functionality.',
    'connected-mode': 'This feature requires Connected Mode to be enabled.'
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

