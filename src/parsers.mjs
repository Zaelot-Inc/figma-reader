/**
 * Figma node tree parsers.
 * Extract colors, text styles, components, and structure from raw Figma data.
 */

/** Convert Figma RGBA (0-1 floats) to hex string */
export function rgbaToHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/** Recursively extract unique solid fill colors from a node tree */
export function extractColors(node, colors = new Map()) {
  if (node.fills && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
        const hex = rgbaToHex(fill.color);
        const opacity = fill.opacity ?? fill.color.a ?? 1;
        const key = `${hex}@${opacity}`;
        if (!colors.has(key)) {
          colors.set(key, { name: node.name, hex, opacity, aliases: new Set() });
        }
        colors.get(key).aliases.add(node.name);
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      extractColors(child, colors);
    }
  }
  return colors;
}

/** Recursively extract text style definitions from a node tree */
export function extractTextStyles(node, styles = []) {
  if (node.type === "TEXT" && node.style) {
    const s = node.style;
    styles.push({
      name: node.name,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeightPx: s.lineHeightPx,
      letterSpacing: s.letterSpacing,
      textCase: s.textCase,
    });
  }
  if (node.children) {
    for (const child of node.children) {
      extractTextStyles(child, styles);
    }
  }
  return styles;
}

/** Recursively extract COMPONENT and COMPONENT_SET nodes */
export function extractComponents(node, components = []) {
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    const entry = {
      name: node.name,
      type: node.type,
      description: node.description || "",
    };
    if (node.type === "COMPONENT_SET" && node.children) {
      entry.variants = node.children
        .filter((c) => c.type === "COMPONENT")
        .map((c) => c.name);
    }
    components.push(entry);
  }
  if (node.type !== "COMPONENT_SET" && node.children) {
    for (const child of node.children) {
      extractComponents(child, components);
    }
  }
  return components;
}

/** Extract top-level structure (pages / frames) */
export function extractStructure(node) {
  if (!node.children) return [];
  return node.children.map((c) => ({
    name: c.name,
    type: c.type,
    children: c.children?.length || 0,
  }));
}

/** Slugify a name for filesystem use */
export function slugify(name) {
  return name
    .replace(/[\/\\]/g, "-")
    .replace(/[^a-zA-Z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}
