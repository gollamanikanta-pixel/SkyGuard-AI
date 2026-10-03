import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    ".vercel/**",
    "build/**",
    "dist/**",
    "*.tsbuildinfo",
  ]),
]);

export default eslintConfig;
