# Button
A button component with four variants (default, primary, danger, invisible), three sizes (small, medium, large), and consistent styling based on design tokens.

## When to use
- Use for user-triggered actions like form submissions, navigation, or toggling states.
- Choose a variant that matches the action's importance and context.

## When not to use
- Do not use as a standalone display element without an action.
- Avoid using for long-form content or paragraph-like text.

## Variants
- variant=default: Use for secondary or tertiary actions that need subtle visual presence.
- variant=primary: Use for the main call-to-action on a page or in a section.
- variant=danger: Use for destructive actions like deletion or removal.
- variant=invisible: Use when you need a button that behaves interactively but has no visual styling (e.g., icon-only buttons).

## Sizes
- size=small: Use in compact spaces like toolbars, tables, or dense UIs where vertical space is limited.
- size=medium: Use as the default size for most button interactions in standard layouts.
- size=large: Use for emphasis, touch-friendly targets, or when surrounding elements are large (e.g., hero sections).

## Tokens
- base-size-8
- base-text-weight-medium
- border-radius-medium
- border-width-thin
- button-danger-bg-color-rest
- button-danger-fg-color-rest
- button-default-bg-color-rest
- button-default-border-color-rest
- button-default-fg-color-rest
- button-default-shadow-resting
- button-invisible-border-color-rest
- button-primary-bg-color-rest
- button-primary-border-color-rest
- button-primary-fg-color-rest
- control-large-gap
- control-large-padding-inline-spacious
- control-large-size
- control-medium-padding-inline-normal
- control-medium-size
- control-small-gap
- control-small-padding-inline-condensed
- control-small-size
- fg-color-link
- shadow-resting-small
- text-body-size-medium
- text-body-size-small