import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Resolve convex-helpers to source during development/testing
      "convex-helpers": path.resolve(__dirname, "packages/convex-helpers"),
      // Resolve convex to vendored source to test interface changes
      "convex/browser": path.resolve(__dirname, "../convex-js/src/browser/index.ts"),
      "convex/react": path.resolve(__dirname, "../convex-js/src/react/index.ts"),
      "convex/server": path.resolve(__dirname, "../convex-js/src/server/index.ts"),
      // Ensure single React version when using vendored convex-js
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },

  test: {
    environment: "jsdom",
    exclude: ["node_modules/**", "convex/**", "packages/**"],
    projects: [".", "packages/convex-helpers"],
    globals: true,
  },
});
