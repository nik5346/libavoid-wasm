import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    // Exclude vendored/toolchain directories. Without this, vitest's default
    // file glob also picks up emsdk's own bundled test fixtures (e.g.
    // emsdk/upstream/emscripten/test/**/*.test.js) and third_party's, which
    // reference Emscripten-internal globals (`module(...)`, `Module`) that
    // don't exist here and fail as spurious "Failed Suites".
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/emsdk/**",
      "**/third_party/**",
    ],
  },
});
