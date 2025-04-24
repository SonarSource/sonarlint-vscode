import * as React from "react";
import { createIntl, createIntlCache, RawIntlProvider } from "react-intl";
import { createRoot } from "react-dom/client";
import { EchoesProvider } from "@sonarsource/echoes-react";

import ConnectionsList from "./ConnectionsList";

const cache = createIntlCache()

const intl = createIntl({
  locale: 'en-US',
  messages: {}
}, cache)

const vscode = acquireVsCodeApi();

createRoot(document.getElementById('root')!).render(
    <RawIntlProvider value={intl}>
        <EchoesProvider>
           <ConnectionsList vscode={vscode}/>
        </EchoesProvider>
    </RawIntlProvider>
)
