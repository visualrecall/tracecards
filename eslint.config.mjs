import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import obsidianmd from "eslint-plugin-obsidianmd";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig([
  globalIgnores(["**/dist/", "dev-vault/", "spec/fixtures/"]),

  // ESLint, typescript-eslint (type-checked for TypeScript) and Obsidian's plugin rules.
  // Obsidian's rules apply to core and ui too, since they run inside Obsidian.
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The product name is written in lowercase.
      "obsidianmd/ui/sentence-case": [
        "warn",
        { enforceCamelCaseLower: true, brands: ["Tracecards"] },
      ],
    },
  },

  // Each package may only import what its own package.json declares.
  {
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "import/no-extraneous-dependencies": [
        "error",
        { devDependencies: ["**/test/**", "**/*.config.mjs", "scripts/**"] },
      ],
    },
  },

  {
    files: ["packages/ui/**/*.{ts,tsx}", "apps/obsidian/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Node scripts and build configs, which don't run inside Obsidian.
  {
    files: ["**/*.mjs", "packages/*/test/**"],
    languageOptions: { globals: globals.node },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
      "obsidianmd/hardcoded-config-path": "off",
    },
  },

  prettier,
]);
