module.exports = {
  root: true,
  plugins: ["prettier", "mocha-no-only"],
  extends: ["eslint:recommended"],
  rules: {
    "comma-spacing": ["error", {before: false, after: true}],
    "prettier/prettier": "error",
    "mocha-no-only/mocha-no-only": ["error"],
  },
  parserOptions: {
    ecmaVersion: 2020
  },
  env: {
    es6: true,
    node: true,
    mocha: true
  }
};
