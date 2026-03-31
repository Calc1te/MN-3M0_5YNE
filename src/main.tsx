import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installDebugMcpEntry } from "./api_caller";
import "./i18n";
import "./index.css";

installDebugMcpEntry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
