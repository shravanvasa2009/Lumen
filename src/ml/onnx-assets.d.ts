// Metro turns an imported .onnx into a numeric asset id (see metro.config.mjs).
declare module '*.onnx' {
  const assetModule: number;
  export default assetModule;
}
