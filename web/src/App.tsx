import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { themeConfig } from './theme';
import { AuthProvider, useAuth } from './store/auth';
import { MetaProvider } from './store/meta';
import AppLayout from './layout/AppLayout';
import { allRoutes } from './router/registry';
import LoginPage from './pages/login/LoginPage';
import NotFound from './pages/NotFound';
import './styles/global.css';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" tip="正在加载…" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <MetaProvider>
              <AppLayout />
            </MetaProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        {allRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<Suspense fallback={<Spin style={{ display: 'block', margin: '80px auto' }} />}>{r.element}</Suspense>} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
