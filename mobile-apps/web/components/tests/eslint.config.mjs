import base from "../../../../eslint.config.js";
import { fileURLToPath, URL } from "node:url";

export default [
  ...base,
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: fileURLToPath(new URL("./tsconfig.json", import.meta.url)),
      },
    },
  },
];
