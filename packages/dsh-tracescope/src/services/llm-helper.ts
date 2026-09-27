/**
 * Defensive wrapper around the host's `llm` service.
 *
 * The host ships the real implementation/types, which are not present when
 * typechecking out of tree, so this module:
 *  - resolves the service through Cordis injection (`ctx.get('llm')`) rather
 *    than reading `ctx.llm` directly (that throws "without inject");
 *  - resolves the agent's default provider/model when not supplied;
 *  - consumes the async iterable generically, accepting the chunk shapes
 *    providers commonly emit (plain strings, `{text}`, `{content}`, `{delta}`).
 */
import type { Context } from '../dsh-shims.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type LlmStreamFn = (options: Record<string, unknown>) => AsyncIterable<unknown>

interface LlmService {
  stream: LlmStreamFn
}

/** Resolve the host LLM service through Cordis injection. */
function resolveHostLlmService(ctx: Context): LlmService | undefined {
  if (typeof ctx.get === 'function') {
    const service = ctx.get('llm') as { stream?: LlmStreamFn } | undefined
    if (service && typeof service.stream === 'function') {
      return { stream: service.stream.bind(service) }
    }
  }
  // Fallback for hosts that expose llm as a plain (non-Cordis) property.
  const direct = ctx.llm
  if (direct && typeof direct.stream === 'function') return direct
  return undefined
}

/** Resolve the agent's current default provider/model selection. */
function resolveDefaultModel(
  ctx: Context,
): { provider?: string; model?: string } | undefined {
  try {
    const holder =
      (typeof ctx.get === 'function'
        ? (ctx.get('agentDefaultModel') as { currentSelection?: () => unknown } | undefined)
        : undefined) ?? ctx.agentDefaultModel
    return holder?.currentSelection?.() as { provider?: string; model?: string } | undefined
  } catch {
    return undefined
  }
}

/** Extract text from whatever shape a streamed chunk takes. */
function chunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk
  if (!chunk || typeof chunk !== 'object') return ''
  const c = chunk as Record<string, unknown>
  // OpenAI-like choices[].delta.content.
  if (Array.isArray(c.choices)) {
    const delta = (c.choices as Array<Record<string, unknown>>)[0]?.delta as
      | Record<string, unknown>
      | undefined
    if (typeof delta?.content === 'string') return delta.content
  }
  // Finish/error markers carry no content.
  if (c.type === 'finish') return ''
  if (typeof c.text === 'string') return c.text
  if (typeof c.content === 'string') return c.content
  if (typeof c.delta === 'string') return c.delta
  if (c.delta && typeof c.delta === 'object') {
    const d = c.delta as Record<string, unknown>
    if (typeof d.content === 'string') return d.content
  }
  return ''
}

export interface CompleteOptions {
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Run a completion over the host LLM and return the full assistant text.
 * Throws a clear error when the service is unavailable, the call is refused,
 * or the stream is empty, so callers can degrade gracefully.
 */
export async function completeWithHostLlm(
  ctx: Context,
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  const llm = resolveHostLlmService(ctx)
  if (!llm) throw new Error('当前环境未提供可用的大模型服务（llm）')

  const defaults = resolveDefaultModel(ctx)
  const provider = options.provider ?? defaults?.provider
  const model = options.model ?? defaults?.model

  const payload: Record<string, unknown> = {
    messages,
    temperature: options.temperature ?? 0.2,
  }
  // Both are required: omitting provider yields "no adapter for undefined";
  // omitting model makes the call finish immediately with no content.
  if (provider) payload.provider = provider
  if (model) payload.model = model

  let stream: AsyncIterable<unknown>
  try {
    stream = llm.stream(payload)
  } catch (error) {
    throw new Error(`大模型调用失败：${(error as Error).message}`)
  }

  const maxTokens = options.maxTokens ?? 4000
  let output = ''
  for await (const chunk of stream) {
    output += chunkText(chunk)
    if (output.length >= maxTokens) break
  }
  if (!output.trim()) throw new Error('大模型未返回任何内容（可能是网络或通道异常）')
  return output
}

/** Strip a code fence the model may wrap around JSON. */
export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] ?? '' : text
  return body.trim()
}
