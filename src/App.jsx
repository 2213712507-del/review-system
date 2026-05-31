import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import ReviewTable from './pages/ReviewTable';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';

function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading, isAdmin, isApproved } = useAuth();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0', color: '#aaa' }}>加载中...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isApproved) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 24px', maxWidth: 400, margin: '0 auto' }}>
        <h2 style={{ color: '#1a1a1a', fontSize: 20 }}>账号审核中</h2>
        <p style={{ color: '#888', fontSize: 14 }}>
          你的账号正在等待管理员审核，审核通过后即可使用。请稍后再试。
        </p>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/project/:id" element={<ProjectDetail />} />
                    <Route path="/project/:projectId/date/:dateId" element={<ReviewTable />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin-users" element={<AdminUsers />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
