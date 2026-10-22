import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useNotifications } from '../state/NotificationContext';

export default function MobileNav() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { unreadCount } = useNotifications();

  if (['/login', '/register', '/mod-login'].includes(location.pathname)) return null;

  const active = (path: string) =>
    location.pathname === path || (path !== '/feed' && location.pathname.startsWith(`${path}/`));

  const items: { to: string; icon: string; label: string; badge?: number }[] = [
    { to: '/feed', icon: 'bx-home-alt-2', label: 'Feed' },
    { to: '/research', icon: 'bx-book-content', label: 'Research' },
    { to: '/community', icon: 'bx-video', label: 'Rooms' },
    { to: '/notifications', icon: 'bx-bell', label: 'Alerts', badge: unreadCount },
    isAuthenticated && user
      ? { to: `/profile/${user.username}`, icon: 'bx-user-circle', label: 'Me' }
      : { to: '/login', icon: 'bx-log-in-circle', label: 'Sign in' },
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
