import type { TestCase, TestAssertion } from "./test-generator.js";

export interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  actualStatus: number;
  responseTimeMs: number;
  assertions: AssertionResult[];
  error?: string;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actual?: unknown;
}

export class TestExecutor {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async run(testCases: TestCase[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.executeTest(testCase);
      results.push(result);
    }

    return results;
  }

  private async executeTest(testCase: TestCase): Promise<TestResult> {
    const url = this.buildUrl(testCase);
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: testCase.method,
        headers: testCase.headers,
        body: testCase.body ? JSON.stringify(testCase.body) : undefined,
      });

      const responseTimeMs = Date.now() - startTime;
      const assertionResults = this.evaluateAssertions(
        testCase.assertions,
        response,
        responseTimeMs
      );

      return {
        testId: testCase.id,
        testName: testCase.name,
        passed: assertionResults.every((a) => a.passed),
        actualStatus: response.status,
        responseTimeMs,
        assertions: assertionResults,
      };
    } catch (error) {
      return {
        testId: testCase.id,
        testName: testCase.name,
        passed: false,
        actualStatus: 0,
        responseTimeMs: Date.now() - startTime,
        assertions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildUrl(testCase: TestCase): string {
    let path = testCase.endpoint;

    for (const [key, value] of Object.entries(testCase.pathParams)) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }

    const queryString = new URLSearchParams(testCase.queryParams).toString();
    const fullUrl = `${this.baseUrl}${path}`;

    return queryString ? `${fullUrl}?${queryString}` : fullUrl;
  }

  private evaluateAssertions(
    assertions: TestAssertion[],
    response: Response,
    responseTimeMs: number
  ): AssertionResult[] {
    return assertions.map((assertion) => {
      switch (assertion.type) {
        case "status":
          return {
            assertion,
            passed: response.status === assertion.value,
            actual: response.status,
          };
        case "responseTime":
          return {
            assertion,
            passed: responseTimeMs < (assertion.value as number),
            actual: responseTimeMs,
          };
        case "header":
          const headerValue = response.headers.get(assertion.field ?? "");
          return {
            assertion,
            passed: headerValue === assertion.value,
            actual: headerValue,
          };
        default:
          return { assertion, passed: true };
      }
    });
  }
}
