import { Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from './views/Landing';
import { RegisterPage } from './views/RegisterPage';
import { LoginPage } from './views/LoginPage';
import { Dashboard } from './views/Dashboard';
import { RequireAuth } from './components/RequireAuth';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
