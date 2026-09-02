module.exports = {
  root: true,

  env: {
    node: true,
    es2022: true,
  },

  parser: "@typescript-eslint/parser",

  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },

  plugins: ["@typescript-eslint"],

  extends: ["eslint:recommended"],

  ignorePatterns: ["node_modules/", "dist/", "coverage/", "logs/", "uploads/"],

  globals: {
    Express: "readonly",
  },

  rules: {
    "no-unused-vars": "off",

    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
  },
};
