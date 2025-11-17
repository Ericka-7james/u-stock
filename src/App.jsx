// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "./components/dashboard/DashboardPage";
import SubredditsPage from "./pages/SubredditsPage";
import IndexFundsPage from "./pages/IndexFundsPage"; // ← new
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/subreddits" element={<SubredditsPage />} />
        <Route path="/index-funds" element={<IndexFundsPage />} /> {/* new */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
