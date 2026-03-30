# figma-reader

Extract and audit Figma design systems using the Figma REST API + Claude API.

Zero npm dependencies. Uses Node 18+ native `fetch`.

## What it does

| Command | Needs Claude API? | Description |
|---|---|---|
| `init` | No | Create `.figma-reader.json` from a Figma URL, auto-detect project files |
| `browse` | No | Navigate a Figma file: pages, frames, components, styles |
| `extract` | Yes | Fetch a component → clean blueprint + screenshot |
| `audit` | Yes | Compare Figma DLS against your codebase → markdown report |

## Why not a Figma MCP?

A Figma MCP injects raw Figma JSON directly into your AI session context. A single component can be 50k-130k tokens of noise. This tool:

1. Fetches from Figma API (free — uses Personal Access Token)
2. Cleans the data with a cheap Claude Sonnet call (~$0.02)
3. Exports a screenshot (free — Figma Image API)
4. Delivers only clean, structured data to your session

**Result: ~96% less data in your context window.**

## Install

```bash
# Install globally from GitHub
npm install -g github:Zaelot-Inc/figma-reader

# Or with pnpm
pnpm add -g github:Zaelot-Inc/figma-reader
```

Then use it anywhere:

```bash
figma-reader --help
figma-reader init --url "https://www.figma.com/design/..."
figma-reader browse --components
figma-reader extract --node-id 1:3595
```

### Environment variables

```bash
export FIGMA_TOKEN=your-figma-personal-access-token
export ANTHROPIC_API_KEY=your-anthropic-api-key
```

Get a Figma token: **Figma > Settings > Personal Access Tokens > Generate**

The token only needs **read-only** access. When creating it, select these scopes:

| Scope | Permission | Why |
|---|---|---|
| **File content** | Read only | Read node trees, pages, frames |
| **File metadata** | Read only | File name, last modified date |

No write permissions are needed. figma-reader never modifies your Figma files.

### Alternative: run without installing

```bash
npx github:Zaelot-Inc/figma-reader --help
```

## Quick start

```bash
# 1. Init config from a Figma URL (auto-detects your project's design system files)
figma-reader init --url "https://www.figma.com/design/ABC123/My-DLS?node-id=1-2"

# 2. Browse the Figma file
figma-reader browse
figma-reader browse --node-id 1:9133
figma-reader browse --components

# 3. Extract a component into a blueprint + screenshot
figma-reader extract --node-id 1:3595

# 4. Audit the full DLS against your codebase
figma-reader audit
```

## Using with AI coding tools

The whole point of figma-reader is to feed clean Figma data into AI tools without burning context on raw JSON. Here's how to use it with each tool.

### Claude Code

Run `extract` first, then point Claude Code at the output:

```bash
# Extract the component
figma-reader extract --node-id 1:3595

# Then in Claude Code, ask it to read the files
# "Read .figma-reader/buttons/blueprint.json and .figma-reader/buttons/screenshot.png
#  and build this component as a React Native component in src/components/Button/"
```

Or use it from a custom slash command. Create `.claude/commands/figma-build.md`:

```markdown
---
name: figma-build
description: Build a component from a Figma blueprint
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---
<steps>
1. Ask the user for the Figma node ID (from the URL).
2. Run: `figma-reader extract --node-id "<node-id>"`
3. Read the blueprint: `.figma-reader/<component>/blueprint.json`
4. View the screenshot: `.figma-reader/<component>/screenshot.png`
5. Read the existing design system files (colors, typography) to map tokens.
6. Generate the component following the project's conventions.
</steps>
```

For audits, ask Claude Code to read the report:

```bash
figma-reader audit
# "Read .figma-reader/audit-2025-01-15.md and fix the top 3 color mismatches"
```

### Cursor

Extract the component, then reference the outputs in Cursor's chat or composer:

```bash
figma-reader extract --node-id 1:3595
```

In Cursor chat:
```
@.figma-reader/buttons/blueprint.json @.figma-reader/buttons/screenshot.png
Build this component as a React component in src/components/Button.tsx
using our existing design tokens from src/theme/colors.ts
```

For audits:
```
@.figma-reader/audit-2025-01-15.md
Fix the color mismatches listed in section 1.4
```

You can also add a Cursor rule in `.cursor/rules`:
```
When building components from Figma blueprints (.figma-reader/*/blueprint.json):
- Always map colors to existing design tokens, never hardcode hex values
- Use the screenshot as visual reference for layout accuracy
- Implement all variants listed in the blueprint as component props
```

### Codex (OpenAI)

Codex works with file context. Extract first, then reference:

```bash
figma-reader extract --node-id 1:3595
```

Then in Codex:
```
Read .figma-reader/buttons/blueprint.json and .figma-reader/buttons/screenshot.png.
Build a React component matching this Figma blueprint.
Use the design tokens from src/theme/colors.ts.
Implement all 12 variants as props (enabled, type, size).
```

### Windsurf

Same pattern — extract, then reference in Cascade:

```bash
figma-reader extract --node-id 1:3595
```

```
@.figma-reader/buttons/blueprint.json @.figma-reader/buttons/screenshot.png
Implement this button component with all variants.
Follow our existing component patterns in src/components/.
```

### Any AI tool (generic)

The workflow is always:

```
1. figma-reader extract --node-id <id>     →  blueprint.json + screenshot.png
2. Give both files to your AI tool
3. AI reads the structured spec + sees the visual reference
4. AI generates code matching the design
```

The `blueprint.json` format is framework-agnostic. It uses flexbox layout, hex colors, and pixel values that map directly to CSS, React Native StyleSheet, SwiftUI, Jetpack Compose, or any UI framework.

### CI/CD integration

Run audits in CI to catch design drift:

```yaml
# .github/workflows/design-audit.yml
name: Design System Audit
on:
  schedule:
    - cron: '0 9 * * 1'  # Every Monday at 9am
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Install figma-reader
        run: npm install -g github:Zaelot-Inc/figma-reader
      - name: Run audit
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: figma-reader audit
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: design-audit
          path: .figma-reader/audit-*.md
```

## Commands

### `init`

Create a `.figma-reader.json` config file:

```bash
figma-reader init --url "https://www.figma.com/design/FILE_KEY/Name?node-id=1-2"
figma-reader init --file-key FILE_KEY --node-id 1:2
```

Auto-detects design system files in your project (colors, typography, components).

### `browse`

Navigate a Figma file from the terminal:

```bash
figma-reader browse                          # List pages
figma-reader browse --node-id 1:2            # Drill into a page/frame
figma-reader browse --components             # List all published component sets
figma-reader browse --styles                 # List all published styles
```

Shows node IDs you can copy directly into `extract` or `audit`.

### `extract`

Fetch a Figma component and produce a clean blueprint:

```bash
figma-reader extract --node-id 1:3595
figma-reader extract --node-id 1:3595 --name "MyButton"
```

Output in `.figma-reader/<component>/`:
- `blueprint.json` — clean component spec (layout, styles, children, variants)
- `screenshot.png` — rendered image of the component
- `raw.json` — original Figma data (for debugging)

### `audit`

Compare a Figma DLS against your codebase:

```bash
figma-reader audit
figma-reader audit --node-id 1:9407 --source ./src
```

Output: `.figma-reader/audit-YYYY-MM-DD.md` with:
- Color audit (Figma vs repo, mismatches, missing tokens)
- Typography audit (font sizes, weights, line heights)
- Component inventory (matched, missing, extra)
- Spacing analysis
- Overall alignment score + prioritized recommendations

## Config file

Place `.figma-reader.json` in your project root (or run `init` to generate it):

```json
{
  "fileKey": "your-figma-file-key",
  "nodeId": "1:9407",
  "sourceRoot": "./src",
  "outDir": ".figma-reader",
  "claudeModel": "claude-sonnet-4-6",
  "files": {
    "Colors": "constants/theme.js",
    "Typography": "constants/styles.js"
  },
  "directories": {
    "Components": "components/",
    "Screen Components": "screens/components/"
  }
}
```

## Blueprint format

The `blueprint.json` output is framework-agnostic:

```json
{
  "name": "Buttons",
  "description": "Multi-variant button supporting fill, stroke, and text styles",
  "type": "component_set",
  "variants": [
    { "name": "Enabled=on, Type=Fill, Size=big", "props": { "enabled": "on", "type": "Fill", "size": "big" } }
  ],
  "layout": {
    "type": "flex",
    "direction": "row",
    "padding": { "top": 8, "right": 16, "bottom": 8, "left": 16 },
    "gap": 8
  },
  "styles": {
    "backgroundColor": "#E9E9E9",
    "borderRadius": 50
  },
  "children": [
    {
      "type": "text",
      "name": "label",
      "styles": { "color": "#3259B8", "fontSize": 16, "fontWeight": "400" }
    }
  ],
  "variantStyles": {
    "Fill_on": { "backgroundColor": "#E9E9E9", "labelColor": "#3259B8" },
    "Stroke_on": { "borderColor": "#3259B8", "labelColor": "#3259B8" }
  }
}
```

## Options

| Flag | Description | Default |
|---|---|---|
| `--file-key KEY` | Figma file key | from config |
| `--node-id ID` | Node ID (supports `1-234` and `1:234`) | from config |
| `--url URL` | Figma URL (init/browse — extracts file key and node ID) | — |
| `--name NAME` | Override component name (extract) | from Figma |
| `--depth N` | Node tree depth | 10 (extract), 6 (audit), 2 (browse) |
| `--out DIR` | Output directory | `.figma-reader/` |
| `--source DIR` | Codebase source root (audit) | `.` |
| `--model MODEL` | Claude model | `claude-sonnet-4-6` |
| `--components` | List published components (browse) | — |
| `--styles` | List published styles (browse) | — |

## Requirements

- Node.js >= 18 (native fetch)
- `FIGMA_TOKEN` — [Figma Personal Access Token](https://www.figma.com/developers/api#access-tokens)
- `ANTHROPIC_API_KEY` — [Anthropic API key](https://console.anthropic.com/) (only for extract/audit)

## License

MIT
