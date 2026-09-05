import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cesium をそのまま配信しているベンダーファイル。手を入れないので対象外。
    "public/cesium/**",
    // ビルド時に node_modules からコピーする生成済み PDF.js worker。
    "public/vendor/**",
  ]),
  {
    // 既存画面のデータ再取得 effect は段階的に専用 hook へ移行する。
    // リリースを止めずに可視化し続けるため、当面 warning として扱う。
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
