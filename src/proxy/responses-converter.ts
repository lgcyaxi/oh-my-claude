/**
 * Anthropic ↔ OpenAI Responses API format conversion
 *
 * The Codex API (chatgpt.com/backend-api/codex/responses) uses the OpenAI
 * Responses API format, NOT Chat Completions. This module handles:
 *
 * 1. Anthropic Messages API → Responses API request
 * 2. Responses API SSE events → Anthropic SSE events
 *
 * Reference: anomalyco/opencode packages/opencode/src/plugin/codex.ts
 */

import { randomUUID } from "node:crypto";

// ── Request Conversion (Anthropic → Responses API) ─────────────────────

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

/**
 * Responses API input item types
 */
interface ResponsesInputItem {
  type: string;
  role?: string;
  content?: ResponsesContentPart[] | string;
  call_id?: string;
  name?: string;
  arguments?: string;
  id?: string;
  output?: string;
  status?: string;
}

interface ResponsesContentPart {
  type: string;
  text?: string;
  image_url?: string;
}

/**
 * Convert Anthropic Messages API request → OpenAI Responses API request.
 *
 * Responses API format:
 * {
 *   model: "gpt-5.2",
 *   input: [...input items...],
 *   instructions: "system prompt",
 *   stream: true,
 *   tools: [...],
 *   temperature: 0.7
 * }
 */
export function convertAnthropicToResponses(
  body: Record<string, unknown>,
  targetModel: string
): Record<string, unknown> {
  const input: ResponsesInputItem[] = [];

  // Map Anthropic tool_use IDs (toolu_xxx) to OpenAI-compatible IDs (fc_xxx).
  // OpenAI Responses API requires function_call IDs to start with "fc_".
  const toolIdMap = new Map<string, string>();

  // Convert messages to Responses API input items
  const anthropicMessages = (body.messages ?? []) as AnthropicMessage[];
  for (const msg of anthropicMessages) {
    const items = convertMessageToInputItems(msg, toolIdMap);
    input.push(...items);
  }

  const result: Record<string, unknown> = {
    model: targetModel,
    input,
    stream: true, // Codex API requires stream: true (returns 400 otherwise)
    store: false,
  };

  // System prompt → instructions field (required by Codex API)
  const system = body.system;
  if (system) {
    if (typeof system === "string") {
      result.instructions = system;
    } else if (Array.isArray(system)) {
      const text = (system as AnthropicContentBlock[])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n\n");
      result.instructions = text || "You are a helpful assistant.";
    }
  } else {
    result.instructions = "You are a helpful assistant.";
  }

  // Note: Codex API does NOT support temperature or top_p — omit them

  // Convert tools
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    result.tools = (tools as Array<Record<string, unknown>>).map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    }));
  }

  return result;
}

/**
 * Map an Anthropic tool_use ID (toolu_xxx) to an OpenAI-compatible ID (fc_xxx).
 * OpenAI Responses API requires function_call IDs to start with "fc_".
 * Caches the mapping so tool_use and tool_result reference the same ID.
 */
function mapToolId(anthropicId: string, idMap: Map<string, string>): string {
  const existing = idMap.get(anthropicId);
  if (existing) return existing;

  // Generate fc_-prefixed ID using the same suffix for traceability
  const suffix = anthropicId.startsWith("toolu_") ? anthropicId.slice(6) : randomUUID().replace(/-/g, "");
  const fcId = `fc_${suffix}`;
  idMap.set(anthropicId, fcId);
  return fcId;
}

/**
 * Convert a single Anthropic message to Responses API input items.
 */
function convertMessageToInputItems(msg: AnthropicMessage, toolIdMap: Map<string, string>): ResponsesInputItem[] {
  // Simple string content
  if (typeof msg.content === "string") {
    if (msg.role === "assistant") {
      return [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: msg.content }],
      }];
    }
    return [{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: msg.content }],
    }];
  }

  if (!Array.isArray(msg.content)) {
    return [{
      type: "message",
      role: msg.role === "assistant" ? "assistant" : "user",
      content: [{ type: msg.role === "assistant" ? "output_text" : "input_text", text: String(msg.content) }],
    }];
  }

  const blocks = msg.content as AnthropicContentBlock[];
  const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
  const toolResultBlocks = blocks.filter((b) => b.type === "tool_result");

  // Tool results → function_call_output items
  if (toolResultBlocks.length > 0 && msg.role === "user") {
    const items: ResponsesInputItem[] = [];
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
        const anthropicId = block.tool_use_id ?? "";
        items.push({
          type: "function_call_output",
          call_id: toolIdMap.get(anthropicId) ?? mapToolId(anthropicId, toolIdMap),
          output: content,
        });
      } else if (block.type === "text" && block.text) {
        items.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: block.text }],
        });
      }
    }
    return items;
  }

  // Assistant with tool_use blocks → message + function_call items
  if (toolUseBlocks.length > 0 && msg.role === "assistant") {
    const items: ResponsesInputItem[] = [];

    // Collect text parts into a message
    const textParts = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("");

    if (textParts) {
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: textParts }],
      });
    }

    // Each tool_use → function_call item
    for (const block of toolUseBlocks) {
      const anthropicId = block.id ?? "";
      const fcId = mapToolId(anthropicId, toolIdMap);
      items.push({
        type: "function_call",
        id: fcId,
        call_id: fcId,
        name: block.name ?? "",
        arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? {}),
        status: "completed",
      });
    }

    return items;
  }

  // Regular user or assistant message — convert content blocks
  const contentParts: ResponsesContentPart[] = [];
  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      contentParts.push({
        type: msg.role === "assistant" ? "output_text" : "input_text",
        text: block.text,
      });
    } else if (block.type === "image" && block.source) {
      contentParts.push({
        type: "input_image",
        image_url: `data:${block.source.media_type};base64,${block.source.data}`,
      });
    }
    // Skip thinking, redacted_thinking, etc.
  }

  if (contentParts.length === 0) {
    contentParts.push({
      type: msg.role === "assistant" ? "output_text" : "input_text",
      text: "",
    });
  }

  return [{
    type: "message",
    role: msg.role === "assistant" ? "assistant" : "user",
    content: contentParts,
  }];
}


// ── Streaming Response Conversion (Responses API SSE → Anthropic SSE) ──

/**
 * TransformStream that converts OpenAI Responses API SSE events
 * to Anthropic Messages API SSE format.
 *
 * Responses API events:
 *   response.created → (nothing, or message_start)
 *   response.output_item.added → content_block_start
 *   response.output_text.delta → content_block_delta
 *   response.output_item.done → content_block_stop
 *   response.function_call_arguments.delta → content_block_delta (input_json_delta)
 *   response.completed → message_delta + message_stop
 *
 * Anthropic SSE events:
 *   message_start → content_block_start → content_block_delta* → content_block_stop → message_delta → message_stop
 */
export class ResponsesToAnthropicStreamConverter extends TransformStream<Uint8Array, Uint8Array> {
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = "";
  private readonly originalModel: string;
  private readonly messageId: string;
  private sentMessageStart = false;
  private contentBlockIndex = 0;
  // Track which output items map to which content block index
  private outputItemToBlock = new Map<string, number>();
  private openBlocks = new Set<number>();
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

    let currentEventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();

      if (dataStr === "[DONE]") {
        this.emitEnd(controller);
        continue;
      }

      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        this.processEvent(currentEventType, data, controller);
      } catch {
        // Skip invalid JSON
      }
    }
  }

  private processEvent(
    eventType: string,
    data: Record<string, unknown>,
    controller: TransformStreamDefaultController<Uint8Array>
  ): void {
    // Use event type from SSE or fallback to data.type
    const type = eventType || (data.type as string) || "";

    // Emit message_start on first event
    if (!this.sentMessageStart) {
      this.emitSSE(controller, "message_start", {
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

    switch (type) {
      case "response.output_item.added": {
        const item = data.item as Record<string, unknown> | undefined;
        if (!item) break;
        const itemId = item.id as string ?? "";
        const itemType = item.type as string;
        const blockIdx = this.contentBlockIndex++;
        this.outputItemToBlock.set(itemId, blockIdx);
        this.openBlocks.add(blockIdx);

        if (itemType === "message" || itemType === "text") {
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" },
          });
        } else if (itemType === "function_call") {
          const name = (item.name as string) ?? "";
          const callId = (item.call_id as string) ?? itemId;
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "tool_use", id: callId, name, input: {} },
          });
        }
        break;
      }

      case "response.content_part.added": {
        // A content part was added — if we haven't started a text block yet, start one
        const part = data.part as Record<string, unknown> | undefined;
        if (!part) break;

        // If no blocks open yet, create one
        if (this.openBlocks.size === 0) {
          const blockIdx = this.contentBlockIndex++;
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" },
          });
        }
        break;
      }

      case "response.output_text.delta": {
        const delta = data.delta as string ?? "";
        if (!delta) break;

        this.outputTokens++;

        // Find the block index for this item
        const itemId = data.item_id as string ?? "";
        let blockIdx = this.outputItemToBlock.get(itemId);

        // If no block yet, create one
        if (blockIdx === undefined) {
          blockIdx = this.contentBlockIndex++;
          this.outputItemToBlock.set(itemId, blockIdx);
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" },
          });
        }

        this.emitSSE(controller, "content_block_delta", {
          type: "content_block_delta",
          index: blockIdx,
          delta: { type: "text_delta", text: delta },
        });
        break;
      }

      case "response.function_call_arguments.delta": {
        const delta = data.delta as string ?? "";
        if (!delta) break;

        const itemId = data.item_id as string ?? "";
        let blockIdx = this.outputItemToBlock.get(itemId);

        if (blockIdx === undefined) {
          // Shouldn't happen — function_call output_item.added should have created it
          blockIdx = this.contentBlockIndex++;
          this.outputItemToBlock.set(itemId, blockIdx);
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "tool_use", id: itemId, name: "", input: {} },
          });
        }

        this.emitSSE(controller, "content_block_delta", {
          type: "content_block_delta",
          index: blockIdx,
          delta: { type: "input_json_delta", partial_json: delta },
        });
        break;
      }

      case "response.output_item.done": {
        const item = data.item as Record<string, unknown> | undefined;
        const itemId = item?.id as string ?? "";
        const blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx,
          });
          this.openBlocks.delete(blockIdx);
        }
        break;
      }

      case "response.output_text.done":
      case "response.content_part.done": {
        // Text done — close the block if it's still open
        const itemId = data.item_id as string ?? "";
        const blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx,
          });
          this.openBlocks.delete(blockIdx);
        }
        break;
      }

      case "response.completed": {
        this.emitEnd(controller, data);
        break;
      }

      case "response.failed": {
        // Extract error message
        const error = data.error as Record<string, unknown> | undefined;
        const errorMsg = (error?.message as string) ?? "Unknown error from Codex API";

        // Close any open blocks
        for (const blockIdx of this.openBlocks) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx,
          });
        }
        this.openBlocks.clear();

        // Emit error as message_delta
        this.emitSSE(controller, "message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: this.outputTokens },
        });
        this.emitSSE(controller, "message_stop", { type: "message_stop" });

        console.error(`[responses-converter] Response failed: ${errorMsg}`);
        break;
      }

      // Silently ignore lifecycle events we don't need to convert
      case "response.created":
      case "response.in_progress":
        break;

      default:
        // Unknown events — log in debug
        if (type && !type.startsWith("response.")) {
          console.error(`[responses-converter] Unknown event type: ${type}`);
        }
        break;
    }
  }

  private emitEnd(
    controller: TransformStreamDefaultController<Uint8Array>,
    completedData?: Record<string, unknown>
  ): void {
    // Close any remaining open blocks
    for (const blockIdx of this.openBlocks) {
      this.emitSSE(controller, "content_block_stop", {
        type: "content_block_stop",
        index: blockIdx,
      });
    }
    this.openBlocks.clear();

    // Extract usage from completed response if available
    const response = completedData?.response as Record<string, unknown> | undefined;
    const usage = response?.usage as Record<string, unknown> | undefined;
    const outputTokens = (usage?.output_tokens as number) ?? this.outputTokens;

    // Map stop reason
    const status = (response?.status as string) ?? "completed";
    const stopReason = status === "completed" ? "end_turn"
      : status === "incomplete" ? "max_tokens"
      : "end_turn";

    this.emitSSE(controller, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: outputTokens },
    });

    this.emitSSE(controller, "message_stop", { type: "message_stop" });
  }

  private emitSSE(
    controller: TransformStreamDefaultController<Uint8Array>,
    eventType: string,
    data: unknown
  ): void {
    const output = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(this.encoder.encode(output));
  }

  private _flush(controller: TransformStreamDefaultController<Uint8Array>): void {
    if (this.sentMessageStart && this.openBlocks.size > 0) {
      this.emitEnd(controller);
    }
  }
}
