import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export interface ApiEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  parameters: ParameterDef[];
  requestBody?: RequestBodyDef;
  responses: Record<string, ResponseDef>;
}

export interface ParameterDef {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required: boolean;
  schema: Record<string, unknown>;
}

export interface RequestBodyDef {
  required: boolean;
  contentType: string;
  schema: Record<string, unknown>;
}

export interface ResponseDef {
  description: string;
  schema?: Record<string, unknown>;
}

export interface ParsedSpec {
  title: string;
  version: string;
  baseUrl?: string;
  endpoints: ApiEndpoint[];
}

export class SpecParser {
  async parse(specPath: string): Promise<ParsedSpec> {
    const content = await this.loadSpec(specPath);
    return this.parseOpenApi3(content);
  }

  private async loadSpec(specPath: string): Promise<Record<string, unknown>> {
    if (specPath.startsWith("http://") || specPath.startsWith("https://")) {
      const response = await fetch(specPath);
      const text = await response.text();
      return this.parseContent(text);
    }

    const fileContent = await readFile(specPath, "utf-8");
    return this.parseContent(fileContent);
  }

  private parseContent(content: string): Record<string, unknown> {
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return parseYaml(content) as Record<string, unknown>;
    }
  }

  private parseOpenApi3(spec: Record<string, unknown>): ParsedSpec {
    const info = spec.info as Record<string, string> | undefined;
    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
    const servers = spec.servers as Array<{ url: string }> | undefined;

    const endpoints: ApiEndpoint[] = [];

    if (paths) {
      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (["get", "post", "put", "patch", "delete"].includes(method)) {
            const op = operation as Record<string, unknown>;
            endpoints.push({
              path,
              method: method.toUpperCase(),
              operationId: op.operationId as string | undefined,
              summary: op.summary as string | undefined,
              parameters: this.extractParameters(op.parameters as unknown[]),
              requestBody: this.extractRequestBody(op.requestBody as Record<string, unknown>),
              responses: this.extractResponses(op.responses as Record<string, unknown>),
            });
          }
        }
      }
    }

    return {
      title: info?.title ?? "Unknown API",
      version: info?.version ?? "0.0.0",
      baseUrl: servers?.[0]?.url,
      endpoints,
    };
  }

  private extractParameters(params?: unknown[]): ParameterDef[] {
    if (!params) return [];
    return params.map((p) => {
      const param = p as Record<string, unknown>;
      return {
        name: param.name as string,
        in: param.in as ParameterDef["in"],
        required: (param.required as boolean) ?? false,
        schema: (param.schema as Record<string, unknown>) ?? {},
      };
    });
  }

  private extractRequestBody(body?: Record<string, unknown>): RequestBodyDef | undefined {
    if (!body) return undefined;
    const content = body.content as Record<string, Record<string, unknown>> | undefined;
    if (!content) return undefined;

    const contentType = Object.keys(content)[0] ?? "application/json";
    const mediaType = content[contentType];

    return {
      required: (body.required as boolean) ?? false,
      contentType,
      schema: (mediaType?.schema as Record<string, unknown>) ?? {},
    };
  }

  private extractResponses(responses?: Record<string, unknown>): Record<string, ResponseDef> {
    if (!responses) return {};
    const result: Record<string, ResponseDef> = {};

    for (const [status, response] of Object.entries(responses)) {
      const res = response as Record<string, unknown>;
      result[status] = {
        description: (res.description as string) ?? "",
        schema: res.schema as Record<string, unknown> | undefined,
      };
    }

    return result;
  }
}
