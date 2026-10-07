// Inlines console/data.json into console/app.html → console/index.html (one self-contained page).
import { readFileSync, writeFileSync } from "node:fs";
const data = readFileSync(new URL("./data.json", import.meta.url), "utf8").replace(/</g, "\\u003c");
const html = readFileSync(new URL("./app.html", import.meta.url), "utf8").replace("__DATA__", () => data);
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("console/index.html", (html.length / 1024).toFixed(0) + " KB");
