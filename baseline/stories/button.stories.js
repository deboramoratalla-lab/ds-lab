// Storybook stories for the baseline Button (CSF 3, @storybook/html).
import "../code/tokens.css";
import "../code/button.css";

export default {
  title: "Components/Button",
  args: { label: "Button", variant: "default", size: "medium" },
  argTypes: {
    variant: { control: "select", options: ["default", "primary", "danger", "invisible", "link"] },
    size: { control: "select", options: ["small", "medium", "large"] },
  },
  render: ({ label, variant, size }) =>
    `<button class="ds-Button" data-variant="${variant}" data-size="${size}">${label}</button>`,
};

export const Default = { args: { variant: "default" } };
export const Primary = { args: { variant: "primary" } };
export const Danger = { args: { variant: "danger" } };
export const Invisible = { args: { variant: "invisible" } };
export const Link = { args: { variant: "link" } };
export const Small = { args: { size: "small" } };
export const Medium = { args: { size: "medium" } };
export const Large = { args: { size: "large" } };
