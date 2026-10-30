// Shared motion vocabulary ported from the web app (framer-motion configs →
// Reanimated). Single easing/spring source so screens feel like one product.

import { Easing, type WithSpringConfig } from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export const springs = {
  pageTurn: { damping: 24, stiffness: 260, mass: 0.8 } satisfies WithSpringConfig,
  peel: { damping: 22, stiffness: 320 } satisfies WithSpringConfig,
  press: { damping: 20, stiffness: 300 } satisfies WithSpringConfig,
  highlighter: { damping: 20, stiffness: 140 } satisfies WithSpringConfig,
  pop: { damping: 12, stiffness: 420 } satisfies WithSpringConfig,
};

// Back-out overshoot approximating web cubic-bezier(.34, 1.56, .64, 1) for
// non-spring timing animations.
export const EASING_BACK_OUT = Easing.out(Easing.back(1.7));

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
