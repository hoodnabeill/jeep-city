import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DigitsProvider, ToastProvider } from "@jc/ui";
import "./app.css";
import "./print/print.css";
import { App } from "./App";
import { SessionProvider } from "./lib";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DigitsProvider>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </DigitsProvider>
  </StrictMode>,
);
