import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { Button } from '@/ui/components/Button';
import { PressableScale } from '@/ui/components/PressableScale';
import { useTheme } from '@/ui/theme';

import type { Coordinates, NearbyClinic } from './clinics';
import { ContactIcon } from './ContactIcons';
import type { NearbyDoctor } from './nearbyDoctors';

// OpenFreeMap needs no key; commercial use is allowed and the attribution stays on.
// Liberty in both themes: the dark style's labels and roads were too faint to read.
// https://openfreemap.org/quick_start/
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const START_ZOOM = 11;
const PIN_SIZE = 30;
const MAP_MAX_HEIGHT = 280;
// With the keyboard up the map shrinks but stays; on a 360x640 dp phone title, map and ZIP field still fit.
const MAP_KEYBOARD_HEIGHT = 120;
// On a 360x640 dp phone this leaves the list, the ZIP field and the doctor button within reach.
const MAP_WINDOW_SHARE = 0.3;
// If the map neither renders nor fails by then, drop the spinner; tiles may still fill in.
const LOADING_TIMEOUT_MS = 20_000;
const LEGEND_PIN_BOX = 16;
const LEGEND_PIN_SCALE = 0.55;

type PinProps = { shape: 'clinic' | 'regular' | 'doctor' | 'you' };

// Pin kinds differ in shape as well as color. The regular pin uses the plot-panel pair, which is the same
// in both themes, because the map style is light in both.
function Pin({ shape }: PinProps) {
  const { colors } = useTheme();
  if (shape === 'you') {
    return (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.text,
          borderWidth: 4,
          borderColor: colors.accentFill,
        }}
      />
    );
  }
  if (shape === 'doctor') {
    return (
      <View
        style={[
          styles.pin,
          { backgroundColor: colors.surface, borderColor: colors.badgePublicFg, borderWidth: 3 },
        ]}
      >
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.badgePublicFg }} />
      </View>
    );
  }
  const regular = shape === 'regular';
  const cross = regular ? colors.onPlot : colors.onAccentFill;
  return (
    <View
      testID={`care-pin-${shape}`}
      style={[
        styles.pin,
        regular
          ? {
              backgroundColor: colors.plotPanel,
              borderColor: colors.surface,
              borderWidth: 2,
              borderRadius: 7,
            }
          : { backgroundColor: colors.accentFill, borderColor: colors.surface, borderWidth: 2 },
      ]}
    >
      <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: cross }} />
      <View
        style={{
          position: 'absolute',
          width: 4,
          height: 14,
          borderRadius: 2,
          backgroundColor: cross,
        }}
      />
    </View>
  );
}

type LegendEntry = { shape: PinProps['shape']; label: string };

// Top-left so it never covers the attribution; compact for a 192 dp map, and it ignores touches.
function MapLegend({ entries }: { entries: readonly LegendEntry[] }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      testID="care-map-legend"
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: spacing.xs,
        left: spacing.xs,
        maxWidth: '78%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: spacing.md,
        rowGap: spacing.xs,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      {entries.map(({ shape, label }) => (
        <View key={shape} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: LEGEND_PIN_BOX,
              height: LEGEND_PIN_BOX,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ transform: [{ scale: LEGEND_PIN_SCALE }] }}>
              <Pin shape={shape} />
            </View>
          </View>
          <AppText variant="caption" style={{ flexShrink: 1 }}>
            {label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

type CareMapViewProps = {
  centre: Coordinates;
  // Where the person is, when the location was allowed; a ZIP search shows no "you" dot.
  you: Coordinates | null;
  clinics: readonly NearbyClinic[];
  doctors: readonly NearbyDoctor[];
  selectedId: string | null;
  // The map shrinks but stays mounted so the ZIP field stays in view.
  compact: boolean;
  onSelectClinic: (id: string) => void;
  onClearSelection: () => void;
  // Only while a searched place is shown, to return to the person's own area.
  onShowMyLocation?: () => void;
};

// The style is the same in both themes, so it is never swapped on a live map (a crash on some Android
// devices, maplibre-react-native #1647). Retry remounts the map instead.
export function CareMapView({
  centre,
  you,
  clinics,
  doctors,
  selectedId,
  compact,
  onSelectClinic,
  onClearSelection,
  onShowMyLocation,
}: CareMapViewProps) {
  const { t } = useTranslation();
  const { radius, colors, spacing, control } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const { height: windowHeight } = useWindowDimensions();
  const mapHeight = Math.min(MAP_MAX_HEIGHT, Math.round(windowHeight * MAP_WINDOW_SHARE));
  const legend: LegendEntry[] = [
    { shape: 'clinic', label: t('careMap.legendClinic') },
    ...(clinics.some((clinic) => clinic.kind === 'regular')
      ? [{ shape: 'regular' as const, label: t('careMap.legendRegular') }]
      : []),
    ...(doctors.length > 0 ? [{ shape: 'doctor' as const, label: t('careMap.legendDoctor') }] : []),
    ...(you ? [{ shape: 'you' as const, label: t('careMap.legendYou') }] : []),
  ];
  useEffect(() => {
    const timer = setTimeout(
      () => setLoadState((state) => (state === 'loading' ? 'failed' : state)),
      LOADING_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [attempt]);
  const showMap = () => setLoadState('ready');
  const retry = () => {
    setLoadState('loading');
    setAttempt((count) => count + 1);
  };
  return (
    <View
      testID="care-map-frame"
      style={{
        height: compact ? Math.min(mapHeight, MAP_KEYBOARD_HEIGHT) : mapHeight,
        borderRadius: radius.sheet,
        overflow: 'hidden',
        backgroundColor: colors.surface2,
      }}
    >
      <Map
        key={attempt}
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        attribution
        logo={false}
        accessibilityLabel={t('careMap.mapLabel')}
        onPress={onClearSelection}
        // maplibre 11.4.1 fires onDidFinishRenderingMap (partial) or ...Fully (complete), never both, so
        // either clears the spinner. Offline on Android no failure event arrives, so the timeout shows Retry.
        // A failure after the map is showing must not replace it.
        onDidFinishRenderingMap={showMap}
        onDidFinishRenderingMapFully={showMap}
        onDidFailLoadingMap={() => setLoadState((state) => (state === 'loading' ? 'failed' : state))}
      >
        <Camera initialViewState={{ center: [centre.lon, centre.lat], zoom: START_ZOOM }} />
        {you ? (
          <Marker id="you" lngLat={[you.lon, you.lat]}>
            <Pin shape="you" />
          </Marker>
        ) : null}
        {clinics.map((clinic) => (
          <Marker
            key={clinic.id}
            id={`clinic-${clinic.id}`}
            lngLat={[clinic.lon, clinic.lat]}
            // On Android a pin tap also reaches the map's own onPress (maplibre-react-native #1618).
            onPress={(event) => {
              event.stopPropagation();
              onSelectClinic(clinic.id);
            }}
          >
            <View style={{ opacity: selectedId === null || selectedId === clinic.id ? 1 : 0.6 }}>
              <Pin shape={clinic.kind === 'regular' ? 'regular' : 'clinic'} />
            </View>
          </Marker>
        ))}
        {doctors.map((doctor, index) => (
          <Marker
            key={`${doctor.name}-${index}`}
            id={`doctor-${index}`}
            lngLat={[doctor.lon, doctor.lat]}
            // Doctor details wait for the native search; the tap must not clear the clinic pick.
            onPress={(event) => event.stopPropagation()}
          >
            <Pin shape="doctor" />
          </Marker>
        ))}
      </Map>
      <MapLegend entries={legend} />
      {onShowMyLocation ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('careMap.showMyLocation')}
          onPress={onShowMyLocation}
          style={{
            position: 'absolute',
            top: spacing.sm,
            right: spacing.sm,
            width: control.minTarget,
            height: control.minTarget,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surface,
            borderColor: colors.line2,
            borderWidth: 1,
          }}
        >
          <ContactIcon name="locate" size={22} color={colors.accent} />
        </PressableScale>
      ) : null}
      {loadState === 'loading' ? (
        <View
          testID="care-map-loading"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface2, opacity: 0.85 }]} />
          <ActivityIndicator color={colors.accent} />
          <AppText tone="textDim">{t('careMap.loadingMap')}</AppText>
        </View>
      ) : null}
      {loadState === 'failed' ? (
        <View
          testID="care-map-failed"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              padding: spacing.lg,
              backgroundColor: colors.surface2,
            },
          ]}
        >
          <AppText accessibilityRole="alert" tone="textDim" style={{ textAlign: 'center' }}>
            {t('careMap.mapFailed')}
          </AppText>
          <Button label={t('careMap.retry')} variant="secondary" onPress={retry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
