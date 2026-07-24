import { builtinModules } from "node:module";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { globalExternals } from "./build/global-externals.js";

const runtimeExternals = ["electron", /^electron\//, ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts"), formats: ["cjs"] },
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/main",
        },
      },
      sourcemap: true,
    },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    plugins: [
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
      }),
    ],
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, "src/renderer/index.tsx"), formats: ["cjs"] },
      outDir: "out/renderer",
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/renderer",
        },
      },
      sourcemap: true,
    },
    css: { modules: { localsConvention: "camelCaseOnly" } },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    plugins: [
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
        "mobx-react": "global.MobxReact",
        react: "global.React",
        "react-dom": "global.ReactDom",
        "react-router-dom": "global.ReactRouterDom",
        "react/jsx-runtime": "global.ReactJsxRuntime",
      }),
    ],
  },
});
