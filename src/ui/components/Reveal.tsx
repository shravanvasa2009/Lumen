import { type ReactNode, useContext, useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  enterTransition,
  exitTransition,
  glideConfig,
  motion,
  settleTransition,
  StillMotion,
  useReduceMotion,
} from '@/ui/theme/motion';

type RevealProps = {
  children: ReactNode;
  // Stagger index among sections appearing together.
  index?: number;
  // Animates neighbours' layout. One small item at a time; long lists drop frames on budget phones.
  settle?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Under StillMotion (the capture screen) these render as plain views.
function useStill() {
  const reduceMotion = useReduceMotion();
  return { reduceMotion, still: useContext(StillMotion) };
}

export function Reveal({ children, index = 0, settle = false, style }: RevealProps) {
  const { reduceMotion, still } = useStill();
  return (
    <Animated.View
      entering={still ? undefined : enterTransition(reduceMotion, index)}
      exiting={still ? undefined : exitTransition(reduceMotion)}
      layout={still || !settle ? undefined : settleTransition(reduceMotion)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

export function Settle({ children, style }: Pick<RevealProps, 'children' | 'style'>) {
  const { reduceMotion, still } = useStill();
  return (
    <Animated.View layout={still ? undefined : settleTransition(reduceMotion)} style={style}>
      {children}
    </Animated.View>
  );
}

// For readouts that change about once a second: the new value rises into place on the UI thread.
export function ValueSettle({
  value,
  children,
  style,
}: { value: string | number | boolean } & Pick<RevealProps, 'children' | 'style'>) {
  const { reduceMotion, still } = useStill();
  const progress = useSharedValue(1);
  const shown = useRef(value);
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    if (still) return;
    progress.value = 0;
    progress.value = withTiming(1, glideConfig(reduceMotion));
  }, [value, still, reduceMotion, progress]);
  const settle = useAnimatedStyle(() => ({
    opacity: motion.settleFromOpacity + (1 - motion.settleFromOpacity) * progress.value,
    transform: [{ translateY: motion.settleRiseDp * (1 - progress.value) }],
  }));
  return <Animated.View style={still ? style : [style, settle]}>{children}</Animated.View>;
}
