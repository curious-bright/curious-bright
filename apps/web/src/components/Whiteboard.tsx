import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRealtime } from '../lib/realtime';

interface Stroke {
  id: string;
  user: number;
  username: string;
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  points: number[][];
}

interface Cursor {
  username: string;
  x: number;
  y: number;
  tool: string;
  at: number;
}

interface WhiteboardState {
  room: number;
  strokes: Stroke[];
  version: number;
  can_clear?: boolean;
}

const COLORS = ['#14141A', '#FF5A36', '#00A896', '#F4B43D', '#4C6FE7'];
const WIDTHS = [2, 4, 9];

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = Math.max(12, stroke.width * 3);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
  }

  const points = stroke.points.map(([x, y]) => [(x / 1000) * width, (y / 1000) * height] as const);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  if (points.length === 1) {
    ctx.lineTo(points[0][0] + 0.1, points[0][1]);
  } else {
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index][0], points[index][1]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export default function Whiteboard({
  roomId,
  currentUserId,
  initialCanClear = false,
}: {
  roomId: string | number;
  currentUserId?: number;
  initialCanClear?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const lastDrawSent = useRef(0);
  const lastCursorSent = useRef(0);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Record<string, Stroke>>({});
  const [cursors, setCursors] = useState<Record<number, Cursor>>({});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const [canClear, setCanClear] = useState(initialCanClear);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');

  const upsertStroke = useCallback((incoming: Stroke) => {
    setStrokes((prev) => {
      const index = prev.findIndex((stroke) => stroke.id === incoming.id);
      if (index === -1) return [...prev, incoming];
      const next = prev.slice();
      next[index] = incoming;
      return next;
    });
    setLive((prev) => {
      if (!(incoming.id in prev)) return prev;
      const next = { ...prev };
      delete next[incoming.id];
      return next;
    });
  }, []);

  const { connected, send } = useRealtime(`/ws/rooms/${roomId}/whiteboard/`, ({ event, data }) => {
    if (event === 'whiteboard.state') {
      const state = data as WhiteboardState;
      setStrokes(Array.isArray(state.strokes) ? state.strokes : []);
      setLive({});
      setCanClear(!!state.can_clear);
      setReady(true);
      return;
    }
    if (event === 'whiteboard.stroke') {
      const payload = data as { stroke: Stroke };
      if (payload.stroke) upsertStroke(payload.stroke);
      return;
    }
    if (event === 'whiteboard.draw') {
      const payload = data as { stroke: Stroke };
      if (payload.stroke?.id && payload.stroke.id !== drawingRef.current?.id) {
        setLive((prev) => ({ ...prev, [payload.stroke.id]: payload.stroke }));
      }
      return;
    }
    if (event === 'whiteboard.undo') {
      const payload = data as { id: string };
      setStrokes((prev) => prev.filter((stroke) => stroke.id !== payload.id));
      return;
    }
    if (event === 'whiteboard.cleared') {
      setStrokes([]);
      setLive({});
      return;
    }
    if (event === 'whiteboard.error') {
      setNotice((data as { message?: string }).message || 'The whiteboard rejected that action.');
      window.setTimeout(() => setNotice(''), 4000);
      return;
    }
    if (event === 'whiteboard.cursor') {
      const payload = data as { user: { id: number; username: string }; x: number; y: number; tool: string };
      if (payload.user.id === currentUserId) return;
      setCursors((prev) => ({
        ...prev,
        [payload.user.id]: {
          username: payload.user.username,
          x: payload.x,
          y: payload.y,
          tool: payload.tool,
          at: Date.now(),
        },
      }));
    }
  });

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Drop stale cursors after a few seconds of silence.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, cursor]) => now - cursor.at < 4000),
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    for (const stroke of [...strokes, ...Object.values(live)]) {
      paintStroke(ctx, stroke, size.width, size.height);
    }
  }, [strokes, live, size]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000));
    const y = Math.max(0, Math.min(1000, ((event.clientY - rect.top) / rect.height) * 1000));
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = {
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      user: currentUserId || 0,
      username: 'You',
      color: eraser ? '#F7F6F2' : color,
      width,
      tool: eraser ? 'eraser' : 'pen',
      points: [pointFromEvent(event)],
    };
    drawingRef.current = stroke;
    setLive((prev) => ({ ...prev, [stroke.id]: stroke }));
  };

  const moveDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event);
    const now = Date.now();

    if (now - lastCursorSent.current > 120 && connected) {
      lastCursorSent.current = now;
      send({ type: 'cursor', x: point[0], y: point[1], tool: eraser ? 'eraser' : 'pen' });
    }

    const current = drawingRef.current;
    if (!current) return;
    current.points.push(point);
    setLive((prev) => ({ ...prev, [current.id]: { ...current, points: [...current.points] } }));

    if (now - lastDrawSent.current > 60 && connected) {
      lastDrawSent.current = now;
      send({ type: 'draw', stroke: current });
    }
  };

  const finishDrawing = () => {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (!stroke) return;
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0];
      stroke.points.push([x + 0.5, y + 0.5]);
    }
    if (connected) send({ type: 'stroke', stroke });
    upsertStroke(stroke);
  };

  const clearBoard = () => {
    if (!canClear) return;
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    send({ type: 'clear' });
    setConfirmClear(false);
  };

  return (
    <div className="whiteboard-shell">
      <div className="whiteboard-toolbar">
        <div className="whiteboard-tools">
          {COLORS.map((swatch) => (
            <button
              type="button"
              key={swatch}
              className={`whiteboard-swatch ${!eraser && color === swatch ? 'selected' : ''}`}
              style={{ background: swatch }}
              aria-label={`Use ${swatch} pen`}
              onClick={() => {
                setColor(swatch);
                setEraser(false);
              }}
            />
          ))}
          <span className="whiteboard-divider" />
          {WIDTHS.map((value) => (
            <button
              type="button"
              key={value}
              className={`whiteboard-width ${width === value ? 'selected' : ''}`}
              onClick={() => setWidth(value)}
              aria-label={`Pen width ${value}`}
            >
              <span style={{ width: value + 2, height: value + 2 }} />
            </button>
          ))}
          <button
            type="button"
            className={`whiteboard-tool ${eraser ? 'selected' : ''}`}
            onClick={() => setEraser((value) => !value)}
            aria-pressed={eraser}
            title="Eraser"
          >
            <i className="bx bx-eraser"></i>
          </button>
        </div>

        <div className="whiteboard-actions">
          <span className={`badge-tag ${connected ? 'badge-teal' : 'badge-coral'}`}>
            <i className={`bx ${connected ? 'bx-pulse' : 'bx-wifi-off'}`}></i>
            {connected ? 'Live' : 'Reconnecting'}
          </span>
          <button
            type="button"
            className="btn btn-secondary whiteboard-btn"
            onClick={() => send({ type: 'undo' })}
            disabled={!connected}
            title="Undo your last stroke"
          >
            <i className="bx bx-undo"></i> Undo
          </button>
          {canClear && (
            <button
              type="button"
              className={`btn ${confirmClear ? 'btn-danger' : 'btn-secondary'} whiteboard-btn`}
              onClick={clearBoard}
              disabled={!connected}
            >
              <i className="bx bx-trash"></i> {confirmClear ? 'Confirm clear' : 'Clear'}
            </button>
          )}
        </div>
      </div>

      <div className="whiteboard-canvas-wrap" ref={wrapperRef}>
        <canvas
          ref={canvasRef}
          className="whiteboard-canvas"
          onPointerDown={startDrawing}
          onPointerMove={moveDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          onPointerLeave={() => {
            if (drawingRef.current) finishDrawing();
          }}
        />
        {!ready && <div className="whiteboard-overlay">Loading the shared canvas…</div>}
        {ready && strokes.length === 0 && Object.keys(live).length === 0 && (
          <div className="whiteboard-empty">
            <i className="bx bx-pen"></i>
            <strong>Draw the idea together</strong>
            <span>Everyone in this room sees each stroke instantly.</span>
          </div>
        )}
        {Object.entries(cursors).map(([id, cursor]) => (
          <span
            key={id}
            className="whiteboard-cursor"
            style={{ left: `${cursor.x / 10}%`, top: `${cursor.y / 10}%` }}
          >
            <i className={cursor.tool === 'eraser' ? 'bx bx-eraser' : 'bx bx-pen'}></i>
            {cursor.username}
          </span>
        ))}
        {notice && <div className="whiteboard-notice">{notice}</div>}
      </div>

      <p className="whiteboard-hint">
        <i className="bx bx-info-circle"></i> Strokes are saved to this room. Clearing the board is a host action.
      </p>
    </div>
  );
}
