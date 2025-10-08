import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import standard from "eslint-config-standard"
import importPlugin from "eslint-plugin-import"
import nPlugin from "eslint-plugin-n"
import promisePlugin from "eslint-plugin-promise"
import prettier from "eslint-plugin-prettier"
import prettierConfig from "eslint-config-prettier"

export default [
  {
    // Apply to all JavaScript files
    files: ["**/*.js"],
    ignores: ["dist/**"], // Exclude dist/ directory
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      ...js.configs.recommended.rules, // Inherit recommended JS rules
      "no-undef": "off", // Disable no-undef for JS files
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["dist/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        process: "readonly", // Fix 'process is not defined' error
        NodeJS: "readonly", // Fix 'NodeJS is not defined' error
        console: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      n: nPlugin,
      promise: promisePlugin,
      prettier: prettier,
    },
    rules: {
      ...standard.rules,
      "no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
      "no-undef": "off", // Ensure no undefined variables
      "prettier/prettier": [
        "error",
        {
          semi: false,
          trailingComma: "es5",
          singleQuote: false,
          tabWidth: 2,
          useTabs: false,
          printWidth: 160,
        },
      ],
    },
  },
  prettierConfig,
]
