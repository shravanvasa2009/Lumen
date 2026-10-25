import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withInfoPlist,
  withStringsXml,
  type ConfigPlugin,
} from 'expo/config-plugins';

type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;

// Exported because the widget host sends the update broadcasts.
// https://developer.android.com/develop/ui/compose/glance/create-app-widget
const RECEIVERS = [
  { name: 'expo.modules.lumenwidgets.SmallWidgetReceiver', provider: '@xml/lumen_widget_small' },
  { name: 'expo.modules.lumenwidgets.MediumWidgetReceiver', provider: '@xml/lumen_widget_medium' },
  { name: 'expo.modules.lumenwidgets.LockWidgetReceiver', provider: '@xml/lumen_widget_lock' },
];

function addWidgetReceivers(manifest: AndroidManifest): AndroidManifest {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const kept = (application.receiver ?? []).filter(
    (receiver) => !RECEIVERS.some(({ name }) => receiver.$['android:name'] === name),
  );
  application.receiver = [
    ...kept,
    ...RECEIVERS.map(({ name, provider }) => ({
      $: { 'android:name': name, 'android:exported': 'true' as const },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': provider } }],
    })),
  ];
  return manifest;
}

const APP_GROUPS = 'com.apple.security.application-groups';

// The App Group ID goes into Info.plist so no Swift file hard-codes it.
// https://developer.apple.com/documentation/bundleresources/information-property-list/nssupportsliveactivities
const withWidgetInfoPlist: ConfigPlugin = (config) =>
  withInfoPlist(config, (plistConfig) => {
    const appGroup = plistConfig.ios?.entitlements?.[APP_GROUPS]?.[0];
    if (typeof appGroup !== 'string') {
      throw new Error(`lumen-widgets: set ios.entitlements["${APP_GROUPS}"] in app.config.ts.`);
    }
    plistConfig.modResults.LumenAppGroup = appGroup;
    plistConfig.modResults.NSSupportsLiveActivities = true;
    return plistConfig;
  });

// A library layout can't read the app's label, so the app's strings.xml overrides lumen_widget_preview_name.
const withLumenWidgetsOnce: ConfigPlugin = (config) => {
  const withReceivers = withAndroidManifest(withWidgetInfoPlist(config), (manifestConfig) => {
    manifestConfig.modResults = addWidgetReceivers(manifestConfig.modResults);
    return manifestConfig;
  });
  return withStringsXml(withReceivers, (stringsConfig) => {
    const name = AndroidConfig.Resources.buildResourceItem({
      name: 'lumen_widget_preview_name',
      value: stringsConfig.name,
      translatable: false,
    });
    stringsConfig.modResults = AndroidConfig.Strings.setStringItem([name], stringsConfig.modResults);
    return stringsConfig;
  });
};

const withLumenWidgets = createRunOncePlugin(withLumenWidgetsOnce, 'lumen-widgets');

export default withLumenWidgets;
