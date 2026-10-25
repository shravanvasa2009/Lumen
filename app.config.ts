import type { ExpoConfig } from 'expo/config';

import brandSnippet from './app.config.brand.json';

// The display name is swappable; the bundle identifier is not after the first upload.
export const APP_NAME = 'Lumen';
const BUNDLE_ID = 'io.github.shravanvasa2009.heartcheck';

// JSON imports widen literals to plain strings and arrays; the snippet is in Expo's config shape.
const brand = brandSnippet.expo as ExpoConfig;

// Free Apple ID ("Personal Team") builds use a separate bundle ID so they never claim the real one, and
// lumen-capture drops the push entitlement free teams cannot sign. Without a team ID, `expo run:ios` picks
// the team from the signing certificate. Fails closed so a typo never builds the real bundle ID.
const personalTeamFlag = process.env.LUMEN_IOS_PERSONAL_TEAM ?? '';
if (!['', '0', '1'].includes(personalTeamFlag)) {
  throw new Error(`LUMEN_IOS_PERSONAL_TEAM must be 1 (on) or 0 or unset (off); got "${personalTeamFlag}".`);
}
const personalTeam = personalTeamFlag === '1';
const teamId = process.env.LUMEN_IOS_TEAM_ID || undefined;
// Apple team IDs are 10 upper-case letters and digits.
if (personalTeam && teamId !== undefined && !/^[A-Z0-9]{10}$/.test(teamId)) {
  throw new Error(
    `LUMEN_IOS_TEAM_ID must be your 10-character Apple team ID (got "${teamId}"); leave it unset to let expo run:ios pick the team.`,
  );
}
let iosSigning: { bundleIdentifier: string; appleTeamId?: string } = { bundleIdentifier: BUNDLE_ID };
if (personalTeam) {
  iosSigning = { bundleIdentifier: `${BUNDLE_ID}.dev` };
  if (teamId) {
    iosSigning.appleTeamId = teamId;
  }
}
// The app and widget extension share the snapshot through this App Group. It follows the bundle ID, so a
// personal-team build gets its own group.
const appGroup = `group.${iosSigning.bundleIdentifier}`;
const capturePlugin = './modules/lumen-capture/app.plugin';
// Care map: foreground location only, asked when the map opens. false keeps the Always and motion keys
// out of Info.plist.
const locationPurposeEn =
  'Lumen uses your location only to show care near you. It is not saved or sent to Lumen.';
const locationPurposeEs =
  'Lumen usa tu ubicación solo para mostrarte atención médica cercana. No se guarda ni se envía a Lumen.';
const locationPlugin: [string, Record<string, unknown>] = [
  'expo-location',
  {
    locationWhenInUsePermission: locationPurposeEn,
    locationAlwaysAndWhenInUsePermission: false,
    locationAlwaysPermission: false,
    motionUsagePermission: false,
    isIosBackgroundLocationEnabled: false,
    isAndroidBackgroundLocationEnabled: false,
  },
];

const config: ExpoConfig = {
  ...brand,
  name: APP_NAME,
  slug: 'heartcheck',
  version: '0.1.0',
  orientation: 'portrait',
  ios: {
    ...brand.ios,
    ...iosSigning,
    supportsTablet: false,
    entitlements: { 'com.apple.security.application-groups': [appGroup] },
  },
  // lumen-capture adds its Spanish camera string to this same locale.
  locales: { es: { ios: { NSLocationWhenInUseUsageDescription: locationPurposeEs } } },
  android: {
    ...brand.android,
    package: BUNDLE_ID,
    // Coarse location is enough for "clinics near you"; expo-location also adds the precise one.
    // https://docs.expo.dev/versions/v57.0.0/config/app/
    blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ...(brand.plugins ?? []),
    locationPlugin,
    '@maplibre/maplibre-react-native',
    personalTeam ? [capturePlugin, { personalTeam: true }] : capturePlugin,
    // Builds targets/ as Apple targets: the widget extension and its Live Activity UI.
    '@bacons/apple-targets',
    './modules/lumen-widgets/app.plugin',
  ],
  // Readings make no network requests; only the optional Care map loads tiles.
  updates: { enabled: false },
  experiments: { typedRoutes: true },
};

export default config;
