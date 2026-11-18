// MapLibre draws the map in a background "worker" script that the browser must load from
// our own site. The bundler does not pick that file up by itself, so this copies it from
// node_modules into public/ before every dev run and build. Copying (instead of committing
// the file) keeps it in step with whichever maplibre-gl version is installed.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
