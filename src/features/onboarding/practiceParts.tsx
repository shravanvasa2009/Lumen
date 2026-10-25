import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/ui/components/AppText';
import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme';
import { glideConfig, timingConfig, useReduceMotion } from '@/ui/theme/motion';

import { LumenPreviewView } from '../../../modules/lumen-capture/src/LumenPreviewView';

const PREVIEW_SIZE = 190;
const METER_HEIGHT = 28;
const RING_SIZE = 44;
const RING_STROKE = 5;
const MARKER_SIZE = METER_HEIGHT - 6;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The picture is a camera image, not themed, so the chip uses a fixed dark scrim.
const LIVE_CHIP_BG = 'rgba(10,6,6,0.55)';
const LIVE_CHIP_FG = '#FFFFFF';
export const LIVE_RING_WIDTH = 4;
export const LIVE_RING_GAP = 3;
export const CAPTION_ROW = 20;

type FingerPreviewProps = {
  detected: boolean;
  size?: number;
  cameraRunning: boolean;
  // The ring turns from accent to flag while coaching shows.
  coaching: boolean;
  // Colour and glow switch at once; only the waveform and ring move during a capture.
  still?: boolean;
};

// Without a native view (Replay, Demo, no capture) the circle shows the pulse glow and no chip or
// caption, since nothing live is shown.
export function FingerPreview({
  detected,
  size = PREVIEW_SIZE,
  cameraRunning,
  coaching,
  still = false,
}: FingerPreviewProps) {
  const { colors, spacing, radius } = useTheme();
  const { t } = useTranslation();
  const live = cameraRunning && LumenPreviewView !== null;
  const reduceMotion = useReduceMotion();
  // Built on the JS thread; the worklets below must not call a plain function.
  const timing = timingConfig(reduceMotion || still);
  const ringColor = coaching ? colors.flag : colors.accent;
  const glowOpacity = detected ? 1 : 0.3;
  const ringStyle = useAnimatedStyle(() => ({ borderColor: withTiming(ringColor, timing) }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: withTiming(glowOpacity, timing) }));
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <Animated.View
        accessible={live}
        accessibilityLabel={live ? t('capture.liveViewA11y') : undefined}
        accessibilityElementsHidden={!live}
        importantForAccessibility={live ? 'yes' : 'no-hide-descendants'}
        style={[
          { padding: LIVE_RING_GAP, borderWidth: LIVE_RING_WIDTH, borderRadius: radius.pill },
          ringStyle,
        ]}
      >
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
          {live && LumenPreviewView ? (
            <LumenPreviewView style={{ width: size, height: size }} />
          ) : (
            <Animated.View style={glowStyle}>
              <Svg width={size} height={size}>
                <Defs>
                  <RadialGradient id="finger-glow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={colors.pulse} stopOpacity={0.75} />
                    <Stop offset="1" stopColor={colors.pulse} stopOpacity={1} />
                  </RadialGradient>
                </Defs>
                <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#finger-glow)" />
              </Svg>
            </Animated.View>
          )}
          {live ? (
            <View
              style={{
                position: 'absolute',
                top: size * 0.08,
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.xs,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
                borderRadius: radius.pill,
                backgroundColor: LIVE_CHIP_BG,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_CHIP_FG }} />
              <AppText variant="caption" style={{ color: LIVE_CHIP_FG, fontWeight: '700' }}>
                {t('capture.liveBadge')}
              </AppText>
            </View>
          ) : null}
        </View>
      </Animated.View>
      <View
        style={{
          minHeight: CAPTION_ROW,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        {live ? (
          <>
            <Icon name="camera" size={16} color={colors.textDim} />
            <AppText variant="caption" tone="textDim" style={{ fontWeight: '500', flexShrink: 1 }}>
              {t('capture.liveView')}
            </AppText>
          </>
        ) : null}
      </View>
    </View>
  );
}

// Keeps the marker inside the bar at both ends.
const MARKER_INSET_PCT = 4;
const MARKER_SPAN_PCT = 100 - 2 * MARKER_INSET_PCT;

// The level arrives about once a second, so the marker glides to it; it appears in place the first time.
export function SignalMeter({ level = null }: { level?: number | null }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const marked = level === null ? null : Math.min(1, Math.max(0, level));
  const targetPct = MARKER_INSET_PCT + (marked ?? 0.5) * MARKER_SPAN_PCT;
  const positionPct = useSharedValue(targetPct);
  const hasLevel = marked !== null;
  const wasMarked = useRef(hasLevel);
  useEffect(() => {
    if (!hasLevel) {
      wasMarked.current = false;
      return;
    }
    positionPct.value = wasMarked.current ? withTiming(targetPct, glideConfig(reduceMotion)) : targetPct;
    wasMarked.current = true;
  }, [hasLevel, targetPct, reduceMotion, positionPct]);
  const markerStyle = useAnimatedStyle(() => ({ left: `${positionPct.value}%` }));
  return (
    <View style={{ height: METER_HEIGHT }}>
      <Svg
        width="100%"
        height={METER_HEIGHT}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <LinearGradient id="signal-scale" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.badgePublicFg} />
            <Stop offset="1" stopColor={colors.accentFill} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={METER_HEIGHT} rx={METER_HEIGHT / 2} fill="url(#signal-scale)" />
      </Svg>
      {marked === null ? null : (
        <Animated.View
          testID="signal-marker"
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: (METER_HEIGHT - MARKER_SIZE) / 2,
              marginLeft: -MARKER_SIZE / 2,
              width: MARKER_SIZE,
              height: MARKER_SIZE,
              borderRadius: MARKER_SIZE / 2,
              backgroundColor: colors.text,
              borderWidth: 2,
              borderColor: colors.bg,
            },
            markerStyle,
          ]}
        />
      )}
    </View>
  );
}

// By thirds of the bar.
export function labelAt(level: number | null): 'weak' | 'ok' | 'strong' | null {
  if (level === null) return null;
  if (level < 1 / 3) return 'weak';
  return level < 2 / 3 ? 'ok' : 'strong';
}

type RingProps = {
  fraction: number;
  size?: number;
  strokeWidth?: number;
  paused?: boolean;
};

export function ProgressRing({
  fraction,
  size = RING_SIZE,
  strokeWidth = RING_STROKE,
  paused = false,
}: RingProps) {
  const { colors } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const reduceMotion = useReduceMotion();
  const target = Math.min(1, Math.max(0, fraction));
  // Built on the JS thread: calling glideConfig inside the worklet crashes on device
  // ("Tried to synchronously call a Remote Function").
  const glide = glideConfig(reduceMotion);
  const arc = useDerivedValue(() => withTiming(target, glide));
  const arcProps = useAnimatedProps(() => ({
    strokeDasharray: `${circumference * arc.value} ${circumference}`,
  }));
  return (
    <Svg
      width={size}
      height={size}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={colors.surface3}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        animatedProps={arcProps}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={paused ? colors.flag : colors.accent}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}
