// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "./components/dashboard/DashboardPage";
import DatasourcesPage from "./components/pages/DatasourcesPage";
import IndexFundsPage from "./components/pages/IndexFundsPage";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/datasources" element={<DatasourcesPage />} />
        <Route path="/index-funds" element={<IndexFundsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
