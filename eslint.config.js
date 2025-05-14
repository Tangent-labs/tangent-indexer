import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import standard from "eslint-config-standard"
import importPlugin from "eslint-plugin-import"
import nPlugin from "eslint-plugin-n"
import promisePlugin from "eslint-plugin-promise"
import prettier from "eslint-plugin-prettier"
import prettierConfig from "eslint-config-prettier"

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
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
      "no-undef": "error", // Ensure no undefined variables
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
