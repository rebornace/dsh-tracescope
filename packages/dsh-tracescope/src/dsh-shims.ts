/**
 * Ambient host types for out-of-tree DSH plugin typechecking.
 * Runtime Context comes from Cordis inside Desktop / Harness.
 */

export interface ToolContentBlock {
  type: string
  text: string
}

export interface ToolRegistration {
  name: string
  description: string
  /**
   * Authoring form: per-property map with optional `required: true`,
   * OR a full JSON Schema object (`type: "object"`).
   * `defineTool()` always projects to a root `{ type: "object", properties, required? }`
   * before registration — providers reject bare property maps / type null.
   */
  parameters: Record<string, unknown>
  /** Required by @deepseek-ai/dsh-tools register(). */
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: unknown) => ToolContentBlock[]
    presentationMeta?: (args: unknown, value: unknown) => unknown
  }
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

export interface CommandRegistration {
  name: string
  description: string
  input?: { hint?: string }
  handler: (invocation: {
    rawInput: string
  }) => Promise<{ kind: 'success' | 'error'; text: string }>
}

export interface WebServerRegistration {
  kind: 'exact' | 'prefix'
  path: string
  handler: (
    req: {
      method?: string
      url?: string
      headers: Record<string, string | string[] | undefined>
      on: (event: string, cb: (...args: never[]) => void) => void
      destroy?: () => void
    },
    res: { writeHead: Function; end: Function },
  ) => void | Promise<void>
}

export interface Context {
  tools: { register: (tool: ToolRegistration) => void }
  commands: { register: (command: CommandRegistration) => void }
  webServer?: { register: (route: WebServerRegistration) => () => void }
  effect?: (fn: () => void | (() => void), label?: string) => void
  /** Cordis service lookup (preferred over direct property access). */
  get?: (name: string) => unknown
  llm?: {
    stream: (options: Record<string, unknown>) => AsyncIterable<unknown>
    listProviders?: () => Array<{ id: string; name?: string }>
    listModels?: (provider: string) => Promise<Array<{ id: string; name?: string }>>
  }
  agentDefaultModel?: {
    currentSelection: () => { provider: string; model: string; reasoningEffort?: string }
  }
}

/**
 * Compile DSH authoring property-map into a provider-safe JSON Schema object.
 * Mirrors `@deepseek-ai/dsh-tools` `parameterSchemaSpecToJsonSchema`.
 */
export function compileToolParameters(spec: Record<string, unknown>): Record<string, unknown> {
  if (spec.type === 'object' && spec.properties && typeof spec.properties === 'object') {
    return spec
  }
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, raw] of Object.entries(spec)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const src = raw as Record<string, unknown>
    const prop: Record<string, unknown> = { ...src }
    if (prop.required === true) required.push(key)
    delete prop.required
    properties[key] = prop
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

export function defineTool(tool: ToolRegistration): ToolRegistration {
  return {
    ...tool,
    parameters: compileToolParameters(tool.parameters),
  }
}
