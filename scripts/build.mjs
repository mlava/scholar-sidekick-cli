import { build } from "esbuild";

await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/cli.mjs",
  sourcemap: false,
  // commander is CJS; esbuild's ESM output needs a real `require` for its
  // internal `require("node:events")` etc. createRequire provides one.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);",
  },
});

process.stdout.write("Built dist/cli.mjs\n");
