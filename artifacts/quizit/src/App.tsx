import { type ReactNode, useEffect } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from "framer-motion";
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/common/StateBlocks';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import TopicPage from '@/pages/TopicPage';
import Arena from '@/pages/Arena';
import PracticePage from '@/pages/PracticePage';
import DuelMatchmaking from '@/pages/DuelMatchmaking';
import DuelRoom from '@/pages/DuelRoom';
import Leaderboard from '@/pages/Leaderboard';
import Friends from '@/pages/Friends';
import Profile from '@/pages/Profile';
import ProgressPage from '@/pages/Progress';
import Settings from '@/pages/Settings';
import { API_BASE_URL } from '@/lib/config';
import { AuthProvider, useAuth } from '@/stores/auth';
import { useRequireAuth } from '@/hooks/useRequireAuth';

setBaseUrl(API_BASE_URL);
setAuthTokenGetter(() => {
  return localStorage.getItem("access_token");
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Protected({ children }: { children: ReactNode }) {
  const { isReady, isAuthenticated } = useRequireAuth();
  if (!isReady || !isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background">
        <LoadingState label="Loading quiz1v1…" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}

function LandingOrRedirect() {
  const { isReady, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (isReady && isAuthenticated) navigate('/arena', { replace: true });
  }, [isReady, isAuthenticated, navigate]);
  if (isReady && isAuthenticated) return null;
  return <Landing />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={LandingOrRedirect} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/topics/:slug">{(params) => <TopicPage slug={params.slug} />}</Route>

        <Route path="/arena">
          <Protected>
            <Arena />
          </Protected>
        </Route>
        <Route path="/practice">
          <Protected>
            <PracticePage />
          </Protected>
        </Route>
        <Route path="/duel/matchmaking">
          <Protected>
            <DuelMatchmaking />
          </Protected>
        </Route>
        <Route path="/duel/:id">
          <Protected>
            <DuelRoom />
          </Protected>
        </Route>
        <Route path="/leaderboard">
          <Protected>
            <Leaderboard />
          </Protected>
        </Route>
        <Route path="/friends">
          <Protected>
            <Friends />
          </Protected>
        </Route>
        <Route path="/profile">
          <Protected>
            <Profile />
          </Protected>
        </Route>
        <Route path="/progress">
          <Protected>
            <ProgressPage />
          </Protected>
        </Route>
        <Route path="/settings">
          <Protected>
            <Settings />
          </Protected>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <MotionConfig reducedMotion="user">
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </MotionConfig>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
