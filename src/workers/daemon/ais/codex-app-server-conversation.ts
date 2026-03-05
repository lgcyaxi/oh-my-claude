/**
 * Conversation session for codex app-server.
 *
 * Wraps the auth check, conversation initialization, and per-turn state
 * (message buffer, completion flag, last agent message, turn errors).
 * Notification handling is also owned here — the transport delivers raw
 * method/params; this module interprets them.
 */

import type { RpcTransport } from "./codex-app-server-transport";
import type { CodexObservability } from "./codex-app-server-observability";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventNotificationParams {
  id?: string;
  msg: {
    type: string;
    delta?: string;
    message?: string;
    last_agent_message?: string | null;
  };
  conversationId?: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Manages a single codex app-server conversation session.
 *
 * Holds all per-conversation and per-turn state. Call `checkAuth` then
 * `initConversation` to prepare the session, then use `handleNotification`
 * to feed incoming events from the transport.
 */
export class ConversationSession {
  conversationId: string | null = null;
  convModel: string = "gpt-5.3-codex"; // updated from newConversation response

  // Turn response state — reset by the daemon before each sendUserTurn
  messageBuffer = "";
  turnComplete = false;
  lastAgentMessage: string | null = null;
  turnError: Error | null = null;

  /** Verify the daemon is authenticated before starting a conversation. */
  async checkAuth(transport: RpcTransport): Promise<void> {
    const result = await transport.send("getAuthStatus", {}) as {
      authMethod: string | null;
      authToken: string | null;
      requiresOpenaiAuth: boolean | null;
    };

    if (!result.authMethod) {
      throw new Error(
        "codex app-server: not authenticated.\n"
        + "Run: omc auth openai   (or: codex login)",
      );
    }
  }

  /** Create a new conversation and subscribe to its event stream. */
  async initConversation(transport: RpcTransport, projectPath: string): Promise<void> {
    const result = await transport.send("newConversation", {
      model: null,
      modelProvider: null,
      profile: null,
      cwd: projectPath,
      approvalPolicy: "never",
      sandbox: null,
      config: null,
      baseInstructions: null,
      developerInstructions: null,
      compactPrompt: null,
      includeApplyPatchTool: null,
    }) as { conversationId: string; model: string };

    this.conversationId = result.conversationId;
    if (result.model) {
      this.convModel = result.model;
    }

    // Subscribe to streaming notifications for this conversation
    await transport.send("addConversationListener", {
      conversationId: this.conversationId,
      experimentalRawEvents: false,
    });
  }

  /** Handle a JSON-RPC notification from the transport. */
  handleNotification(
    method: string,
    params: unknown,
    observability: CodexObservability,
  ): void {
    const p = params as EventNotificationParams | undefined;
    if (!p?.msg) {
      return;
    }

    const { type } = p.msg;

    switch (type) {
      case "agent_message_delta": {
        const delta = p.msg.delta ?? "";
        if (delta) {
          this.messageBuffer += delta;
        }
        break;
      }

      case "agent_message": {
        const message = p.msg.message ?? "";
        if (message) {
          if (!this.messageBuffer) {
            this.messageBuffer = message;
          }
          observability.writeActivityLog("agent_message", message);
        }
        break;
      }

      case "task_complete": {
        this.lastAgentMessage = p.msg.last_agent_message ?? null;
        this.turnComplete = true;
        const completedText = this.lastAgentMessage ?? "done";
        observability.writeActivityLog("task_complete", completedText);
        observability.writeStatusSignal("complete");
        break;
      }

      case "error": {
        const errMsg = p.msg.message ?? "Unknown codex error";
        this.turnError = new Error(`codex app-server turn error: ${errMsg}`);
        this.turnComplete = true; // unblock checkResponse
        observability.writeActivityLog("error", errMsg);
        observability.writeStatusSignal("error");
        break;
      }

      default:
        // Ignore: token_count, mcp_startup_complete, agent_message_delta, etc.
        break;
    }
  }

  /** Reset per-turn fields before each sendUserTurn call. */
  resetTurnState(): void {
    this.messageBuffer = "";
    this.turnComplete = false;
    this.lastAgentMessage = null;
    this.turnError = null;
  }
}
