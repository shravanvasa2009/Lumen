import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withBaseMod,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

// The app name comes from the config so a rename reaches the prompt.
const cameraPurposeEn = (appName: string) =>
  `${appName} uses your camera and flashlight to measure your pulse. Video is never saved.`;
const cameraPurposeEs = (appName: string) =>
  `${appName} usa la cámara y la linterna para medir tu pulso. El video nunca se guarda.`;

// Not required, so the store still offers Lumen to phones without a flash; they get the ambient fallback.
const OPTIONAL_FEATURES = ['android.hardware.camera', 'android.hardware.camera.flash'];

type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;

function addOptionalCameraFeatures(manifest: AndroidManifest): AndroidManifest {
  const features = manifest.manifest['uses-feature'] ?? [];
  for (const name of OPTIONAL_FEATURES) {
    if (!features.some((feature) => feature.$['android:name'] === name)) {
      features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
  }
  manifest.manifest['uses-feature'] = features;
  return manifest;
}

// Hermes V1 fibers leave a code address in RBP, and GWP-ASan's frame-pointer walk then crashes the app at
// start on x86_64 Android 14. Remove once on React Native 0.88 or later (Hermes commit 73f9af39).
// https://github.com/facebook/hermes/issues/1873
// https://developer.android.com/ndk/guides/gwp-asan
function turnOffGwpAsan(manifest: AndroidManifest): AndroidManifest {
  AndroidConfig.Manifest.getMainApplicationOrThrow(manifest).$['android:gwpAsanMode'] = 'never';
  return manifest;
}

// Expo's built-in locales step writes each locale's `ios` keys to <lang>.lproj/InfoPlist.strings.
const withSpanishCameraPurpose: ConfigPlugin = (config) => {
  const existing = config.locales?.es;
  if (typeof existing === 'string') {
    throw new Error(
      'lumen-capture: locales.es is a JSON file path; add NSCameraUsageDescription to that file instead.',
    );
  }
  config.locales = {
    ...config.locales,
    es: {
      ...existing,
      ios: { ...existing?.ios, NSCameraUsageDescription: cameraPurposeEs(config.name) },
    },
  };
  return config;
};

type LumenCaptureProps = { personalTeam?: boolean } | void;

// Free Apple ID teams cannot sign expo-notifications' push entitlement; local reminders don't need it.
// Entitlements mods run newest first, so withBaseMod is used to remove the key after every other plugin.
const withoutPushEntitlement: ConfigPlugin = (config) =>
  withBaseMod<Record<string, unknown>>(config, {
    platform: 'ios',
    mod: 'entitlements',
    async action({ modRequest, ...chainConfig }) {
      // Typed optional, but withBaseMod always sets it.
      if (!modRequest.nextMod) {
        throw new Error('lumen-capture: withBaseMod passed no nextMod for ios.entitlements.');
      }
      const entitlementsConfig = await modRequest.nextMod({ ...chainConfig, modRequest });
      delete entitlementsConfig.modResults['aps-environment'];
      return entitlementsConfig;
    },
  });

const withLumenCaptureOnce: ConfigPlugin<LumenCaptureProps> = (config, props) => {
  if (props?.personalTeam) {
    config = withoutPushEntitlement(config);
  }
  config = withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.NSCameraUsageDescription = cameraPurposeEn(plistConfig.name);
    return plistConfig;
  });
  config = withSpanishCameraPurpose(config);
  config = AndroidConfig.Permissions.withPermissions(config, ['android.permission.CAMERA']);
  return withAndroidManifest(config, (manifestConfig) => {
    manifestConfig.modResults = turnOffGwpAsan(addOptionalCameraFeatures(manifestConfig.modResults));
    return manifestConfig;
  });
};

const withLumenCapture = createRunOncePlugin(withLumenCaptureOnce, 'lumen-capture');

export default withLumenCapture;
