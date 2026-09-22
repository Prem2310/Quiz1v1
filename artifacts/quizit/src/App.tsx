import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from "framer-motion";
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/layout/AppShell';
import { BrandLoader } from '@/components/brand/BrandLoader';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import AuthCallback from '@/pages/AuthCallback';
import TopicPage from '@/pages/TopicPage';
import Arena from '@/pages/Arena';
import PracticePage from '@/pages/PracticePage';
import DuelMatchmaking from '@/pages/DuelMatchmaking';
import DuelRoom from '@/pages/DuelRoom';
import Leaderboard from '@/pages/Leaderboard';
import Friends from '@/pages/Friends';
import Profile from '@/pages/Profile';
import UserProfile from '@/pages/UserProfile';
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
    return <BrandLoader />;
  }
  return <AppShell>{children}</AppShell>;
}

/**
 * The homepage. Signed in, "/" is the dashboard itself (no redirect, so no flash of the landing page and no URL jump);
 * signed out it is the marketing page. Crawlers are signed out, so the landing page stays what gets indexed.
 */
function Home() {
  const { isReady, isAuthenticated } = useAuth();
  // A saved token means a signed-in visit is very likely, so wait for /me instead of flashing the landing page.
  const maybeSignedIn = localStorage.getItem("access_token") !== null;
  if (!isReady && maybeSignedIn) {
    return <BrandLoader />;
  }
  if (isAuthenticated) {
    return (
      <Protected>
        <Arena />
      </Protected>
    );
  }
  return <Landing />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/topics/:slug">{(params) => <TopicPage slug={params.slug} />}</Route>

        {/* the dashboard used to live here; keep old links and bookmarks working */}
        <Route path="/arena">
          <Redirect to="/" replace />
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
        <Route path="/profile/:username">
          {(params) => (
            <Protected>
              <UserProfile username={params.username} />
            </Protected>
          )}
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
