import { Link } from 'react-router-dom';
import { useNotifications, type Notification } from '../state/NotificationContext';
import { useAuth } from '../state/AuthContext';
import { CuriousLoading, CuriousEmpty } from '../components/CuriousStates';
import { HighlighterText } from '../components/HighlighterText';
import { enablePushNotifications, pushSupported } from '../lib/push';

const VERB_ICONS: Record<string, string> = {
  like: 'bx-heart',
  comment: 'bx-message-rounded',
  reply: 'bx-reply',
  mention: 'bx-at',
  follow: 'bx-user-plus',
  helpful: 'bx-like',
  accepted: 'bx-check-circle',
  badge: 'bx-award',
  solved: 'bx-check-double',
  research: 'bx-transfer-alt',
};

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const { notifications, unreadCount, loading, markAllRead } = useNotifications();

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="alert alert-info">
          <span>
            <Link to="/login" style={{ fontWeight: 700 }}>Sign in</Link> to see your notifications.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: '1rem' }}>
        <h2>
          <HighlighterText color="#FF5A36">Notifications{unreadCount ? ` (${unreadCount} new)` : ''}</HighlighterText>
        </h2>
        {unreadCount > 0 && (
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }} onClick={() => void markAllRead()}>
            Mark all read
          </button>
        )}
        {pushSupported() && Notification.permission === 'default' && (
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem' }} onClick={() => void enablePushNotifications()}>
            <i className="bx bx-bell" style={{ marginRight: '0.35rem' }}></i>Enable desktop alerts
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <CuriousLoading message="Loading notifications…" />
      ) : notifications.length === 0 ? (
        <CuriousEmpty
          title="All quiet here"
          description="Likes, replies, mentions, new followers and badge awards will show up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n: Notification) => (
            <div
              key={n.id}
              className="comment-corner-card"
              style={{
                padding: '0.85rem 1rem',
                marginBottom: 0,
                background: n.is_read ? 'var(--color-paper-card)' : '#FDF9EE',
                borderLeft: n.is_read ? undefined : '4px solid var(--color-mustard)',
              }}
            >
              <div className="flex items-start gap-2">
                <i
                  className={`bx ${VERB_ICONS[n.verb] || 'bx-bell'}`}
                  style={{ fontSize: '1.15rem', color: 'var(--color-teal)', marginTop: '0.1rem' }}
                ></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm" style={{ lineHeight: 1.5 }}>
                    {n.text || n.verb}
                  </div>
                  <div className="text-xs text-muted mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {n.post != null && (
                  <Link
                    to={`/post/${n.post}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', textDecoration: 'none', flexShrink: 0 }}
                  >
                    View
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
