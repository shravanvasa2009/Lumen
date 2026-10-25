import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/ui/components/AppText';
import { TickRing } from '@/features/measure/TickRing';
import { useTheme } from '@/ui/theme';
import { timingConfig, useReduceMotion } from '@/ui/theme/motion';

import { LumenPreviewView } from '../../../modules/lumen-capture/src/LumenPreviewView';

// Everything is drawn in a 280-unit square and scaled to `size`.
const BOX = 280;
const DISC_INSET = 40;
const DISC = BOX - 2 * DISC_INSET;
const MAJOR_EVERY = 10;

// The scrim keeps the count readable over the glow and the live picture.
const COUNT_SCRIM = 'rgba(0,0,0,0.45)';
const CHIP_BG = 'rgba(0,0,0,0.5)';
const CHIP_FG = '#FFFFFF';
const CHIP_DOT = '#FF4F6D';
const COUNT_FG = '#FFFFFF';
const COUNT_SUB_FG = '#EBEBF0';

type PracticeDialProps = {
  // 0 to total.
  seconds: number;
  total: number;
  size: number;
  cameraRunning: boolean;
  fingerDetected: boolean;
  // Lit ticks turn from accent to flag while coaching shows.
  coaching: boolean;
};

// One tick per steady second around the live view, or its glow where there is no native view.
export function PracticeDial({
  seconds,
  total,
  size,
  cameraRunning,
  fingerDetected,
  coaching,
}: PracticeDialProps) {
  const { t } = useTranslation();
  const { spacing, radius, gradients } = useTheme();
  const { stops, highlight, centerX, centerY } = gradients.fingertip;
  const reduceMotion = useReduceMotion();
  const live = cameraRunning && LumenPreviewView !== null;
  const timing = timingConfig(reduceMotion);
  const glowOpacity = fingerDetected ? 1 : 0.3;
  const glowStyle = useAnimatedStyle(() => ({ opacity: withTiming(glowOpacity, timing) }));
  const scale = size / BOX;
  const discSize = DISC * scale;
  const lit = Math.min(total, Math.max(0, seconds));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('practice.progress', { done: lit, total })}
      accessibilityValue={{ min: 0, max: total, now: lit }}
      style={{ width: size, height: size }}
    >
      <TickRing size={size} count={total} lit={lit} majorEvery={MAJOR_EVERY} paused={coaching}>
        {() => (
          <View
            style={{
              width: discSize,
              height: discSize,
              borderRadius: discSize / 2,
              overflow: 'hidden',
            }}
          >
            {live && LumenPreviewView ? (
              <LumenPreviewView style={{ width: discSize, height: discSize }} />
            ) : (
              <Animated.View style={glowStyle}>
                <Svg width={discSize} height={discSize} viewBox={`0 0 ${DISC} ${DISC}`}>
                  <Defs>
                    <RadialGradient
                      id="practice-finger"
                      gradientUnits="userSpaceOnUse"
                      cx={DISC * centerX}
                      cy={DISC * centerY}
                      r={Math.hypot(
                        DISC * Math.max(centerX, 1 - centerX),
                        DISC * Math.max(centerY, 1 - centerY),
                      )}
                    >
                      {stops.map(({ at, color }) => (
                        <Stop key={at} offset={at} stopColor={color} />
                      ))}
                    </RadialGradient>
                    <RadialGradient
                      id="practice-highlight"
                      gradientUnits="userSpaceOnUse"
                      cx={DISC * highlight.centerX}
                      cy={DISC * highlight.centerY}
                      r={Math.hypot(
                        DISC * Math.max(highlight.centerX, 1 - highlight.centerX),
                        DISC * Math.max(highlight.centerY, 1 - highlight.centerY),
                      )}
                    >
                      <Stop offset={0} stopColor={highlight.color} stopOpacity={highlight.opacity} />
                      <Stop offset={highlight.reach} stopColor={highlight.color} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Rect width={DISC} height={DISC} fill="url(#practice-finger)" />
                  <Rect width={DISC} height={DISC} fill="url(#practice-highlight)" />
                </Svg>
              </Animated.View>
            )}
            <View
              style={{
                position: 'absolute',
                width: discSize,
                height: discSize,
                backgroundColor: COUNT_SCRIM,
              }}
            />
            <View style={[StyleSheet.absoluteFill, styles.overlay]}>
              <AppText
                variant="display"
                style={{
                  color: COUNT_FG,
                  fontSize: 48 * scale,
                  lineHeight: 52 * scale,
                  fontWeight: '600',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {lit}
              </AppText>
              <AppText variant="caption" style={{ color: COUNT_SUB_FG, fontWeight: '500' }}>
                {t('practice.progressOf', { total })}
              </AppText>
              {live ? (
                <View
                  style={{
                    marginTop: spacing.sm,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm - 2,
                    paddingHorizontal: spacing.sm + 1,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.pill,
                    backgroundColor: CHIP_BG,
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CHIP_DOT }} />
                  <AppText
                    variant="caption"
                    style={{ color: CHIP_FG, fontSize: 11, lineHeight: 13, fontWeight: '600' }}
                  >
                    {t('practice.liveChip')}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </TickRing>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
});
