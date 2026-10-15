import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const dist = resolve(root, "dist");
const files = ["index.html", "app.js", "styles.css", "logo.png", "og.png", "data.json"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(files.map(file => cp(resolve(root, file), resolve(dist, file))));
await cp(resolve(root, "assets"), resolve(dist, "assets"), { recursive: true });
