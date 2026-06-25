/**
 * figma-reader screenshot
 *
 * Exports just the rendered image of a Figma node — no blueprint, no raw JSON.
 * A lightweight subset of `extract` for when all you need is the picture.
 *
 * Output:
 *   <outDir>/[<namespace>/]<node-slug>/screenshot.<format>
 *
 * When a `namespace` is given (the file alias or key), output is grouped per
 * file so screenshots from different Figma files don't overwrite each other.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { slugify } from "./parsers.mjs";

/**
 * Export a Figma node as an image.
 *
 * @param {object} options
 * @param {ReturnType<import('./figma.mjs').createFigmaClient>} options.figma - Figma client
 * @param {string} options.fileKey - Figma file key
 * @param {string} options.nodeId - Node ID (colon-separated)
 * @param {string} options.outDir - Output directory
 * @param {string} [options.namespace] - Per-file subfolder (alias or file key); groups output by Figma file
 * @param {string} [options.name] - Override node name (used for the output folder slug)
 * @param {number} [options.scale=2] - Image scale factor (1-4)
 * @param {string} [options.format=png] - Image format (png | jpg | svg | pdf)
 * @param {function} [options.log] - Logging function
 * @returns {Promise<object>} Summary of the exported screenshot
 */
export async function screenshot({ figma, fileKey, nodeId, outDir, namespace, name, scale = 2, format = "png", log = () => {} }) {
  log(`Capturing screenshot of ${nodeId} from ${fileKey}`);

  // Resolve a name for the output folder. Use the override when given;
  // otherwise read just the node header (depth 1) — cheap, no full tree.
  let nodeName = name;
  if (!nodeName) {
    try {
      const node = await figma.getNodes(fileKey, nodeId, 1);
      nodeName = node.name;
    } catch (e) {
      log(`  Warning: could not read node name (${e.message}), using node ID`);
      nodeName = nodeId.replace(/:/g, "-");
    }
  }
  const slug = slugify(nodeName);

  log(`Fetching screenshot (scale ${scale}x, ${format})...`);
  const imageBuffer = await figma.getImage(fileKey, nodeId, { scale, format });
  log(`  Screenshot: ${Math.round(imageBuffer.length / 1024)}KB`);

  const baseDir = namespace ? join(outDir, slugify(namespace)) : outDir;
  const nodeDir = join(baseDir, slug);
  if (!existsSync(nodeDir)) mkdirSync(nodeDir, { recursive: true });

  const screenshotPath = join(nodeDir, `screenshot.${format}`);
  writeFileSync(screenshotPath, imageBuffer);

  log(`Output: ${screenshotPath}`);

  return {
    name: nodeName,
    slug,
    outputDir: nodeDir,
    screenshotPath,
    bytes: imageBuffer.length,
  };
}
