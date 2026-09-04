/**
 * Cesium is loaded from CDN at runtime (EagleEyeViewer).
 * Stub module so TypeScript can resolve `import("cesium")` without the ~140MB npm package.
 */
declare module "cesium" {
  // CDN global shape; keep loose so we do not depend on the npm typings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Cesium: any;
  export = Cesium;
}
