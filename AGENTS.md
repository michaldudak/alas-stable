# Workflow

Use the pnpm version pinned in `package.json` for dependencies and project scripts. Install with `pnpm install --frozen-lockfile`; run `pnpm run check` and `pnpm run build` for standard validation.

After each substantial change, run the relevant checks and create a Git commit describing the completed change.

## Language

Write all repository content in English, including documentation, code comments, identifiers, test descriptions, developer-facing messages, and commit messages. This rule applies even when the user or LLM prompt is in another language.

The only exception is player-readable strings, which should remain in the intended player language. Test selectors and fixtures that quote those strings must match the player-visible text.
