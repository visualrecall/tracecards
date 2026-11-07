import { appendFile, copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join, resolve } from "node:path";
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const here = import.meta.dirname;
const outdir = join(here, "dist");
// Obsidian reads manifest.json from the repository root, so it lives there.
const manifest = join(here, "../../manifest.json");
const BANNER =
  "/*! Tracecards plugin for Obsidian, © VisualRecall. AGPL-3.0-only. Source: https://github.com/visualrecall/tracecards */";

/** Copies manifest.json next to main.js after every build. */
const copyManifest = {
  name: "copy-manifest",
  setup(build) {
    build.onEnd(async () => {
      await mkdir(outdir, { recursive: true });
      await copyFile(manifest, join(outdir, "manifest.json"));
    });
  },
};

/**
 * Adds the licenses of the libraries bundled into main.js to its end. Their licenses (MIT and
 * similar) ask for the notice in every copy, and Obsidian installs only main.js, manifest.json and
 * styles.css. Only for release builds: watch builds stay on this machine.
 */
const bundledLicenses = {
  name: "bundled-licenses",
  setup(build) {
    if (watch) return;
    build.onEnd(async ({ metafile }) => {
      if (!metafile) return;
      // A package's folder from the path of a file in it: after the last node_modules/.
      const folders = new Set();
      for (const output of Object.values(metafile.outputs)) {
        for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
          const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
          if (match && bytesInOutput > 0) folders.add(resolve(match[1]));
        }
      }
      const notices = [];
      for (const folder of folders) {
        const pkg = JSON.parse(await readFile(join(folder, "package.json"), "utf8"));
        const file = (await readdir(folder)).find((name) => /^licen[cs]e/i.test(name));
        if (!file) throw new Error(`${pkg.name} has no license file to include in main.js`);
        const text = (await readFile(join(folder, file), "utf8")).trim().replaceAll("*/", "* /");
        notices.push(`${pkg.name} ${pkg.version} (${pkg.license})\n\n${text}`);
      }
      notices.sort();
      const comment = `/*! Libraries bundled into Tracecards, and their licenses:\n\n${notices.join("\n\n---\n\n")}\n*/\n`;
      await appendFile(join(outdir, "main.js"), comment);

      // The Inter font is inside styles.css, which its license asks to carry the notice.
      const inter = await readFile(
        join(here, "../../packages/ui/src/fonts/Inter-LICENSE.txt"),
        "utf8",
      );
      const interNotice = `/*! The Inter font in this file, and its license:\n\n${inter.trim().replaceAll("*/", "* /")}\n*/\n`;
      await appendFile(join(outdir, "styles.css"), interNotice);
    });
  },
};

/**
 * Takes out of React DOM the code that makes `<script>` elements: for `ReactDOM.preinit` and
 * `preinitModule`, which load code from a URL, and for a `<script>` written in JSX. Tracecards uses
 * none of them, and a plugin able to load code at runtime is what Obsidian's review turns down.
 * Each now throws instead, so it would say so if it were ever reached. The build stops if React
 * DOM no longer has exactly these, so an update can't bring them back unnoticed.
 */
const noScriptLoading = {
  name: "no-script-loading",
  setup(build) {
    const refuse = `(() => { throw new Error("Tracecards doesn't load scripts."); })()`;
    const removed = [
      // ReactDOM.preinit, preinitModule and <script async src>.
      { code: /\.createElement\(\s*"script"\s*\)/g, places: 3, by: `.createElement(${refuse})` },
      // A <script> in JSX, made through innerHTML so it doesn't run.
      {
        code: /\.innerHTML\s*=\s*"<script>\\x3c\/script>"/g,
        places: 1,
        by: `.innerHTML = ${refuse}`,
      },
    ];
    build.onLoad(
      { filter: /react-dom[\\/]cjs[\\/]react-dom-client\.\w+\.js$/ },
      async ({ path }) => {
        let source = await readFile(path, "utf8");
        for (const { code, places, by } of removed) {
          const found = source.match(code)?.length ?? 0;
          if (found !== places) {
            throw new Error(
              `${path} has ${code} in ${found} places, not ${places}: check what changed`,
            );
          }
          source = source.replace(code, by);
        }
        return { contents: source, loader: "js" };
      },
    );
  },
};

const context = await esbuild.context({
  entryPoints: {
    main: join(here, "src/main.ts"),
    styles: join(here, "src/styles.css"),
  },
  outdir,
  bundle: true,
  format: "cjs",
  // Same target as Obsidian's sample plugin, for older mobile webviews.
  target: "es2018",
  // import() becomes Node's require, which reaches Node's modules on the desktop for certain:
  // Obsidian loads plugins as CommonJS, and a real import() there may not find them.
  supported: { "dynamic-import": false },
  jsx: "automatic",
  // The card face's font files go inside styles.css, which Obsidian installs by itself.
  loader: { ".woff2": "dataurl" },
  // Provided by Obsidian at runtime.
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ],
  // React checks this, and Obsidian on mobile has no `process`.
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  // Says where the source is, as the license asks, since people get only the built files.
  banner: { js: BANNER, css: BANNER },
  logLevel: "info",
  metafile: true,
  plugins: [copyManifest, bundledLicenses, noScriptLoading],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
