import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./lib/auth/hooks/useAuth";
import "./index.css";

import { registerFCMServiceWorker } from "./lib/push/registerServiceWorker";

registerFCMServiceWorker();

const savedTheme = localStorage.getItem("theme") || "dark";
if (
  savedTheme === "dark" ||
  (savedTheme === "system" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
