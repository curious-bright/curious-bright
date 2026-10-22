import { useEffect, useState } from 'react';
import { useFeed } from '../state/FeedContext';

interface UndoNoticeProps {
  label: string;
  title: string;
  expiresAt: number;
  onUndo: () => Promise<void> | void;
  onDismiss: () => void;
}

/**
 * Shared undo surface used by the feed, study rooms and research documents.
 * It keeps the countdown local so each page can own its own undo buffer.
 */
export function UndoNotice({ label, title, expiresAt, onUndo, onDismiss }: UndoNoticeProps) {
  const [remaining, setRemaining] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <div className="undo-toast-text">
        <i className="bx bx-trash"></i>
        <div>
          <strong>{label}</strong>
          <span className="text-truncate">{title}</span>
        </div>
      </div>
      <div className="undo-toast-actions">
        <span className="undo-countdown">{remaining}s</span>
        <button
          type="button"
          className="undo-btn"
          disabled={working || remaining <= 0}
          onClick={async () => {
            setWorking(true);
            await onUndo();
            setWorking(false);
          }}
        >
          {working ? 'Restoring…' : 'Undo'}
        </button>
        <button type="button" className="undo-dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <i className="bx bx-x"></i>
        </button>
      </div>
    </div>
  );
}

export default function UndoToast() {
  const { pendingUndo, undoDelete, dismissUndo } = useFeed();

  if (!pendingUndo) return null;

  return (
    <UndoNotice
      label="Post deleted"
      title={pendingUndo.post.title}
      expiresAt={pendingUndo.expiresAt}
      onUndo={async () => {
        await undoDelete();
      }}
      onDismiss={dismissUndo}
    />
  );
}
