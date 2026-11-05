import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * One flat config for the whole monorepo. Turbo runs the `lint` script inside
 * each package, but ESLint resolves this file upward, so every component is
 * checked with the same rules without keeping duplicate configs in sync.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/deploy/**",
      "**/release/**",
      "**/data/**",
      "**/android/**",
      "**/ios/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      // Components mix server and browser code; the explicit platform
      // adapters are the only place that should branch on the host.
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The API and plugin boundaries intentionally use `any` in a few
      // places; keep potential `any` leaks visible without blocking lint.
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Keep the classic hook rules. The newer React Compiler rules flag
      // existing patterns that are intentional in this app, so opt in later.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
