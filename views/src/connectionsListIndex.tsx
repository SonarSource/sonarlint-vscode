import * as React from "react";
import { createRoot } from "react-dom/client";
import ConnectionsList from "./ConnectionsList";

const vscode = acquireVsCodeApi();

createRoot(document.getElementById('root')!).render(<ConnectionsList vscode={vscode}/>)
