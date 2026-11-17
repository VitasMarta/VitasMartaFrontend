import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** R5: toda petición HTTP sale por el cliente del Gateway / BFF. */
const NETWORK_ALLOWED = [
  "src/core/api/**",
  "src/app/bff/**",
  "src/mocks/**",
  "src/instrumentation.ts",
  "tests/**",
  "scripts/**",
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // El plugin jsx-a11y ya lo registra eslint-config-next; aquí se activa el set completo (RNF-07).
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // `role="list"` explícito en <ul>/<ol> es intencional: Safari/VoiceOver elimina la semántica de
      // lista cuando se quita el estilo (guía §4-2).
      "jsx-a11y/no-redundant-roles": ["error", { ul: ["list"], ol: ["list"] }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: NETWORK_ALLOWED,
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "R5: usa el cliente `gatewayClient` (core/api), no fetch directo." },
        { name: "XMLHttpRequest", message: "R5: usa el cliente `gatewayClient` (core/api)." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: "R5: usa el cliente `gatewayClient`." },
        { object: "globalThis", property: "fetch", message: "R5: usa el cliente `gatewayClient`." },
      ],
      "no-restricted-imports": [
        "error",
        { paths: [
          { name: "axios", message: "R5: usa el cliente `gatewayClient`." },
          { name: "ky", message: "R5: usa el cliente `gatewayClient`." },
        ] },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
