# Lumen

Lumen measures your pulse with your phone. Put a fingertip over the rear camera and flash, and Lumen reads the
small color changes in your skin with each heartbeat (photoplethysmography, or PPG). From that signal it reports
heart rate, HRV and breathing rate, and checks for signs of:

- atrial fibrillation (AFib)
- PSVT
- the heart-rate pattern seen in POTS (standing test)
- a pulse-shape pattern linked to diabetes

Lumen refuses readings that are too noisy to trust and labels every result with how well that check has been
tested.

> **Lumen is a screening prototype, not a medical device.** It does not diagnose anything. If you feel unwell,
> contact a doctor or emergency services.

Built for the Congressional App Challenge 2026.

## Features

- Guided setup with a practice reading and a compatibility score for your phone
- Four ways to measure: Quick Check, Full Scan, Deep HRV and a Standing Heart-Rate Test, with live coaching
  when the finger moves or the lens isn't covered
- Results that explain themselves: beat-by-beat view, rhythm map, signal quality
- Trends, a doctor report you can export as a PDF, and a care map of nearby clinics
- Home-screen and lock-screen widgets, daily reminders
- English and Spanish, light and dark mode
- Everything stays on the phone. Readings make no network requests.

## How it works

The code is organized in layers. Each layer only uses the layers below it.

```
app/              Screens (Expo Router, one file per screen)
src/features/     What each screen does: measure, results, onboarding, trends, care, ...
src/ui/           Shared components, theme and translations
src/data/         Storage on the phone (SQLite)
src/ml/           Runs the on-device models (ONNX Runtime)
src/core/         Signal processing in plain TypeScript: filtering, beat detection, HR, HRV, rhythm
modules/          Native code
  lumen-capture/    Camera and flash capture (Swift for iOS, Kotlin for Android)
  lumen-widgets/    Widgets (Swift and Kotlin)
targets/widget/   iOS widget extension
assets/models/    Model weights (.onnx) and their manifest
```

A reading flows from the bottom up: the native camera module averages the red, green and blue values of each
frame, `src/core` turns those numbers into beats and measurements, `src/ml` scores signal quality and rhythm,
and the screens show the result.

## Getting started

You need [Node.js 22](https://nodejs.org) or newer.

```sh
git clone https://github.com/shravanvasa2009/Lumen.git
cd Lumen
npm install
```

Lumen uses its own native camera code, so it runs as a development build, not in Expo Go.

**Android** (Windows, macOS or Linux, with [Android Studio](https://developer.android.com/studio) installed):

```sh
npm run android
```

**iPhone** (macOS with [Xcode](https://developer.apple.com/xcode/)):

```sh
npm run ios -- --device
```

To build with a free Apple ID (Personal Team), set `LUMEN_IOS_PERSONAL_TEAM=1` first. The app then uses its own
bundle ID so it can be signed without a paid developer account.

A real phone is needed to take readings. The camera and flash don't exist in the simulator or emulator.

## Built with

Expo and React Native, TypeScript, Swift, Kotlin, ONNX Runtime, SQLite, MapLibre.

## License

Apache License 2.0. See [LICENSE](LICENSE).
