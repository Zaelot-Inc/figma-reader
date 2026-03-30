/**
 * figma-reader audit
 *
 * Compares a Figma DLS against a local codebase's design system files.
 * Uses Claude to produce a structured markdown diff report.
 *
 * Output:
 *   <outDir>/audit-<date>.md
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { extractColors, extractTextStyles, extractComponents, extractStructure } from "./parsers.mjs";

function readFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function listDir(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() ||
        d.name.endsWith(".js") ||
        d.name.endsWith(".ts") ||
        d.name.endsWith(".tsx") ||
        d.name.endsWith(".jsx"),
    )
    .map((d) => (d.isDirectory() ? `${d.name}/` : d.name));
}

function buildPrompt(figma, repo, config) {
  const colorList = [...figma.colors.values()].map((c) => ({
    name: c.name,
    hex: c.hex,
    opacity: c.opacity,
    aliases: c.aliases ? [...c.aliases].slice(0, 5) : [],
  }));

  const seenStyles = new Set();
  const uniqueTextStyles = figma.textStyles.filter((s) => {
    const key = `${s.fontSize}-${s.fontWeight}-${s.fontFamily}`;
    if (seenStyles.has(key)) return false;
    seenStyles.add(key);
    return true;
  });

  const repoSections = [];
  for (const [label, content] of Object.entries(repo.files)) {
    repoSections.push(`### ${label}\n\`\`\`\n${content || "// File not found"}\n\`\`\``);
  }
  for (const [label, items] of Object.entries(repo.directories)) {
    repoSections.push(`### ${label}\n${items.map((c) => "- " + c).join("\n") || "None found"}`);
  }

  return `You are auditing a codebase against its Figma Design Language System (DLS).
Produce a thorough, actionable audit report in markdown.

## Figma DLS Data

### Colors (${colorList.length} unique)
\`\`\`json
${JSON.stringify(colorList, null, 2)}
\`\`\`

### Text Styles (${uniqueTextStyles.length} unique)
\`\`\`json
${JSON.stringify(uniqueTextStyles, null, 2)}
\`\`\`

### Components (${figma.components.length})
\`\`\`json
${JSON.stringify(figma.components, null, 2)}
\`\`\`

### DLS Structure (top-level frames)
\`\`\`json
${JSON.stringify(figma.structure, null, 2)}
\`\`\`

## Codebase Data

${repoSections.join("\n\n")}

## Audit Instructions

Generate a structured report with these sections:

### 1. Color Audit
- Table: Figma color name | Figma hex | Closest repo constant | Repo hex | Match?
- List colors in Figma missing from repo
- List repo colors not represented in Figma
- Flag value mismatches (same intent, different hex)

### 2. Typography Audit
- Table: Figma style name | size/weight | Closest repo constant | repo size/weight | Match?
- Missing and orphaned text styles

### 3. Component Inventory
- Table: Figma component | Repo component | Status (matched/missing/extra)
- Note naming inconsistencies
- List Figma components missing from repo
- List repo components not in Figma

### 4. Spacing & Sizing
- Any spacing scale or grid system in the Figma DLS
- Compare against the repo's spacing approach
- Recommendations

### 5. Summary
- Overall alignment score (estimate %)
- Top 5 highest-priority gaps
- Quick wins vs larger efforts
- Recommendations for improving design-code consistency

Be precise with values. Use tables. Be actionable.`;
}

/**
 * Audit a Figma DLS against a local codebase.
 *
 * @param {object} options
 * @param {import('./figma.mjs').createFigmaClient} options.figma - Figma client
 * @param {import('./claude.mjs').createClaudeClient} options.claude - Claude client
 * @param {string} options.fileKey - Figma file key
 * @param {string} options.nodeId - DLS root node ID
 * @param {object} options.config - Project config with design system paths
 * @param {string} options.outDir - Output directory for the report
 * @param {number} [options.depth=6] - Node tree depth
 * @param {function} [options.log] - Logging function
 * @returns {Promise<string>} Path to the generated report
 */
export async function audit({ figma, claude, fileKey, nodeId, config, outDir, depth = 6, log = () => {} }) {
  const sourceRoot = config.sourceRoot || ".";

  log(`Auditing Figma DLS (${fileKey}, node ${nodeId}) against ${sourceRoot}`);

  // Step 1: Fetch Figma data
  log("Fetching Figma DLS data...");

  const [stylesRes, componentsRes, nodeTree] = await Promise.all([
    figma.getStyles(fileKey).catch((e) => {
      log(`  Warning: /styles failed (${e.message})`);
      return [];
    }),
    figma.getComponents(fileKey).catch((e) => {
      log(`  Warning: /components failed (${e.message})`);
      return [];
    }),
    figma.getNodes(fileKey, nodeId, depth),
  ]);

  const figmaData = {
    colors: extractColors(nodeTree),
    textStyles: extractTextStyles(nodeTree),
    components: extractComponents(nodeTree),
    publishedStyles: stylesRes,
    publishedComponents: componentsRes,
    structure: extractStructure(nodeTree),
  };

  log(
    `  Colors: ${figmaData.colors.size} | Text styles: ${figmaData.textStyles.length} | Components: ${figmaData.components.length}`,
  );

  // Step 2: Read repo design system files
  log("Reading codebase design system...");

  const repo = { files: {}, directories: {} };

  if (config.files) {
    for (const [label, relativePath] of Object.entries(config.files)) {
      repo.files[label] = readFile(join(sourceRoot, relativePath));
    }
  }

  if (config.directories) {
    for (const [label, relativePath] of Object.entries(config.directories)) {
      repo.directories[label] = listDir(join(sourceRoot, relativePath));
    }
  }

  // Step 3: Analyze with Claude
  log("Analyzing design-code alignment...");

  const prompt = buildPrompt(figmaData, repo, config);
  log(`  Prompt size: ~${Math.round(prompt.length / 1000)}k chars`);

  const analysis = await claude.prompt(prompt, { maxTokens: 12000 });

  // Step 4: Write report
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().split("T")[0];
  const reportPath = join(outDir, `audit-${timestamp}.md`);

  const report = `# Design System Audit — ${timestamp}

| Field | Value |
|---|---|
| **Figma file** | \`${fileKey}\` |
| **Node** | \`${nodeId}\` |
| **Source** | \`${sourceRoot}\` |

---

${analysis}
`;

  writeFileSync(reportPath, report);
  log(`Report saved: ${reportPath}`);

  return reportPath;
}
