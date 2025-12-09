// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import DashboardPage from "./components/dashboard/DashboardPage";
import DatasourcesPage from "./components/pages/DatasourcesPage";
import IndexFundsPage from "./components/pages/IndexFundsPage";
import AboutPage from "./components/pages/AboutPage";
import FeebackPage from "./components/pages/FeedbackPage";
import AuthPage from "./components/auth/AuthPage";
import LandingPage from "./components/landing/LandingPage";

import { AuthProvider, useAuth } from "./context/AuthContext";

import "./App.css";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

// "/" – if logged in show dashboard, otherwise landing page
function HomeChooser() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (user) {
    return <DashboardPage />;
  }

  return <LandingPage />;
}

// "/auth" – if logged in, bounce to dashboard
function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <AuthPage />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeChooser />} />
          <Route path="/auth" element={<AuthGate />} />

          <Route
            path="/data-sources"
            element={
              <RequireAuth>
                <DatasourcesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/index-funds"
            element={
              <RequireAuth>
                <IndexFundsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/about"
            element={
              <RequireAuth>
                <AboutPage />
              </RequireAuth>
            }
          />
          <Route
            path="/feedback"
            element={
              <RequireAuth>
                <FeebackPage />
              </RequireAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
