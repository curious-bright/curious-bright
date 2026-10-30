import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AlertHost from './components/AlertHost';
import ErrorBoundary from './components/ErrorBoundary';
import MobileNav from './components/MobileNav';
import UndoToast from './components/UndoToast';
import RightRail from './components/RightRail';
import FloatingCompose from './components/FloatingCompose';
import LiveKitAlert from './components/LiveKitAlert';
import AnalyticsTracker from './components/AnalyticsTracker';
import PolicyConsentGate from './components/PolicyConsentGate';
import { PageTurnContainer } from './components/PageTurnContainer';
import { ErrorProvider } from './state/ErrorContext';
import { AuthProvider, useAuth } from './state/AuthContext';
import { FeedProvider } from './state/FeedContext';
import { NotificationProvider, useNotifications } from './state/NotificationContext';
import { MessagingProvider } from './state/MessagingContext';
import { attachPushClientListeners, ensurePushSubscription } from './lib/push';
import { ThemeProvider, useTheme } from './state/ThemeContext';
import websiteLogo from './assets/website-logo.svg';
import websiteLogoDark from './assets/website-logo-dark.svg';

import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Browse from './pages/Browse';
import Submit from './pages/Submit';
import Moderate from './pages/Moderate';
import ModeratorLogin from './pages/ModeratorLogin';
import ApplyModerator from './pages/ApplyModerator';
import About from './pages/About';
import Community from './pages/Community';
import Search from './pages/Search';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import PaymentVerify from './pages/PaymentVerify';
import GoogleCallback from './pages/GoogleCallback';
import Feed from './pages/Feed';
import PostDetail from './pages/PostDetail';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Research from './pages/Research';
import ResearchDetail from './pages/ResearchDetail';
import JoinOrganization from './pages/JoinOrganization';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';
import { CuriousLoading } from './components/CuriousStates';

// Heavy tools (video/LiveKit and the PDF reader) load only when opened.
const Room = lazy(() => import('./pages/Room'));
const Read = lazy(() => import('./pages/Read'));

function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const { unreadCount } = useNotifications();
  const { resolved: theme } = useTheme();

  return (
    <header className="mobile-header">
      <Link to="/feed" aria-label="Curious Bright home">
        <img src={theme === 'dark' ? websiteLogoDark : websiteLogo} alt="Curious Bright" style={{ height: 34, width: 'auto' }} />
      </Link>
      <div className="mobile-header-actions">
        {isAuthenticated && (
          <Link to="/notifications" className="mobile-icon-button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <i className="bx bx-bell"></i>
            {!!unreadCount && <span className="mobile-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </Link>
        )}
        {isAuthenticated && user ? (
          <Link to={`/profile/${user.username}`} className="mobile-avatar" aria-label="Your profile">
            {user.profile?.avatar ? (
              <img src={user.profile.avatar} alt="" />
            ) : (
              user.username[0]?.toUpperCase()
            )}
          </Link>
        ) : (
          <Link to="/login" className="mobile-signin">Sign in</Link>
        )}
        <button onClick={onOpenMenu} className="mobile-icon-button" aria-label="Open menu">
          <i className="bx bx-menu"></i>
        </button>
      </div>
    </header>
  );
}

function PricingRedirect() {
  useEffect(() => {
    window.location.replace('https://curiousbright.com.ng/pricing');
  }, []);
  return <CuriousLoading message="Opening plans and pricing…" />;
}

function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { load: loadNotifications } = useNotifications();
  useEffect(() => {
    attachPushClientListeners();
  }, []);
  useEffect(() => {
    if (isAuthenticated) void ensurePushSubscription();
  }, [isAuthenticated]);
  useEffect(() => {
    // A push landing while a tab is open refreshes the activity list even if
    // the notification itself was dismissed.
    const onPush = () => void loadNotifications();
    window.addEventListener('curious:push', onPush);
    return () => window.removeEventListener('curious:push', onPush);
  }, [loadNotifications]);
  const showRail =
    ['/feed', '/search', '/browse', '/research', '/community', '/notifications'].includes(location.pathname) ||
    location.pathname.startsWith('/profile/');
  const isAuthScreen = [
    '/login',
    '/register',
    '/mod-login',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ].includes(location.pathname);

  return (
    <>
      <AlertHost />
      <UndoToast />
      <AnalyticsTracker />
      <PolicyConsentGate />
      <ErrorBoundary>
        <div className="app-shell">
          <div
            className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          />
          <Sidebar isOpen={isSidebarOpen} closeSidebar={() => setIsSidebarOpen(false)} />

          <main className={`app-main ${showRail ? 'has-right-rail' : ''}`}>
            <MobileHeader onOpenMenu={() => setIsSidebarOpen(true)} />
            {!isAuthScreen && <LiveKitAlert />}

            <div className="app-columns">
              <div className="app-content">
                <PageTurnContainer>
                  <Suspense fallback={<CuriousLoading message="Opening this workspace…" />}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/feed" replace />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/auth/google/callback" element={<GoogleCallback />} />
                      <Route path="/feed" element={<Feed />} />
                      <Route path="/post/:id" element={<PostDetail />} />
                      <Route path="/profile/:username" element={<Profile />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/research" element={<Research />} />
                      <Route path="/research/:id" element={<ResearchDetail />} />
                      <Route path="/join-organization" element={<JoinOrganization />} />
                      <Route path="/messages" element={<Messages />} />
                      <Route path="/messages/:id" element={<Messages />} />
                      <Route path="/browse" element={<Browse />} />
                      <Route path="/submit" element={<Submit />} />
                      <Route path="/read/:id" element={<Read />} />
                      <Route path="/moderate" element={<Moderate />} />
                      <Route path="/mod-login" element={<ModeratorLogin />} />
                      <Route path="/apply-moderator" element={<ApplyModerator />} />
                      <Route path="/about" element={<About />} />
                      <Route path="/community" element={<Community />} />
                      <Route path="/room/:id" element={<Room />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/terms" element={<TermsOfUse />} />
                      <Route path="/pricing" element={<PricingRedirect />} />
                      <Route path="/pay" element={<PricingRedirect />} />
                      <Route path="/payment/verify" element={<PaymentVerify />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </PageTurnContainer>
              </div>
              {showRail && <RightRail />}
            </div>
          </main>
        </div>
        <FloatingCompose />
        <MobileNav />
      </ErrorBoundary>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ErrorProvider>
        <AuthProvider>
          <MessagingProvider>
            <FeedProvider>
              <NotificationProvider>
                <Router>
                  <AppShell />
                </Router>
              </NotificationProvider>
            </FeedProvider>
          </MessagingProvider>
        </AuthProvider>
      </ErrorProvider>
    </ThemeProvider>
  );
}

export default App;
