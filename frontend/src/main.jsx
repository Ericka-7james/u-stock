// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx"; // ✅ correct import
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  // Remove StrictMode to prevent dev double-mount abort spam
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>
);