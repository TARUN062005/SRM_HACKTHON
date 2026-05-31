import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import axios from "axios";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth/hooks/useAuth";
import "./index.css";

import { registerFCMServiceWorker } from "./lib/push/registerServiceWorker";
registerFCMServiceWorker();

const applyTheme = (themeId) => {
  const html = document.documentElement;
  html.classList.remove("light");
  html.classList.add("dark");
  return themeId;
};

applyTheme("dark");

axios.defaults.withCredentials = true;

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
