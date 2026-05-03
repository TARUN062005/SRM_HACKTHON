import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth/hooks/useAuth";
import "./index.css";

import { registerFCMServiceWorker } from "./lib/push/registerServiceWorker";
registerFCMServiceWorker();

const applyTheme = (themeId) => {
  const html = document.documentElement;
  if (themeId === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.classList.toggle("dark", prefersDark);
    html.classList.toggle("light", !prefersDark);
  } else if (themeId === "light") {
    html.classList.remove("dark");
    html.classList.add("light");
  } else {
    html.classList.remove("light");
    html.classList.add("dark");
  }
};

const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

// Expose globally so Settings can use same function
window.__applyTheme = applyTheme;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
