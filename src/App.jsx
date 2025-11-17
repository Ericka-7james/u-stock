import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardPage from "./components/dashboard/DashboardPage";
import SubredditsPage from "./pages/SubredditsPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/subreddits" element={<SubredditsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
