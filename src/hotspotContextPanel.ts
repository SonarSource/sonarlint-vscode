/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2021 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { HotspotProbability, RemoteHotspot } from './protocol';

function formatProbability(vulnerabilityProbability: HotspotProbability) {
  const probabilityName = HotspotProbability[vulnerabilityProbability];
  return `<span class="hotspot-probability hotspot-probability-${probabilityName}">${probabilityName}</span>`;
}

export function computeHotspotContextPanelContent(hotspot: RemoteHotspot) {

  return `<!doctype html><html>
  <head>
    <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
    <meta http-equiv="Encoding" content="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/>
    <style type="text/css">
      body {
        font-family: var(--vscode-font-family);
        font-size: 13px; line-height: 1.23076923;
      }

      h1 { line-height: 30px }
      h2 { line-height: 24px }
      a { border-bottom: 1px solid rgba(230, 230, 230, .1); color: #236a97; cursor: pointer; outline: none; text-decoration: none; transition: all .2s ease;}
      pre { font-family: var(--vscode-editor-font-family) }

      /* Stolen from SonarQube :) */
      .hotspot-probability {
        color: #fff;
        text-transform: uppercase;
        display: inline-block;
        text-align: center;
        min-width: 48px;
        padding: 0 8px;
        font-weight: 700;
        border-radius: 2px;
      }
      .hotspot-probability-High { background-color: #d4333f }
      .hotspot-probability-Medium { background-color: #ed7d20 }
      .hotspot-probability-Low { background-color: #eabe06 }
    </style>
  </head>
  <body>
    <h1>${hotspot.message}</h1>
    <p>Review priority: ${formatProbability(hotspot.rule.vulnerabilityProbability)}</p>
    <h1>What's the risk?</h1>
    ${hotspot.rule.riskDescription}
    <h1>Are you at risk?</h1>
    ${hotspot.rule.vulnerabilityDescription}
    <h1>How can you fix it?</h1>
    ${hotspot.rule.fixRecommendations}
  </body>
</html>`;
}
