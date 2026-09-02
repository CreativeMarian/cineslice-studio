import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toast, Spinner } from './components/ui';
import { RequireAuth } from './components/RequireAuth';
import { ProjectLayout } from './components/ProjectLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/ui/CommandPalette';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { NotFound } from './components/NotFound';
import { LandingPage } from './components/LandingPage/LandingPage';
import ParticleBackground from './components/ui/ParticleBackground';
import { useGlobalClickParticles } from './hooks/useClickParticles';
import { useEffect } from 'react';

// 路由懒加载
const Onboarding = lazy(() => import('./components/Onboarding/Onboarding').then(m => ({ default: m.Onboarding })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ModelConfigPage = lazy(() => import('./components/ModelConfig/ModelConfigPage').then(m => ({ default: m.ModelConfigPage })));
const StageScript = lazy(() => import('./components/StageScript/StageScript').then(m => ({ default: m.StageScript })));
const StageAssets = lazy(() => import('./components/StageAssets/StageAssets').then(m => ({ default: m.StageAssets })));
const StageDirector = lazy(() => import('./components/StageDirector/StageDirector').then(m => ({ default: m.StageDirector })));
const StageExport = lazy(() => import('./components/StageExport/StageExport').then(m => ({ default: m.StageExport })));
const MindMapPage = lazy(() => import('./components/MindMap/MindMapPage').then(m => ({ default: m.MindMapPage })));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>}>{children}</Suspense>;
}

export default function App() {
  const { init: initGlobalClickParticles } = useGlobalClickParticles({
    count: 8,
    color: '#F97316',
    duration: 500,
    spread: 60,
  });

  useEffect(() => {
    const cleanup = initGlobalClickParticles();
    return cleanup;
  }, [initGlobalClickParticles]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
          <ParticleBackground
            particleCount={50}
            color="#F97316"
            speed={0.2}
            connectDistance={120}
          />
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<Login />} />
            <Route path="/landing" element={<LandingPage />} />

            {/* 需认证路由 */}
            <Route
              element={
                <RequireAuth>
                  <Outlet />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/onboarding" element={<LazyRoute><Onboarding /></LazyRoute>} />
              <Route path="/models" element={<LazyRoute><ModelConfigPage /></LazyRoute>} />
              <Route path="/mindmap" element={<LazyRoute><MindMapPage /></LazyRoute>} />
              <Route path="/settings" element={<LazyRoute><SettingsPage /></LazyRoute>} />

              {/* 项目工作台 */}
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<Navigate to="script" replace />} />
                <Route path="script" element={<LazyRoute><StageScript /></LazyRoute>} />
                <Route path="assets" element={<LazyRoute><StageAssets /></LazyRoute>} />
                <Route path="director" element={<LazyRoute><StageDirector /></LazyRoute>} />
                <Route path="export" element={<LazyRoute><StageExport /></LazyRoute>} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          <CommandPalette />
          <Toast />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
