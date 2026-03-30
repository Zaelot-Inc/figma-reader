/**
 * figma-reader extract
 *
 * Fetches a Figma component, cleans the raw JSON into a structured
 * blueprint using Claude, and exports a screenshot.
 *
 * Output:
 *   <outDir>/<component-slug>/
 *     blueprint.json   — cleaned component spec
 *     screenshot.png   — rendered component image
 *     raw.json         — original Figma node data
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { slugify } from "./parsers.mjs";

const CLEAN_PROMPT = (componentName, rawJson) => `You are a design-to-code translator. Extract a clean, structured blueprint from this raw Figma component JSON.

## Raw Figma Node: "${componentName}"
\`\`\`json
${rawJson}
\`\`\`

## Instructions

Return a JSON object (no markdown fences, just raw JSON) with this exact structure:

{
  "name": "ComponentName in PascalCase",
  "description": "What this component does in one sentence",
  "type": "component | component_set",
  "variants": [
    {
      "name": "variant name",
      "props": { "propName": "value" }
    }
  ],
  "layout": {
    "type": "flex",
    "direction": "row | column",
    "justify": "flex-start | center | space-between | flex-end",
    "align": "flex-start | center | stretch | flex-end",
    "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
    "gap": 0,
    "width": "auto | fixed number | fill",
    "height": "auto | fixed number | fill"
  },
  "styles": {
    "backgroundColor": "#HEX or null",
    "borderRadius": 0,
    "borderWidth": 0,
    "borderColor": "#HEX or null",
    "opacity": 1,
    "shadow": null
  },
  "children": [
    {
      "type": "text | image | icon | container | input | button",
      "name": "semantic name",
      "content": "text content if text node",
      "layout": { ... },
      "styles": {
        "color": "#HEX",
        "fontSize": 16,
        "fontWeight": "400 | 500 | 600 | 700",
        "lineHeight": 22,
        "letterSpacing": 0
      },
      "children": [ ... ]
    }
  ],
  "figmaMetadata": {
    "nodeId": "original node ID",
    "componentSetId": "parent component set ID if variant",
    "originalSize": { "width": 0, "height": 0 }
  }
}

Rules:
- Convert Figma auto-layout to flexbox (layoutMode VERTICAL = column, HORIZONTAL = row)
- Convert Figma fills to backgroundColor hex (multiply 0-1 values by 255)
- Convert Figma effects to shadow objects
- Convert Figma padding (paddingTop/Right/Bottom/Left) to the padding object
- itemSpacing becomes gap
- For text nodes: extract the full style (fontSize, fontWeight, fontFamily, lineHeight, letterSpacing, color)
- Strip all Figma internal IDs, plugin data, and metadata noise
- If the node is a COMPONENT_SET, extract all variants with their properties
- Name children semantically (e.g., "title", "subtitle", "icon", "avatar", not "Text 1", "Rectangle 3")
- Use absolute pixel values, not relative
- If a child is an icon (vector/svg), mark type as "icon" and include the original Figma name as a hint

Return ONLY the JSON object. No explanation, no markdown.`;

/**
 * Extract a Figma component into a clean blueprint + screenshot.
 *
 * @param {object} options
 * @param {import('./figma.mjs').createFigmaClient} options.figma - Figma client
 * @param {import('./claude.mjs').createClaudeClient} options.claude - Claude client
 * @param {string} options.fileKey - Figma file key
 * @param {string} options.nodeId - Node ID (colon-separated)
 * @param {string} options.outDir - Output directory
 * @param {string} [options.name] - Override component name
 * @param {number} [options.depth=10] - Node tree depth
 * @param {function} [options.log] - Logging function
 * @returns {Promise<object>} Summary of extracted files
 */
export async function extract({ figma, claude, fileKey, nodeId, outDir, name, depth = 10, log = () => {} }) {
  log(`Extracting component ${nodeId} from ${fileKey}`);

  // Step 1: Fetch node data + screenshot in parallel
  log("Fetching component data and screenshot...");

  const [nodeTree, imageBuffer] = await Promise.all([
    figma.getNodes(fileKey, nodeId, depth),
    figma.getImage(fileKey, nodeId).catch((e) => {
      log(`  Warning: screenshot failed (${e.message})`);
      return null;
    }),
  ]);

  const componentName = name || nodeTree.name || "Unknown";
  const slug = slugify(componentName);

  log(`  Component: "${componentName}" (${nodeTree.type})`);
  if (nodeTree.children) log(`  Children: ${nodeTree.children.length}`);
  if (imageBuffer) log(`  Screenshot: ${Math.round(imageBuffer.length / 1024)}KB`);

  // Step 2: Clean with Claude
  log("Cleaning raw data into structured blueprint...");

  const rawJson = JSON.stringify(nodeTree, null, 2).slice(0, 80000);
  const blueprint = await claude.promptJSON(CLEAN_PROMPT(componentName, rawJson));

  log(`  Blueprint: ${blueprint.name} (${blueprint.children?.length || 0} children)`);
  if (blueprint.variants?.length) {
    log(`  Variants: ${blueprint.variants.length}`);
  }

  // Step 3: Write output files
  const componentDir = join(outDir, slug);
  if (!existsSync(componentDir)) mkdirSync(componentDir, { recursive: true });

  const blueprintPath = join(componentDir, "blueprint.json");
  writeFileSync(blueprintPath, JSON.stringify(blueprint, null, 2));

  let screenshotPath = null;
  if (imageBuffer) {
    screenshotPath = join(componentDir, "screenshot.png");
    writeFileSync(screenshotPath, imageBuffer);
  }

  const rawPath = join(componentDir, "raw.json");
  writeFileSync(rawPath, JSON.stringify(nodeTree, null, 2));

  log(`Output: ${componentDir}/`);

  return {
    name: blueprint.name,
    slug,
    outputDir: componentDir,
    blueprintPath,
    screenshotPath,
    rawPath,
    type: blueprint.type,
    variants: blueprint.variants?.length || 0,
    children: blueprint.children?.length || 0,
  };
}
