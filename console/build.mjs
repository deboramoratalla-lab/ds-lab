// Inlines console/data.json into console/app.html → console/index.html (one self-contained page).
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
const d = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
const sb = new URL("./lab-sandbox.json", import.meta.url);
if (existsSync(sb)) d.sandboxLab = JSON.parse(readFileSync(sb, "utf8"));
const data = JSON.stringify(d).replace(/</g, "\\u003c");
const html = readFileSync(new URL("./app.html", import.meta.url), "utf8").replace("__DATA__", () => data);
writeFileSync(new URL("./index.html", import.meta.url), html);
console.log("console/index.html", (html.length / 1024).toFixed(0) + " KB");
