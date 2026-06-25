import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ChunkLoadErrorBoundary } from "./shared/ChunkLoadErrorBoundary";
import { ToastProvider } from "./shared/toast";
import "./shared/portal-theme.css";
import "./shared/design-system/design-tokens.css";
import "./styles.css";
import "./shared/portal-sidebar-admin.css";
import "./shared/portal-theme-overrides.css";
import "./shared/portal-no-footer.css";
import "./shared/design-system/design-normalize.css";
import "./shared/design-system/student-portal-fonts.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChunkLoadErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ChunkLoadErrorBoundary>
  </React.StrictMode>
);
