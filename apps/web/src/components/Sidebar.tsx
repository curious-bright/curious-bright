import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import websiteLogo from '../assets/website-logo.svg';
import { useAuth } from '../state/AuthContext';
import { useNotifications } from '../state/NotificationContext';

export default function Sidebar({ isOpen, closeSidebar }: { isOpen?: boolean; closeSidebar?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const { user, isAuthenticated, logout } = useAuth();
  const { unreadCount } = useNotifications();

  const handleLogout = async () => {
    await logout();
    if (closeSidebar) closeSidebar();
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const isActive = (path: string) => location.pathname === path;

  const navLink = (to: string, icon: string, label: string, badge?: number) => (
    <Link
      to={to}
      className={`btn ${isActive(to) ? 'btn-primary' : 'btn-secondary'}`}
      style={{ justifyContent: 'flex-start', padding: '0.6rem 0.85rem' }}
    >
      <i className={icon} style={{ fontSize: '1.15rem' }}></i>
      <span>{label}</span>
      {badge ? (
        <span
          className="badge-tag badge-coral"
          style={{ marginLeft: 'auto', fontSize: '0.62rem', padding: '0.05rem 0.4rem' }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Brand Header — official wordmark */}
      <div className="sidebar-header" style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1.5px solid var(--color-line)' }}>
        <Link to="/feed" style={{ textDecoration: 'none', display: 'block' }}>
          <img
            src={websiteLogo}
            alt="Curious Bright"
            style={{ height: 44, width: 'auto', maxWidth: '100%', display: 'block' }}
          />
        </Link>
      </div>

      {/* Global Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem', position: 'relative' }}>
        <input
          type="text"
          placeholder="Search knowledge, research..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            paddingLeft: '2.2rem',
            fontSize: '0.8125rem',
            background: 'var(--color-paper)',
            borderColor: 'var(--color-line)',
          }}
        />
        <i
          className="bx bx-search"
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0.6,
            fontSize: '1rem',
            color: 'var(--color-ink)',
          }}
        ></i>
      </form>

      {/* Navigation */}
      <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-faded-ink)', marginBottom: '0.25rem' }}>
          Community
        </div>

        {navLink('/feed', 'bx bx-conversation', 'Feed')}
        {navLink('/research', 'bx bx-transfer-alt', 'Research Studio')}
        {navLink('/notifications', 'bx bx-bell', 'Notifications', unreadCount)}
        {isAuthenticated && user ? navLink(`/profile/${user.username}`, 'bx bx-user', 'My Profile') : null}

        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-faded-ink)', marginTop: '1.25rem', marginBottom: '0.25rem' }}>
          Library
        </div>

        {navLink('/browse', 'bx bx-book-open', 'Open Library')}
        {navLink('/submit', 'bx bx-upload', 'Share a Paper')}
        {navLink('/community', 'bx bx-video', 'Study Rooms')}

        <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-faded-ink)', marginTop: '1.25rem', marginBottom: '0.25rem' }}>
          Review Queue
        </div>

        {navLink('/moderate', 'bx bx-shield-quarter', 'Community Review')}
      </nav>

      {/* User Card */}
      <div
        style={{
          marginTop: 'auto',
          padding: '0.85rem',
          background: 'var(--color-paper)',
          border: '1.5px solid var(--color-line)',
          borderRadius: '4px 0px 4px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {isAuthenticated && user ? (
          <>
            <div className="flex items-center gap-2" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '3px 0px 3px 3px',
                  background: 'var(--color-coral)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  flexShrink: 0,
                }}
              >
                {user.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div className="font-semibold text-xs text-truncate" style={{ color: 'var(--color-ink)' }}>
                  {user.username}
                </div>
                <span className="badge-tag badge-teal" style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}>
                  {user.profile?.badge_count ? `${user.profile.badge_count} badges` : 'Member'}
                </span>
              </div>
            </div>
            <button
              onClick={() => void handleLogout()}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
            >
              Log out
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2" style={{ width: '100%' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-faded-ink)', textAlign: 'center' }}>
              Join to teach, learn & collaborate
            </div>
            <div className="flex gap-2">
              <Link to="/login" className="btn btn-secondary" style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}>
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary" style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem' }}>
                Join now
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Legal links */}
      <div className="sidebar-legal-links">
        <Link to="/privacy">Privacy</Link>
        <span style={{ opacity: 0.3 }}>•</span>
        <Link to="/terms">Terms</Link>
        <span style={{ opacity: 0.3 }}>•</span>
        <a href="https://curiousbright.com.ng" target="_blank" rel="noopener noreferrer">Home</a>
      </div>
    </aside>
  );
}
