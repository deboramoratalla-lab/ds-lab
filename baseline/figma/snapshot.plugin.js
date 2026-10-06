// Run with Figma's use_figma (Plugin API). Reads the baseline file and returns a snapshot:
// variables (resolved), Button bindings per variant, variant options and the component description.
// Pass SET_ID and COLLECTION_ID. Read-only.
const SET_ID = "1:49", COLLECTION_ID = "VariableCollectionId:1:2";
const col = await figma.variables.getVariableCollectionByIdAsync(COLLECTION_ID);
const mode = col.modes[0].modeId;
const h = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
const tokens = {};
for (const id of col.variableIds) {
  const v = await figma.variables.getVariableByIdAsync(id);
  const val = v.valuesByMode[mode];
  const name = (v.codeSyntax.WEB || "").replace(/^var\(--|\)$/g, "") || v.name.replace(/\//g, "-");
  tokens[name] = typeof val === "object" ? "#" + h(val.r) + h(val.g) + h(val.b) + ((val.a ?? 1) < 1 ? h(val.a) : "") : val;
}
const nameOf = async (alias) => {
  const a = Array.isArray(alias) ? alias[0] : alias;
  if (!a || !a.id) return null;
  const v = await figma.variables.getVariableByIdAsync(a.id);
  return (v.codeSyntax.WEB || "").replace(/^var\(--|\)$/g, "");
};
const set = await figma.getNodeByIdAsync(SET_ID);
const bindings = {};
for (const c of set.children) {
  const t = c.children[0];
  bindings[c.name] = {
    height: await nameOf(c.boundVariables.height), padX: await nameOf(c.boundVariables.paddingLeft),
    gap: await nameOf(c.boundVariables.itemSpacing), radius: await nameOf(c.boundVariables.topLeftRadius),
    bg: c.fills.length ? await nameOf(c.fills[0].boundVariables?.color) : null,
    border: await nameOf(c.strokes[0]?.boundVariables?.color),
    fg: await nameOf(t.fills[0].boundVariables?.color), font: await nameOf(t.boundVariables.fontSize),
  };
}
const options = Object.fromEntries(Object.entries(set.componentPropertyDefinitions)
  .filter(([, d]) => d.type === "VARIANT").map(([k, d]) => [k, d.variantOptions]));
return { takenAt: new Date().toISOString(), tokens, bindings, options, description: set.description };
