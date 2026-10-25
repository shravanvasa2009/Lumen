// Metro bundles only static imports, so each shipped model needs one here. After a `ships` change, rerun
// `npm run sync-models` and update these imports.
import diabetesNet from '../../assets/models/diabetes-net@1.0.0.onnx';
import appManifest from '../../assets/models/manifest.json';
import rhythmLgbm from '../../assets/models/rhythm-lgbm@1.0.0.onnx';
import sqiFinger from '../../assets/models/sqi-finger@1.0.0.onnx';

export const bundledManifest: unknown = appManifest;

// Manifest `file` name to the Metro asset module expo-asset resolves.
export const bundledModelFiles: Readonly<Record<string, number>> = {
  'rhythm-lgbm@1.0.0.onnx': rhythmLgbm,
  'sqi-finger@1.0.0.onnx': sqiFinger,
  'diabetes-net@1.0.0.onnx': diabetesNet,
};
