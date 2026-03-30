/**
 * Claude API client for structured data cleaning and analysis.
 * Uses native fetch (Node 18+). No dependencies.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function createClaudeClient(apiKey, { model = DEFAULT_MODEL } = {}) {
  async function request(messages, { maxTokens = 8192 } = {}) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  return {
    /** Send a prompt and get text back */
    async prompt(content, options) {
      return request([{ role: "user", content }], options);
    },

    /** Send a prompt and parse the response as JSON */
    async promptJSON(content, options) {
      const text = await request([{ role: "user", content }], options);
      const cleaned = text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
      return JSON.parse(cleaned);
    },
  };
}
