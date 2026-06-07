import type { ApiEndpoint, ParsedSpec } from "./spec-parser.js";

export interface TestCase {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  pathParams: Record<string, string>;
  body?: unknown;
  expectedStatus: number;
  assertions: TestAssertion[];
}

export interface TestAssertion {
  type: "status" | "header" | "body" | "responseTime";
  field?: string;
  operator: "equals" | "contains" | "exists" | "lessThan";
  value: unknown;
}

export class TestGenerator {
  async generate(spec: ParsedSpec, maxTests: number): Promise<TestCase[]> {
    const testCases: TestCase[] = [];

    for (const endpoint of spec.endpoints) {
      if (testCases.length >= maxTests) break;

      testCases.push(...this.generateForEndpoint(endpoint));
    }

    return testCases.slice(0, maxTests);
  }

  private generateForEndpoint(endpoint: ApiEndpoint): TestCase[] {
    const cases: TestCase[] = [];
    const baseName = endpoint.operationId ?? `${endpoint.method} ${endpoint.path}`;

    // Happy path test
    cases.push({
      id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${baseName} — happy path`,
      endpoint: endpoint.path,
      method: endpoint.method,
      headers: { "Content-Type": "application/json" },
      queryParams: this.generateQueryParams(endpoint),
      pathParams: this.generatePathParams(endpoint),
      body: endpoint.requestBody ? this.generateRequestBody(endpoint) : undefined,
      expectedStatus: this.inferSuccessStatus(endpoint),
      assertions: [
        { type: "status", operator: "equals", value: this.inferSuccessStatus(endpoint) },
        { type: "responseTime", operator: "lessThan", value: 5000 },
      ],
    });

    // Missing required params test (if applicable)
    const requiredParams = endpoint.parameters.filter((p) => p.required);
    if (requiredParams.length > 0) {
      cases.push({
        id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `${baseName} — missing required params`,
        endpoint: endpoint.path,
        method: endpoint.method,
        headers: { "Content-Type": "application/json" },
        queryParams: {},
        pathParams: {},
        body: undefined,
        expectedStatus: 400,
        assertions: [
          { type: "status", operator: "equals", value: 400 },
        ],
      });
    }

    return cases;
  }

  private generateQueryParams(endpoint: ApiEndpoint): Record<string, string> {
    const params: Record<string, string> = {};
    for (const param of endpoint.parameters.filter((p) => p.in === "query")) {
      params[param.name] = this.generateValue(param.schema);
    }
    return params;
  }

  private generatePathParams(endpoint: ApiEndpoint): Record<string, string> {
    const params: Record<string, string> = {};
    for (const param of endpoint.parameters.filter((p) => p.in === "path")) {
      params[param.name] = this.generateValue(param.schema);
    }
    return params;
  }

  private generateRequestBody(endpoint: ApiEndpoint): Record<string, unknown> {
    const schema = endpoint.requestBody?.schema ?? {};
    return this.generateObjectFromSchema(schema);
  }

  private generateValue(schema: Record<string, unknown>): string {
    const type = schema.type as string;
    switch (type) {
      case "integer":
      case "number":
        return "1";
      case "boolean":
        return "true";
      default:
        return "test-value";
    }
  }

  private generateObjectFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return {};

    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = this.generateValue(propSchema);
    }
    return result;
  }

  private inferSuccessStatus(endpoint: ApiEndpoint): number {
    const successCodes = Object.keys(endpoint.responses).filter((s) => s.startsWith("2"));
    if (successCodes.length > 0) return parseInt(successCodes[0], 10);
    return endpoint.method === "POST" ? 201 : 200;
  }
}
