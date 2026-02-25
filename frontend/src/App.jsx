// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import AuthRedirector from "./context/AuthRedirector";

import DashboardPage from "./components/dashboard/DashboardPage";
import DatasourcesPage from "./components/pages/DatasourcesPage";
import IndexFundsPage from "./components/pages/IndexFundsPage";
import AboutPage from "./components/pages/AboutPage";
import FeedbackPage from "./components/pages/FeedbackPage";

import AuthPage from "./components/auth/AuthPage";
import SignupPage from "./components/auth/SignupPage";
import LandingPage from "./components/landing/LandingPage";

import { useAuth } from "./context/authContextBase.js";
import ConnectedAppsPage from "./components/apps/ConnectedAppsPage";

import FullPageLoader from "./components/common/FullPageLoader";

import "./css/App.css";

import f1 from "./assets/loading/LoadingScreen1.png";
import f2 from "./assets/loading/LoadingScreen2.png";
import f3 from "./assets/loading/LoadingScreen3.png";

[f1, f2, f3].forEach((src) => {
  const img = new Image();
  img.src = src;
});

function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader label="Loading…" />;
  if (!user) return <Navigate to="/" replace />;

  return children;
}

function HomeChooser() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader label="Loading…" />;
  return user ? <DashboardPage /> : <LandingPage />;
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader label="Loading…" />;
  return user ? <Navigate to="/" replace /> : <AuthPage />;
}

function SignupGate() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageLoader label="Loading…" />;
  return user ? <Navigate to="/" replace /> : <SignupPage />;
}

function App() {
  return (
    <div className="app-shell">
      <AuthRedirector />

      <Routes>
        <Route path="/" element={<HomeChooser />} />

        {/* Public pages */}
        <Route path="/about" element={<AboutPage />} />
        <Route path="/feedback" element={<FeedbackPage />}/>

        <Route path="/auth" element={<AuthGate />} />
        <Route path="/auth/signup" element={<SignupGate />} />

        {/* Protected pages */}
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
          path="/connected-apps"
          element={
            <RequireAuth>
              <ConnectedAppsPage />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
