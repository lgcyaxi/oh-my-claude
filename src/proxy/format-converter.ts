/**
 * Anthropic ↔ OpenAI format conversion for proxy routing
 *
 * When the proxy switches to an OpenAI-format provider (OpenAI),
 * it must convert:
 * 1. Anthropic Messages API request → OpenAI Chat Completions request
 * 2. OpenAI SSE streaming response → Anthropic SSE streaming response
 *
 * This enables Claude Code (which speaks Anthropic API) to transparently
 * use OpenAI-format providers via the proxy.
 */

import { randomUUID } from "node:crypto";

// ── Request Conversion (Anthropic → OpenAI) ──────────────────────────

interface AnthropicContentBlock {
  type: string;
  text?: string;
  source?: { type: string; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface AnthropicMessage {
  role: string;
  content: string | AnthropicContentBlock[];
}

interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Convert an Anthropic Messages API request body to OpenAI Chat Completions format.
 *
 * Handles:
 * - system field → system role message
 * - Content block arrays → simplified content
 * - Image blocks → OpenAI image_url format
 * - Tool use/result blocks → OpenAI tool calls format
 * - Strips thinking config (not supported by OpenAI-format providers)
 */
export function convertAnthropicToOpenAI(
  body: Record<string, unknown>,
  targetModel: string
): Record<string, unknown> {
  const messages: OpenAIMessage[] = [];

  // Convert system field to system message
  const system = body.system;
  if (system) {
    if (typeof system === "string") {
      messages.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      // Anthropic system can be array of content blocks
      const text = (system as AnthropicContentBlock[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n\n");
      if (text) {
        messages.push({ role: "system", content: text });
      }
    }
  }

  // Convert messages
  const anthropicMessages = (body.messages ?? []) as AnthropicMessage[];
  for (const msg of anthropicMessages) {
    const converted = convertMessage(msg);
    if (converted.length > 0) {
      messages.push(...converted);
    }
  }

  const result: Record<string, unknown> = {
    model: targetModel,
    messages,
    stream: body.stream ?? true,
  };

  // Map compatible fields
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop_sequences !== undefined) result.stop = body.stop_sequences;

  // Convert tools if present
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    result.tools = (tools as Array<Record<string, unknown>>).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  return result;
}

/**
 * Convert a single Anthropic message to one or more OpenAI messages.
 * Tool use blocks become separate assistant messages with tool_calls.
 * Tool result blocks become tool role messages.
 */
function convertMessage(msg: AnthropicMessage): OpenAIMessage[] {
  // Simple string content
  if (typeof msg.content === "string") {
    return [{ role: msg.role, content: msg.content }];
  }

  if (!Array.isArray(msg.content)) {
    return [{ role: msg.role, content: msg.content as string }];
  }

  const blocks = msg.content as AnthropicContentBlock[];

  // Check if this message contains tool use blocks (assistant)
  const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
  const toolResultBlocks = blocks.filter((b) => b.type === "tool_result");

  // If tool results, convert each to a separate tool message
  if (toolResultBlocks.length > 0 && msg.role === "user") {
    const results: OpenAIMessage[] = [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? (block.content as AnthropicContentBlock[])
                .filter((b) => b.type === "text")
                .map((b) => b.text ?? "")
                .join("\n")
            : JSON.stringify(block.content ?? "");
        results.push({
          role: "tool",
          tool_call_id: block.tool_use_id ?? "",
          content,
        });
      } else if (block.type === "text" && block.text) {
        // Text alongside tool results → user message
        results.push({ role: "user", content: block.text });
      }
    }
    return results;
  }

  // If tool use blocks (assistant message)
  if (toolUseBlocks.length > 0 && msg.role === "assistant") {
    // Collect text content and tool calls
    const textParts = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("");

    const toolCalls: OpenAIToolCall[] = toolUseBlocks.map((b) => ({
      id: b.id ?? randomUUID(),
      type: "function" as const,
      function: {
        name: b.name ?? "",
        arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {}),
      },
    }));

    return [{
      role: "assistant",
      content: textParts || null,
      tool_calls: toolCalls,
    }];
  }

  // Regular content blocks — convert to OpenAI format
  const hasImages = blocks.some((b) => b.type === "image");
  if (hasImages) {
    // Use multimodal content format
    const parts: OpenAIContentPart[] = [];
    for (const block of blocks) {
      if (block.type === "text" && block.text) {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "image" && block.source) {
        parts.push({
          type: "image_url",
          image_url: {
            url: `data:${block.source.media_type};base64,${block.source.data}`,
          },
        });
      }
      // Skip thinking, redacted_thinking, tool_reference, etc.
    }
    return [{ role: msg.role, content: parts }];
  }

  // Text-only — join into a single string
  const text = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");

  return [{ role: msg.role, content: text || "" }];
}


// ── Streaming Response Conversion (OpenAI SSE → Anthropic SSE) ────────

/**
 * TransformStream that converts OpenAI streaming SSE events
 * to Anthropic Messages API SSE format.
 *
 * OpenAI sends: data: {"choices":[{"delta":{"content":"text"}}]}
 * Anthropic expects: event: content_block_delta\ndata: {"type":"content_block_delta",...}
 *
 * The converter maintains state to emit proper Anthropic lifecycle events:
 * message_start → content_block_start → content_block_delta* → content_block_stop → message_delta → message_stop
 */
export class OpenAIToAnthropicStreamConverter extends TransformStream<Uint8Array, Uint8Array> {
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = "";
  private readonly originalModel: string;
  private readonly messageId: string;
  private sentMessageStart = false;
  private sentBlockStart = false;
  private contentBlockIndex = 0;
  private outputTokens = 0;

  constructor(originalModel: string) {
    super({
      transform: (chunk, controller) => this._transform(chunk, controller),
      flush: (controller) => this._flush(controller),
    });
    this.originalModel = originalModel;
    this.messageId = `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }

  private _transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();

      if (dataStr === "[DONE]") {
        this.emitEnd(controller);
        continue;
      }

      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        this.processChunk(data, controller);
      } catch {
        // Skip invalid JSON
      }
    }
  }

  private processChunk(
    data: Record<string, unknown>,
    controller: TransformStreamDefaultController<Uint8Array>
  ): void {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    if (!choices || choices.length === 0) return;

    const choice = choices[0]!;
    const delta = choice.delta as Record<string, unknown> | undefined;
    const finishReason = choice.finish_reason as string | null;

    // Emit message_start on first chunk
    if (!this.sentMessageStart) {
      this.emitEvent(controller, "message_start", {
        type: "message_start",
        message: {
          id: this.messageId,
          type: "message",
          role: "assistant",
          content: [],
          model: this.originalModel,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      this.sentMessageStart = true;
    }

    if (delta) {
      // Handle tool calls
      const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          this.processToolCallDelta(tc, controller);
        }
        return;
      }

      // Handle text content
      const content = delta.content as string | undefined;
      if (content !== undefined && content !== null) {
        // Start content block if needed
        if (!this.sentBlockStart) {
          this.emitEvent(controller, "content_block_start", {
            type: "content_block_start",
            index: this.contentBlockIndex,
            content_block: { type: "text", text: "" },
          });
          this.sentBlockStart = true;
        }

        this.outputTokens++;
        this.emitEvent(controller, "content_block_delta", {
          type: "content_block_delta",
          index: this.contentBlockIndex,
          delta: { type: "text_delta", text: content },
        });
      }
    }

    // Handle finish
    if (finishReason) {
      this.emitEnd(controller, finishReason);
    }
  }

  private processToolCallDelta(
    tc: Record<string, unknown>,
    controller: TransformStreamDefaultController<Uint8Array>
  ): void {
    const fn = tc.function as Record<string, unknown> | undefined;
    if (!fn) return;

    const index = (tc.index as number) ?? 0;
    const id = tc.id as string | undefined;
    const name = fn.name as string | undefined;
    const args = fn.arguments as string | undefined;

    // If we have an ID and name, this is the start of a new tool call
    if (id && name) {
      // Close previous block if open
      if (this.sentBlockStart) {
        this.emitEvent(controller, "content_block_stop", {
          type: "content_block_stop",
          index: this.contentBlockIndex,
        });
        this.contentBlockIndex++;
        this.sentBlockStart = false;
      }

      // Start tool_use block
      this.emitEvent(controller, "content_block_start", {
        type: "content_block_start",
        index: this.contentBlockIndex,
        content_block: { type: "tool_use", id, name, input: {} },
      });
      this.sentBlockStart = true;
    }

    // Stream input JSON delta
    if (args) {
      this.emitEvent(controller, "content_block_delta", {
        type: "content_block_delta",
        index: this.contentBlockIndex,
        delta: { type: "input_json_delta", partial_json: args },
      });
    }
  }

  private emitEnd(
    controller: TransformStreamDefaultController<Uint8Array>,
    finishReason?: string
  ): void {
    // Close any open content block
    if (this.sentBlockStart) {
      this.emitEvent(controller, "content_block_stop", {
        type: "content_block_stop",
        index: this.contentBlockIndex,
      });
      this.sentBlockStart = false;
    }

    // Map finish reason
    const stopReason = finishReason === "stop" ? "end_turn"
      : finishReason === "tool_calls" ? "tool_use"
      : finishReason === "length" ? "max_tokens"
      : "end_turn";

    this.emitEvent(controller, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: this.outputTokens },
    });

    this.emitEvent(controller, "message_stop", { type: "message_stop" });
  }

  private emitEvent(
    controller: TransformStreamDefaultController<Uint8Array>,
    eventType: string,
    data: unknown
  ): void {
    const output = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(this.encoder.encode(output));
  }

  private _flush(controller: TransformStreamDefaultController<Uint8Array>): void {
    // If we haven't emitted end events, do so now
    if (this.sentMessageStart && this.sentBlockStart) {
      this.emitEnd(controller);
    }
    // Flush remaining buffer
    if (this.buffer.length > 0) {
      // Try to process any remaining data
      if (this.buffer.startsWith("data: ")) {
        const dataStr = this.buffer.slice(6).trim();
        if (dataStr === "[DONE]") {
          this.emitEnd(controller);
        }
      }
    }
  }
}

/**
 * Determine if a provider type uses OpenAI-format API
 */
export function isOpenAIFormatProvider(providerType: string): boolean {
  return providerType === "openai-oauth"
    || providerType === "openai-compatible";
}
