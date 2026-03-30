/**
 * Figma REST API client.
 * Uses native fetch (Node 18+). No dependencies.
 */

export function createFigmaClient(token) {
  async function request(endpoint) {
    const url = `https://api.figma.com/v1${endpoint}`;
    const res = await fetch(url, {
      headers: { "X-Figma-Token": token },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Figma API ${res.status} on ${endpoint}: ${body}`);
    }
    return res.json();
  }

  return {
    /** Fetch file metadata (name, pages at depth 1) */
    async getFile(fileKey, depth = 1) {
      return request(`/files/${fileKey}?depth=${depth}`);
    },

    /** Fetch specific nodes from a file */
    async getNodes(fileKey, nodeId, depth = 10) {
      const data = await request(`/files/${fileKey}/nodes?ids=${nodeId}&depth=${depth}`);
      const node = Object.values(data.nodes || {})[0]?.document;
      if (!node) throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
      return node;
    },

    /** Fetch published styles from a file */
    async getStyles(fileKey) {
      const data = await request(`/files/${fileKey}/styles`);
      return data.meta?.styles || [];
    },

    /** Fetch published components from a file */
    async getComponents(fileKey) {
      const data = await request(`/files/${fileKey}/components`);
      return data.meta?.components || [];
    },

    /** Export a node as an image and return the Buffer */
    async getImage(fileKey, nodeId, { scale = 2, format = "png" } = {}) {
      const data = await request(`/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`);
      const imageUrl = Object.values(data.images || {})[0];
      if (!imageUrl) throw new Error("No image URL returned from Figma");

      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
