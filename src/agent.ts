import Anthropic from "@anthropic-ai/sdk";
export class APIValidatorAgent {
  private client: Anthropic;
  constructor(apiKey: string) { this.client = new Anthropic({ apiKey }); }
  async generateTests(specUrl: string): Promise<string[]> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514", max_tokens: 2048,
      messages: [{ role: "user", content: `Generate API test cases for this spec: ${specUrl}` }]
    });
    return [response.content[0].type === "text" ? response.content[0].text : ""];
  }
  async validateEndpoint(url: string, method: string, expected: number): Promise<boolean> {
    const axios = require("axios");
    const res = await axios({ method, url });
    return res.status === expected;
  }
}
