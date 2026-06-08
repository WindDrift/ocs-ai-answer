// ESLint 9 flat config
// 扫描 src/** 与 server.js，前端组件文件暂不参与（结构特殊）
const PATTERNS = ["src/**/*.js", "server.js"];

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "public/**",
      "test/**",
      "logs.json",
      "config.json",
    ],
  },
  {
    files: PATTERNS,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      semi: ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "no-multi-spaces": "warn",
      "comma-dangle": "off",
    },
  },
];
