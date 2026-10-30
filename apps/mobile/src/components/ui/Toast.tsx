// Global toast bus — the API client pushes errors here so screens never have
// to thread alert state. Extended with an optional action slot; with an
// `expiresAt` the toast becomes the ink undo surface (live countdown +
// mustard Undo button), mirroring web UndoToast.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../../theme/tokens';

export type ToastKind = 'info' | 'danger' | 'success';

export interface ToastAction {
  label: string;
  onPress: () => void | Promise<void>;
}

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  title?: string;
  action?: ToastAction;
  expiresAt?: number;
}

type Listener = (toast: Toast) => void;
const listeners = new Set<Listener>();
let counter = 0;

function emit(toast: Omit<Toast, 'id'>) {
  const full: Toast = { id: ++counter, ...toast };
  listeners.forEach((l) => l(full));
}

export const showDanger = (message: string) => emit({ message, kind: 'danger' });
export const showInfo = (message: string) => emit({ message, kind: 'info' });
export const showSuccess = (message: string) => emit({ message, kind: 'success' });

/** Ink undo toast with per-second countdown; auto-dismisses at expiry. */
export function showUndo(opts: { label: string; title: string; expiresAt: number; onUndo: () => void | Promise<void> }) {
  emit({
    message: opts.label,
    title: opts.title,
    kind: 'info',
    expiresAt: opts.expiresAt,
    action: { label: 'Undo', onPress: opts.onUndo },
  });
}

const KIND_COLORS: Record<ToastKind, { bg: string; fg: string }> = {
  info: { bg: '#14141A', fg: '#F7F6F2' },
  danger: { bg: '#FF5A36', fg: '#FFF' },
  success: { bg: '#00A896', fg: '#FFF' },
};

function ToastRow({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const [working, setWorking] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    toast.expiresAt ? Math.max(0, Math.ceil((toast.expiresAt - Date.now()) / 1000)) : null,
  );

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start();

    let hide: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    if (toast.expiresAt) {
      tick = setInterval(() => {
        const left = Math.max(0, Math.ceil((toast.expiresAt! - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) onDone(toast.id);
      }, 1000);
    } else {
      hide = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -12, duration: 180, useNativeDriver: true }),
        ]).start(() => onDone(toast.id));
      }, 3600);
    }
    return () => {
      if (hide) clearTimeout(hide);
      if (tick) clearInterval(tick);
    };
  }, []);

  const colors = KIND_COLORS[toast.kind];
  const isUndo = !!toast.action && !!toast.expiresAt;

  const body = (
    <View style={[styles.row, { backgroundColor: isUndo ? '#14141A' : colors.bg }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.text, { color: isUndo ? '#F7F6F2' : colors.fg }]} numberOfLines={isUndo ? 1 : 2}>
          {isUndo ? toast.title : toast.message}
        </Text>
        {isUndo ? (
          <Text style={styles.undoLabel} numberOfLines={1}>
            {toast.message}
          </Text>
        ) : null}
      </View>
      {toast.action ? (
        <View style={styles.actions}>
          <Text style={styles.countdown}>{remaining ?? 0}s</Text>
          <Pressable
            hitSlop={8}
            disabled={working || (remaining ?? 0) <= 0}
            onPress={async () => {
              setWorking(true);
              await toast.action?.onPress();
              setWorking(false);
              onDone(toast.id);
            }}
            style={styles.undoBtn}
          >
            <Text style={styles.undoBtnText}>{working ? 'Restoring…' : toast.action.label}</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={() => onDone(toast.id)} style={styles.dismiss}>
            <Text style={{ color: '#BDB8A9', fontSize: 16 }}>×</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <Animated.View
      style={{ opacity, transform: [{ translateY }] }}
      pointerEvents={toast.action ? 'auto' : 'box-none'}
    >
      {toast.action ? (
        body
      ) : (
        <Pressable accessibilityRole="alert" onPress={() => onDone(toast.id)}>
          {body}
        </Pressable>
      )}
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const listener: Listener = (toast) => {
      setToasts((current) => [...current.slice(-2), toast]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const remove = (id: number) => setToasts((current) => current.filter((t) => t.id !== id));

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View pointerEvents="box-none" style={[styles.stack, { top: insets.top + 8 }]}>
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDone={remove} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderTopRightRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    fontWeight: '600',
  },
  undoLabel: {
    color: '#BDB8A9',
    fontSize: 11,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countdown: {
    color: '#F4B43D',
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  undoBtn: {
    backgroundColor: '#F4B43D',
    borderRadius: 4,
    borderTopRightRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  undoBtnText: {
    color: '#14141A',
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    fontWeight: '600',
  },
  dismiss: {
    paddingHorizontal: 2,
  },
});
