import { createContext, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

// Every timed animation is 200 ms ease-out, plus a short press spring outside the capture screen.
export const motion = {
  durationMs: 200,
  // Once-a-second readouts glide; 200 ms would read as a jump then a wait.
  glideMs: 600,
  // Capped by staggerMax so the last section is not a second late.
  staggerMs: 40,
  staggerMax: 6,
  // Rise in dp and starting opacity of a changed readout.
  settleRiseDp: 6,
  settleFromOpacity: 0.5,
  pressScale: 0.97,
  pressSpring: { damping: 22, stiffness: 420, mass: 0.6 },
} as const;

export const easeOut = Easing.out(Easing.cubic);

// Reads Reduce Motion live, so a toggle affects the next animation.
export function timingConfig(reduceMotion: boolean) {
  return { duration: motion.durationMs, easing: easeOut, reduceMotion: reduceMotionMode(reduceMotion) };
}

export function glideConfig(reduceMotion: boolean) {
  return { duration: motion.glideMs, easing: easeOut, reduceMotion: reduceMotionMode(reduceMotion) };
}

export function enterTransition(reduceMotion: boolean, index = 0) {
  return FadeIn.duration(motion.durationMs)
    .easing(easeOut)
    .delay(Math.min(index, motion.staggerMax) * motion.staggerMs)
    .reduceMotion(reduceMotionMode(reduceMotion));
}

export function exitTransition(reduceMotion: boolean) {
  return FadeOut.duration(motion.durationMs).easing(easeOut).reduceMotion(reduceMotionMode(reduceMotion));
}

export function settleTransition(reduceMotion: boolean) {
  return LinearTransition.duration(motion.durationMs)
    .easing(easeOut)
    .reduceMotion(reduceMotionMode(reduceMotion));
}

// iOS keeps the system push for swipe-back. Android's default varies by version, so it gets a fixed slide.
// https://reactnavigation.org/docs/native-stack-navigator/#animation
export function stackAnimation(reduceMotion: boolean) {
  if (reduceMotion) return 'none';
  return Platform.OS === 'android' ? 'ios_from_right' : 'default';
}

// Always or Never, not System, so the setting is read only once, through useReduceMotion.
export function reduceMotionMode(reduceMotion: boolean) {
  return reduceMotion ? ReduceMotion.Always : ReduceMotion.Never;
}

// Set by the capture screen so only the waveform and ring move.
export const StillMotion = createContext(false);

// The OS Reduce Motion setting; moving components drop to no movement or a plain fade.
let reduceMotionOn = false;
let watching = false;
const listeners = new Set<() => void>();

function setReduceMotion(next: boolean) {
  if (next === reduceMotionOn) return;
  reduceMotionOn = next;
  listeners.forEach((listener) => listener());
}

function watchReduceMotion() {
  if (watching) return;
  watching = true;
  Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(setReduceMotion, (error: unknown) => {
    console.warn('Could not read the Reduce Motion setting; motion stays on.', error);
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
}

function subscribe(listener: () => void) {
  watchReduceMotion();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReduceMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduceMotionOn);
}
