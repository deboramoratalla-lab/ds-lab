// Research callback for the agent: before proposing a new Button option, compare it with
// public design systems and WCAG (Tavily + Nemotron Super). Needs TAVILY_API_KEY.
import { extractComponent } from "../migrate/component.js";
import { benchmark } from "./benchmark.js";

export function buttonOptionResearch(buttonCss: string) {
  return async (axis: string, option: string) => {
    if (!process.env.TAVILY_API_KEY) return null;
    const spec = extractComponent("Button", buttonCss, "prc-Button-ButtonBase", ["data-variant", "data-size"]);
    const px = (v?: string) => { const f = v?.match(/([\d.]+)rem\)?$/)?.[1]; return f ? `${parseFloat(f) * 16}px` : v ?? "—"; };
    const st = spec.axes[axis]?.[option] ?? {};
    const scale: Record<string, string> = { medium: px(spec.base.height?.value) };
    for (const [k, v] of Object.entries(spec.axes[axis] ?? {})) if (k !== option) scale[k] = px(v.height?.value);
    return benchmark({ component: "Button", axis, option, scale,
      ours: { height: px(st.height?.value), paddingInline: px(st.padding?.value), gap: px(st.gap?.value), fontSize: px(st["font-size"]?.value) } });
  };
}
