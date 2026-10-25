// Widgets and notifications open the app through three short links, rewritten here to their screens.
// expo-router passes every incoming URL through app/+native-intent.tsx; other URLs pass through untouched.
// https://docs.expo.dev/router/advanced/native-intent/
const CHECK = /^lumen:\/\/check\/?(\?[^#]*)?$/i;
const STANDING = /^lumen:\/\/standing\/?$/i;
const FULL_MODE = /[?&]mode=full(&|$)/i;

export function redirectSystemPath({ path }: { path: string }): string {
  const check = CHECK.exec(path);
  if (check) {
    // Lumen://check is the Quick Check; only ?mode=full asks for the Full Scan.
    const mode = FULL_MODE.test(check[1] ?? '') ? 'full' : 'quick';
    return `/measure/precheck?mode=${mode}`;
  }
  if (STANDING.test(path)) return '/measure/standing-test';
  return path;
}
