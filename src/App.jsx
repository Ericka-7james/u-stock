// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import DashboardPage from "./components/dashboard/DashboardPage";
import DatasourcesPage from "./components/pages/DatasourcesPage";
import IndexFundsPage from "./components/pages/IndexFundsPage";
import AboutPage from "./components/pages/AboutPage";
import FeebackPage from "./components/pages/FeedbackPage";
import ResumePage from "./components/pages/ResumePage";

import AuthPage from "./components/auth/AuthPage";
import SignupPage from "./components/auth/SignupPage";
import LandingPage from "./components/landing/LandingPage";

import { useAuth } from "./context/AuthContext";

import "./App.css";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!user) {
    // 👇 send them to "/" (HomeChooser decides: dashboard vs landing)
    return <Navigate to="/" replace />;
  }

  return children;
}

// "/" – if logged in show dashboard, otherwise landing page
function HomeChooser() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  return user ? <DashboardPage /> : <LandingPage />;
}

// "/auth" – if logged in, bounce to dashboard
function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  return user ? <Navigate to="/" replace /> : <AuthPage />;
}

// "/auth/signup" – separate gate
function SignupGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  return user ? <Navigate to="/" replace /> : <SignupPage />;
}

function App() {
  return (
    <Routes>
      {/* Root: landing vs dashboard based on auth */}
      <Route path="/" element={<HomeChooser />} />
      <Route path="/resume" element={<ResumePage />} />

      {/* Auth routes */}
      <Route path="/auth" element={<AuthGate />} />
      <Route path="/auth/signup" element={<SignupGate />} />

      {/* Protected routes */}
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
  );
}

export default App;
