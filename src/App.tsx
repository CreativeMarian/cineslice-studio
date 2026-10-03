import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toast, Spinner } from './components/ui';
import { RequireAuth } from './components/RequireAuth';
import { ProjectLayout } from './components/ProjectLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandPalette } from './components/ui/CommandPalette';
import { MouseGlow } from './components/ui/MouseGlow';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { NotFound } from './components/NotFound';
import { LandingPage } from './components/LandingPage/LandingPage';

// 路由懒加载
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ModelConfigPage = lazy(() => import('./components/ModelConfig/ModelConfigPage').then(m => ({ default: m.ModelConfigPage })));

// 五段管线占位页
const StageOutline = lazy(() => import('./components/StageOutline/StageOutline').then(m => ({ default: m.StageOutline })));
const StageCharacters = lazy(() => import('./components/StageCharacters/StageCharacters').then(m => ({ default: m.StageCharacters })));
const CharacterDetailPage = lazy(() => import('./components/StageCharacters/CharacterDetailPage').then(m => ({ default: m.CharacterDetailPage })));
const StageArt = lazy(() => import('./components/StageArt/StageArt').then(m => ({ default: m.StageArt })));
const SceneDetailPage = lazy(() => import('./components/StageArt/SceneDetailPage').then(m => ({ default: m.SceneDetailPage })));
const PropDetailPage = lazy(() => import('./components/StageArt/PropDetailPage').then(m => ({ default: m.PropDetailPage })));
const StageScriptPage = lazy(() => import('./components/StageScript/StageScriptPage').then(m => ({ default: m.StageScriptPage })));
const StageDirectorPage = lazy(() => import('./components/StageDirector/StageDirectorPage').then(m => ({ default: m.StageDirectorPage })));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
          <MouseGlow />
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
              <Route path="/models" element={<LazyRoute><ModelConfigPage /></LazyRoute>} />
              <Route path="/settings" element={<LazyRoute><SettingsPage /></LazyRoute>} />

              {/* 项目工作台 · 五段管线 */}
              <Route path="/project/:id" element={<ProjectLayout />}>
                <Route index element={<LazyRoute><StageOutline /></LazyRoute>} />
                <Route path="characters" element={<LazyRoute><StageCharacters /></LazyRoute>} />
                <Route path="character/:characterId" element={<LazyRoute><CharacterDetailPage /></LazyRoute>} />
                <Route path="art" element={<LazyRoute><StageArt /></LazyRoute>} />
                <Route path="art/scene/:sceneId" element={<LazyRoute><SceneDetailPage /></LazyRoute>} />
                <Route path="art/prop/:propId" element={<LazyRoute><PropDetailPage /></LazyRoute>} />
                <Route path="script" element={<LazyRoute><StageScriptPage /></LazyRoute>} />
                <Route path="director" element={<LazyRoute><StageDirectorPage /></LazyRoute>} />
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
