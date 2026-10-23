import { Link, useLocation } from 'react-router-dom';

export default function FloatingCompose() {
  const location = useLocation();
  if (['/login', '/register', '/mod-login'].includes(location.pathname)) return null;
  if (location.pathname.startsWith('/room/') || location.pathname.startsWith('/messages')) return null;

  return (
    <Link to="/feed?compose=1" className="floating-compose" aria-label="Create a post">
      <i className="bx bx-plus"></i>
      <span>Share</span>
    </Link>
  );
}
