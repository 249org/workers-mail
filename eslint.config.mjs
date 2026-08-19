import parser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";

/**
 * Hook rules only. A hook placed after an early return changes the hook count
 * between renders, which React reports as a hard error with no boundary to catch
 * it — the reader pane shipped exactly that fault with the rule silenced.
 */
export default [
  { ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks, "@next/next": next },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
