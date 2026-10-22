import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  eyebrow?: string;
  icon?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Paper-notebook dialog rendered into <body> so it is never clipped by the
 * page-turn transform or a scrolling workspace panel.
 */
export default function Modal({
  title,
  eyebrow,
  icon,
  width = 480,
  onClose,
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
      >
        <div className="modal-head">
          <div className="modal-heading">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h3>
              {icon && <i className={`bx ${icon}`}></i>} {title}
            </h3>
          </div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Close dialog">
            <i className="bx bx-x"></i>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
