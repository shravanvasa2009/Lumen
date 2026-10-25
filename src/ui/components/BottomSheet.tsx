import { type ReactNode, useContext, useEffect, useRef } from 'react';
import { Animated as DragAnimated, type GestureResponderEvent, Modal, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useWindowBottomInset } from '@/features/demo/DemoStrip';
import { useTheme } from '@/ui/theme';
import { easeOut, motion, reduceMotionMode, StillMotion, useReduceMotion } from '@/ui/theme/motion';

// Spoken label of the dimmed area; a tap there or Android Back dismisses. Without it, only the sheet's own
// buttons close it. Without `onSwipeDown`, a swipe dismisses too.
type BottomSheetProps = {
  visible: boolean;
  children: ReactNode;
  onSwipeDown?: () => void;
  // floating: inset rounded card; grouped: grouped-background panel; default: plain sheet.
  appearance?: 'floating' | 'grouped';
} & ({ onDismiss: () => void; dismissLabel: string } | { onDismiss?: undefined; dismissLabel?: undefined });

// Android requires onRequestClose on a Modal; this one keeps the sheet open.
function keepOpen() {}

// Drag distance (dp) or flick speed (dp/ms) that counts as a swipe.
const SWIPE_CLOSE_DP = 80;
const SWIPE_CLOSE_VELOCITY = 0.8;
// Slop (dp) before the panel follows the finger, so taps stay taps.
const SWIPE_START_DP = 10;
// iOS sheet handle size (dp).
const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 5;
const GROUPED_RADIUS = 32;

// Fades in only. A Reanimated slide on Android left the touch geometry below the screen and dropped
// taps that moved even slightly. Content unmounts as soon as `visible` is false, so the emergency route
// never waits on an animation.
export function BottomSheet({
  visible,
  onDismiss,
  dismissLabel,
  onSwipeDown,
  appearance,
  children,
}: BottomSheetProps) {
  const { colors, radius, spacing, shadow } = useTheme();
  const reduceMotion = useReduceMotion();
  const onCaptureScreen = useContext(StillMotion);
  // Android 15+ draws the Modal edge to edge, under the navigation bar.
  const bottomInset = useWindowBottomInset();
  const swipeAnswer = useRef(onSwipeDown ?? onDismiss);
  swipeAnswer.current = onSwipeDown ?? onDismiss;
  // JS-driven, not the native driver, so touches hit-test against the committed position.
  const dragY = useRef(new DragAnimated.Value(0)).current;
  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible, dragY]);
  // Raw touch events: on some Android phones the panel never wins the responder inside a Modal.
  const swipeStart = useRef<{ pageY: number; timeMs: number } | null>(null);
  const followFinger = (event: GestureResponderEvent) => {
    const start = swipeStart.current;
    if (start === null || swipeAnswer.current === undefined) return;
    const dy = event.nativeEvent.pageY - start.pageY;
    dragY.setValue(dy > SWIPE_START_DP ? dy - SWIPE_START_DP : 0);
  };
  const endSwipe = (event: GestureResponderEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null || swipeAnswer.current === undefined) return;
    const dy = event.nativeEvent.pageY - start.pageY;
    const velocity = dy / Math.max(1, event.nativeEvent.timestamp - start.timeMs);
    if (dy > SWIPE_CLOSE_DP || (dy > SWIPE_START_DP && velocity > SWIPE_CLOSE_VELOCITY)) {
      swipeAnswer.current();
      return;
    }
    DragAnimated.spring(dragY, { toValue: 0, useNativeDriver: false }).start();
  };
  // The OS took the touch away: spring back.
  const cancelSwipe = () => {
    swipeStart.current = null;
    DragAnimated.spring(dragY, { toValue: 0, useNativeDriver: false }).start();
  };
  const fadeIn = onCaptureScreen
    ? undefined
    : FadeIn.duration(motion.durationMs).easing(easeOut).reduceMotion(reduceMotionMode(reduceMotion));
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss ?? keepOpen}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          testID="sheet-scrim"
          entering={fadeIn}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.scrim,
          }}
        >
          <Pressable
            testID="sheet-scrim-press"
            accessible={onDismiss !== undefined}
            accessibilityLabel={dismissLabel}
            onPress={onDismiss}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <DragAnimated.View
          onTouchStart={(event) => {
            swipeStart.current = { pageY: event.nativeEvent.pageY, timeMs: event.nativeEvent.timestamp };
          }}
          onTouchMove={followFinger}
          onTouchEnd={endSwipe}
          onTouchCancel={cancelSwipe}
          testID="sheet-drag"
          style={{ maxHeight: '90%', flexShrink: 1, transform: [{ translateY: dragY }] }}
        >
          <Animated.View
            testID="sheet-panel"
            entering={fadeIn}
            style={{
              backgroundColor: appearance === 'grouped' ? colors.bg : colors.surface,
              ...(appearance === 'floating'
                ? {
                    borderRadius: radius.hero,
                    marginHorizontal: spacing.sm,
                    marginBottom: spacing.sm + bottomInset,
                    ...shadow.floating,
                  }
                : {
                    borderTopLeftRadius: appearance === 'grouped' ? GROUPED_RADIUS : radius.sheet,
                    borderTopRightRadius: appearance === 'grouped' ? GROUPED_RADIUS : radius.sheet,
                  }),
              // Keeps the status bar visible; taller content scrolls.
              maxHeight: '100%',
              flexShrink: 1,
              padding: appearance === 'grouped' ? spacing.lg : spacing.xxl,
              paddingBottom: appearance === 'floating' ? spacing.xxl : spacing.xxxl + bottomInset,
              gap: spacing.lg,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: GRABBER_WIDTH,
                height: GRABBER_HEIGHT,
                borderRadius: GRABBER_HEIGHT / 2,
                backgroundColor: colors.line2,
                marginTop: -spacing.sm,
              }}
            />
            {children}
          </Animated.View>
        </DragAnimated.View>
      </View>
    </Modal>
  );
}
