import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useMessaging } from '../state/MessagingContext';

export default function MobileNav() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { unreadTotal } = useMessaging();

  if (['/login', '/register', '/mod-login'].includes(location.pathname)) return null;

  const active = (path: string) =>
    location.pathname === path || (path !== '/feed' && location.pathname.startsWith(`${path}/`));

  const items: { to: string; icon: string; label: string; badge?: number }[] = [
    { to: '/feed', icon: 'bx-home-alt-2', label: 'Home' },
    { to: '/search', icon: 'bx-search', label: 'Search' },
    { to: '/community', icon: 'bx-video', label: 'Study Rooms' },
    { to: '/messages', icon: 'bx-message-rounded-dots', label: 'Messages', badge: unreadTotal },
    isAuthenticated && user
      ? { to: `/profile/${user.username}`, icon: 'bx-user-circle', label: 'Profile' }
      : { to: '/login', icon: 'bx-log-in-circle', label: 'Profile' },
  ];

  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          className={`mobile-nav-item ${active(item.to) ? 'active' : ''}`}
          aria-current={active(item.to) ? 'page' : undefined}
        >
          <span className="mobile-nav-icon">
            <i className={`bx ${item.icon}`}></i>
            {!!item.badge && <span className="mobile-nav-badge">{item.badge > 9 ? '9+' : item.badge}</span>}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
