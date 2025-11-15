import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider } from './context/AuthProvider';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { ExpensesPage } from './pages/ExpensesPage';
import { ExpenseDetailPage } from './pages/ExpenseDetailPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { MLDashboardPage } from './pages/MLDashboardPage';
import { ConsentSettingsPage } from './pages/ConsentSettingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<RegisterForm />} />
            <Route path="/" element={<Navigate to="/expenses" replace />} />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ExpensesPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ExpenseDetailPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses/:id/edit"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ExpenseDetailPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CategoriesPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/ml-dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <MLDashboardPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/consent-settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ConsentSettingsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProfilePage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SettingsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
