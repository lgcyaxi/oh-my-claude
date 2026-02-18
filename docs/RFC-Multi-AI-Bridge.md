# RFC: Multi-AI Bridge Architecture

## oh-my-claude Multi-AI Collaboration System

**Status:** Draft  
**Version:** 1.0  
**Date:** 2026-02-17  
**Author:** Atlas (Orchestrator)  

---

## 1. Executive Summary

### 1.1 Problem Statement

Current oh-my-claude operates as a **request router** - it sends tasks to different AI providers via API calls. However, it lacks true **multi-AI collaboration** where multiple AI assistants work simultaneously, share context, and delegate tasks to each other in real-time.

### 1.2 Solution Overview

This RFC proposes the **Multi-AI Bridge** - a system that enables:
- Multiple AI assistants running concurrently in terminal panes
- Real-time task delegation between AIs
- Async request handling with daemon management
- Terminal-based TUI integration (tmux/WezTerm/iTerm2)
- Persistent context per AI through log parsing

### 1.3 Goals

1. **True Parallelism**: Run Claude, Codex, OpenCode, Gemini simultaneously
2. **Async Delegation**: Fire-and-forget task delegation with response polling
3. **Terminal Native**: Leverage terminal multiplexers for AI isolation
4. **Zero API Limits**: Use local CLI tools instead of rate-limited APIs
5. **Persistent Context**: Each AI maintains independent conversation history

### 1.4 Non-Goals

1. Not replacing existing proxy/MCP routing
2. Not supporting non-CLI AI tools
3. Not implementing custom AI models
4. Not providing cloud-based coordination

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User Terminal                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐       │
│  │   Claude Code    │  │    Codex    │  │    OpenCode      │       │
│  │   (Main Pane)    │  │    (Pane)   │  │    (Pane)        │       │
│  └────────┬─────────┘  └──────┬──────┘  └────────┬─────────┘       │
│           │                   │                   │                │
│           └───────────────────┼───────────────────┘                │
│                               │                                     │
│                    ┌──────────▼──────────┐                         │
│                    │   Bridge Core       │                         │
│                    │   (Orchestrator)    │                         │
│                    └──────────┬──────────┘                         │
│                               │                                     │
│              ┌────────────────┼────────────────┐                   │
│              ▼                ▼                ▼                   │
│       ┌──────────┐    ┌──────────┐    ┌──────────┐                │
│       │ Codex    │    │OpenCode  │    │ Gemini   │                │
│       │ Daemon   │    │ Daemon   │    │ Daemon   │                │
│       └────┬─────┘    └────┬─────┘    └────┬─────┘                │
└────────────┼───────────────┼───────────────┼───────────────────────┘
             │               │               │
             ▼               ▼               ▼
    ┌──────────────────────────────────────────────┐
    │              Storage Layer                   │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
    │  │ ~/.codex/│  │~/.openco │  │~/.gemini/│   │
    │  │sessions/ │  │de/storage│  │sessions/ │   │
    │  └──────────┘  └──────────┘  └──────────┘   │
    └──────────────────────────────────────────────┘
```

### 2.2 Component Diagram

*See attached draw.io diagrams for visual representation.*

**Core Components:**

1. **Bridge Core** - Central orchestrator managing all AI interactions
2. **Daemon Layer** - Background processes for each AI (request queuing, lifecycle)
3. **Terminal Backend** - Abstraction for tmux/WezTerm/iTerm2 integration
4. **Storage Adapters** - Parsers for each AI's log format
5. **AI Instances** - Actual CLI tools running in terminal panes

### 2.3 Data Flow

```
Step 1: User → Claude: "/omc-codex 'Fix auth bug'"
        ↓
Step 2: Bridge validates request, creates session
        ↓
Step 3: Bridge → CodexDaemon: Queue request
        ↓
Step 4: Daemon → Tmux: echo "Fix auth bug" > input_fifo
        ↓
Step 5: Codex CLI receives input, processes (30-60s)
        ↓
Step 6: Codex → File: Append response to session.jsonl
        ↓
Step 7: Daemon watches file, detects completion
        ↓
Step 8: Daemon → Bridge: Return response via IPC
        ↓
Step 9: Bridge → Claude: Display result
```

**Key Characteristics:**
- Steps 1-4: Synchronous (< 100ms)
- Steps 5-7: Asynchronous (30-60s typical)
- Step 8-9: Callback when ready

---

## 3. Detailed Component Specifications

### 3.1 Bridge Core (`src/bridge/`)

**Purpose:** Central orchestrator for multi-AI coordination

**Responsibilities:**
- Session management
- Request routing
- Response aggregation
- Health monitoring

**Interface:**

```typescript
interface BridgeOrchestrator {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // AI Management
  registerAI(config: AIConfig): Promise<AIDaemon>;
  unregisterAI(name: string): Promise<void>;
  listAIs(): AIStatus[];
  
  // Request Handling
  delegate(aiName: string, request: Request): Promise<RequestId>;
  checkStatus(requestId: RequestId): RequestStatus;
  getResponse(requestId: RequestId): Promise<Response | null>;
  
  // Health
  ping(aiName: string): Promise<HealthStatus>;
  getSystemStatus(): SystemStatus;
}
```

**Configuration:**

```typescript
interface BridgeConfig {
  runDir: string;           // ~/.claude/oh-my-claude/run/
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // AI Definitions
  ais: AIConfig[];
  
  // Terminal Settings
  terminal: {
    backend: 'tmux' | 'wezterm' | 'iterm2';
    autoCreatePanes: boolean;
    paneLayout: 'horizontal' | 'vertical' | 'grid';
  };
  
  // Daemon Settings
  daemon: {
    idleTimeoutMs: number;  // 60000 default
    maxRetries: number;     // 3 default
    requestTimeoutMs: number; // 300000 default (5 min)
  };
}
```

### 3.2 Daemon Layer (`src/daemon/`)

**Purpose:** Background process managing individual AI lifecycle

**Base Class:**

```typescript
abstract class AIDaemon {
  abstract readonly name: string;
  abstract readonly config: AIConfig;
  
  // State
  protected status: DaemonStatus = 'stopped';
  protected requestQueue: QueuedRequest[] = [];
  protected activeRequest: Request | null = null;
  protected idleTimer: NodeJS.Timeout | null = null;
  
  // Abstract Methods
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(message: string): Promise<void>;
  abstract checkResponse(): Promise<string | null>;
  
  // Common Implementation
  async queueRequest(request: Request): Promise<RequestId> {
    const id = generateRequestId();
    this.requestQueue.push({ id, request, timestamp: Date.now() });
    this.processQueue();
    return id;
  }
  
  private async processQueue(): Promise<void> {
    if (this.activeRequest || this.requestQueue.length === 0) {
      return;
    }
    
    const { id, request } = this.requestQueue.shift()!;
    this.activeRequest = request;
    
    try {
      await this.send(request.message);
      
      // Wait for response with timeout
      const response = await this.pollForResponse(id);
      this.emit('response', { id, response });
    } catch (error) {
      this.emit('error', { id, error });
    } finally {
      this.activeRequest = null;
      this.resetIdleTimer();
      this.processQueue(); // Process next
    }
  }
  
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      if (!this.activeRequest && this.requestQueue.length === 0) {
        this.stop();
      }
    }, this.config.idleTimeoutMs);
  }
}
```

**Concrete Implementations:**

#### 3.2.1 Codex Daemon

```typescript
class CodexDaemon extends AIDaemon {
  name = 'codex';
  private fifoPath: string;
  private logPath: string;
  private watcher: FSWatcher | null = null;
  private responseBuffer: string = '';
  
  async start(): Promise<void> {
    // 1. Ensure CLI is installed
    await this.verifyCodexInstallation();
    
    // 2. Create runtime directory
    await mkdir(this.runtimeDir, { recursive: true });
    
    // 3. Create FIFO for input
    this.fifoPath = join(this.runtimeDir, 'input_fifo');
    await createFIFO(this.fifoPath);
    
    // 4. Start Codex in tmux pane
    const paneId = await this.terminal.createPane(
      'codex',
      `codex -p "${this.projectPath}"`
    );
    
    // 5. Setup log watching
    this.logPath = join(homedir(), '.codex', 'sessions', `${this.sessionId}.jsonl`);
    this.watcher = watch(this.logPath, (event) => {
      if (event === 'change') {
        this.checkResponse();
      }
    });
    
    this.status = 'running';
  }
  
  async send(message: string): Promise<void> {
    // Write to FIFO - Codex CLI reads from here
    await writeFile(this.fifoPath, message + '\n');
  }
  
  async checkResponse(): Promise<string | null> {
    // Read Codex's JSONL format
    const lines = await readLastLines(this.logPath, 10);
    
    for (const line of lines.reverse()) {
      const entry = JSON.parse(line);
      if (entry.type === 'response_item' && 
          entry.payload?.role === 'assistant') {
        const text = entry.payload.content
          ?.filter((c: any) => c.type === 'output_text')
          .map((c: any) => c.text)
          .join('');
        
        if (text && text !== this.responseBuffer) {
          this.responseBuffer = text;
          return text;
        }
      }
    }
    
    return null;
  }
}
```

#### 3.2.2 OpenCode Daemon

```typescript
class OpenCodeDaemon extends AIDaemon {
  name = 'opencode';
  private storageDir: string;
  private projectId: string;
  
  async start(): Promise<void> {
    // OpenCode uses project-based sessions
    this.projectId = await this.getProjectId();
    this.storageDir = join(
      homedir(), 
      '.local', 'share', 'opencode', 'storage'
    );
    
    // Start OpenCode in terminal pane
    await this.terminal.createPane(
      'opencode',
      `opencode -c "${this.projectPath}"`
    );
    
    // Watch storage directory for changes
    const sessionDir = join(this.storageDir, 'session', this.projectId);
    this.watcher = watch(sessionDir, { recursive: true });
    
    this.status = 'running';
  }
  
  async send(message: string): Promise<void> {
    // OpenCode requires TUI text injection
    await this.terminal.injectText('opencode', message + '\n');
  }
  
  async checkResponse(): Promise<string | null> {
    // Parse OpenCode's JSON storage structure
    const sessionFile = await this.findLatestSession();
    const messages = await this.readMessages(sessionFile);
    
    const latest = messages[messages.length - 1];
    if (latest?.role === 'assistant') {
      return latest.content;
    }
    
    return null;
  }
}
```

### 3.3 Terminal Backend (`src/terminal/`)

**Purpose:** Abstract terminal operations across different emulators

**Interface:**

```typescript
interface TerminalBackend {
  readonly name: string;
  
  // Pane Management
  createPane(name: string, command: string): Promise<PaneId>;
  closePane(paneId: PaneId): Promise<void>;
  listPanes(): Promise<PaneInfo[]>;
  
  // Input Injection
  injectText(paneId: PaneId, text: string): Promise<void>;
  sendKeys(paneId: PaneId, keys: string): Promise<void>;
  
  // Query
  isPaneAlive(paneId: PaneId): Promise<boolean>;
  getPaneOutput(paneId: PaneId, lines: number): Promise<string>;
}

interface PaneInfo {
  id: PaneId;
  name: string;
  command: string;
  createdAt: Date;
}

type PaneId = string;
```

#### 3.3.1 Tmux Backend

```typescript
class TmuxBackend implements TerminalBackend {
  name = 'tmux';
  private sessionName = 'oh-my-claude-bridge';
  
  async createPane(name: string, command: string): Promise<PaneId> {
    // Check if session exists
    const sessionExists = await this.exec(`tmux has-session -t ${this.sessionName}`)
      .then(() => true)
      .catch(() => false);
    
    if (!sessionExists) {
      // Create new session
      await this.exec(`tmux new-session -d -s ${this.sessionName} -n bridge`);
    }
    
    // Split window for new pane
    const { stdout: paneId } = await this.exec(
      `tmux split-window -t ${this.sessionName} -P -F '#{pane_id}' '${command}'`
    );
    
    // Rename pane for identification
    await this.exec(`tmux select-pane -t ${paneId.trim()} -T ${name}`);
    
    return paneId.trim();
  }
  
  async injectText(paneId: PaneId, text: string): Promise<void> {
    // Use tmux send-keys for reliable input
    const escaped = text.replace(/'/g, "'\"'\"'");
    await this.exec(`tmux send-keys -t ${paneId} '${escaped}'`);
  }
  
  async isPaneAlive(paneId: PaneId): Promise<boolean> {
    try {
      await this.exec(`tmux list-panes -t ${paneId}`);
      return true;
    } catch {
      return false;
    }
  }
}
```

#### 3.3.2 WezTerm Backend

```typescript
class WezTermBackend implements TerminalBackend {
  name = 'wezterm';
  
  async createPane(name: string, command: string): Promise<PaneId> {
    const { stdout } = await this.exec(
      `wezterm cli split-pane -- ${command}`
    );
    return stdout.trim();
  }
  
  async injectText(paneId: PaneId, text: string): Promise<void> {
    await this.exec(`wezterm cli send-text --pane-id ${paneId} '${text}'`);
  }
  
  async isPaneAlive(paneId: PaneId): Promise<boolean> {
    try {
      await this.exec(`wezterm cli list --format json | jq '.[] | select(.pane_id == ${paneId})'`);
      return true;
    } catch {
      return false;
    }
  }
}
```

### 3.4 Storage Adapters (`src/storage/`)

**Purpose:** Parse AI-specific log formats

#### 3.4.1 Codex Storage

**File Format:** JSON Lines (`.jsonl`)

```typescript
interface CodexLogEntry {
  type: 'user_message' | 'response_item' | 'tool_call' | 'tool_result';
  payload: {
    role?: 'user' | 'assistant' | 'system';
    content?: Array<{
      type: 'input_text' | 'output_text' | 'input_image';
      text?: string;
    }>;
    tool_calls?: any[];
  };
  timestamp: string;
}

class CodexStorageAdapter {
  async readSession(sessionId: string): Promise<CodexMessage[]> {
    const logPath = join(homedir(), '.codex', 'sessions', `${sessionId}.jsonl`);
    const content = await readFile(logPath, 'utf-8');
    
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .filter(entry => 
        entry.type === 'user_message' || 
        entry.type === 'response_item'
      )
      .map(entry => ({
        role: entry.payload.role,
        content: entry.payload.content
          ?.filter(c => c.type === 'input_text' || c.type === 'output_text')
          .map(c => c.text)
          .join(''),
        timestamp: new Date(entry.timestamp)
      }));
  }
  
  watch(sessionId: string, callback: (messages: CodexMessage[]) => void): Watcher {
    const logPath = join(homedir(), '.codex', 'sessions', `${sessionId}.jsonl`);
    
    return watch(logPath, async (event) => {
      if (event === 'change') {
        const messages = await this.readSession(sessionId);
        callback(messages);
      }
    });
  }
}
```

#### 3.4.2 OpenCode Storage

**File Format:** Directory-based JSON storage

```
~/.local/share/opencode/storage/
├── session/
│   └── <projectId>/
│       └── ses_<timestamp>_<id>.json
├── message/
│   └── <sessionId>/
│       └── msg_<timestamp>_<id>.json
└── part/
    └── <messageId>/
        └── prt_<timestamp>_<id>.json
```

```typescript
class OpenCodeStorageAdapter {
  private storageDir = join(homedir(), '.local', 'share', 'opencode', 'storage');
  
  async readSession(projectId: string): Promise<OpenCodeSession> {
    const sessionDir = join(this.storageDir, 'session', projectId);
    const sessionFiles = await readdir(sessionDir);
    
    // Get most recent session
    const latestSession = sessionFiles
      .filter(f => f.startsWith('ses_'))
      .sort()
      .pop();
    
    const sessionPath = join(sessionDir, latestSession);
    const session = JSON.parse(await readFile(sessionPath, 'utf-8'));
    
    // Read messages for this session
    const messageDir = join(this.storageDir, 'message', session.id);
    const messages = await this.readMessages(messageDir);
    
    return {
      id: session.id,
      projectId,
      createdAt: session.createdAt,
      messages
    };
  }
  
  private async readMessages(messageDir: string): Promise<OpenCodeMessage[]> {
    const messageFiles = await readdir(messageDir);
    const messages: OpenCodeMessage[] = [];
    
    for (const file of messageFiles) {
      const msgPath = join(messageDir, file);
      const msg = JSON.parse(await readFile(msgPath, 'utf-8'));
      
      // Read parts for this message
      const partDir = join(this.storageDir, 'part', msg.id);
      const parts = await this.readParts(partDir);
      
      messages.push({
        id: msg.id,
        role: msg.role,
        content: parts.map(p => p.content).join(''),
        timestamp: new Date(msg.createdAt)
      });
    }
    
    return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}
```

---

## 4. API Specifications

### 4.1 CLI Commands

```bash
# Bridge Management
oh-my-claude bridge up [codex|opencode|gemini|all]    # Start AI assistant(s)
oh-my-claude bridge down [codex|opencode|gemini|all]  # Stop AI assistant(s)
oh-my-claude bridge status                             # Show all AI statuses
oh-my-claude bridge ping <ai-name>                     # Check AI health
oh-my-claude bridge logs <ai-name>                     # Show AI logs

# Advanced Options
oh-my-claude bridge up codex --pane-right             # Open in right pane
oh-my-claude bridge up codex --session <name>         # Use named session
oh-my-claude bridge up codex --model gpt-5.3-codex    # Specify model

# Configuration
oh-my-claude bridge config                             # Edit bridge config
oh-my-claude bridge config --default-backend tmux     # Set default terminal
oh-my-claude bridge config --idle-timeout 120000      # Set idle timeout (ms)
```

### 4.2 Slash Commands (Claude Code)

```markdown
# /omc-up - Start AI assistants
Usage: /omc-up [codex|opencode|gemini|all] [--pane-left|--pane-right|--pane-bottom]

Examples:
- /omc-up codex                    # Start Codex in new pane
- /omc-up all                      # Start all configured AIs
- /omc-up codex --pane-right       # Start Codex in right pane

---

# /omc-down - Stop AI assistants
Usage: /omc-down [codex|opencode|gemini|all] [--force]

Examples:
- /omc-down codex                  # Stop Codex gracefully
- /omc-down all --force            # Force stop all AIs

---

# /omc-codex - Delegate to Codex
Usage: /omc-codex <message>

The message is sent to Codex for processing. Claude immediately returns
and you can check for the response later with /omc-pend.

Examples:
- /omc-codex "Review auth.ts for security issues"
- /omc-codex "Refactor the database layer to use TypeORM"

Note: Codex must be running (use /omc-up codex first)

---

# /omc-opencode - Delegate to OpenCode
Usage: /omc-opencode <message>

Similar to /omc-codex but delegates to OpenCode.

---

# /omc-pend - Check for responses
Usage: /omc-pend [codex|opencode|gemini] [count]

Check for and retrieve responses from AI assistants.

Examples:
- /omc-pend codex                  # Check latest Codex response
- /omc-pend codex 5                # Get last 5 responses
- /omc-pend                        # Check all AIs

---

# /omc-status - Show bridge status
Usage: /omc-status [--verbose]

Shows:
- Running AIs
- Request queue status
- Pane information
- Last activity

---

# /omc-switch-ai - Switch active AI context
Usage: /omc-switch-ai <ai-name>

Switch which AI's context is shown in the conversation.

Examples:
- /omc-switch-ai codex            # Show Codex context
- /omc-switch-ai claude           # Return to Claude context
```

### 4.3 TypeScript API

```typescript
// src/bridge/index.ts

export interface BridgeAPI {
  // Lifecycle
  initialize(config?: Partial<BridgeConfig>): Promise<void>;
  shutdown(): Promise<void>;
  
  // AI Management
  startAI(name: string, options?: StartAIOptions): Promise<AIDaemon>;
  stopAI(name: string, options?: StopAIOptions): Promise<void>;
  restartAI(name: string): Promise<AIDaemon>;
  
  // Request Delegation
  delegate(
    aiName: string, 
    message: string, 
    options?: DelegateOptions
  ): Promise<DelegationResult>;
  
  // Response Handling
  checkResponse(
    aiName: string, 
    requestId?: string
  ): Promise<Response | null>;
  
  listResponses(
    aiName: string, 
    limit?: number
  ): Promise<Response[]>;
  
  // Events
  on(event: 'response', callback: (event: ResponseEvent) => void): void;
  on(event: 'error', callback: (event: ErrorEvent) => void): void;
  on(event: 'status', callback: (event: StatusEvent) => void): void;
}

export interface DelegateOptions {
  timeout?: number;           // Override default timeout
  context?: string;           // Additional context
  priority?: 'low' | 'normal' | 'high';
  callback?: (response: Response) => void;  // Async callback
}

export interface DelegationResult {
  requestId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  estimatedTime?: number;     // Estimated processing time in ms
  queuePosition?: number;     // Position in queue if queued
}

export interface Response {
  requestId: string;
  aiName: string;
  content: string;
  timestamp: Date;
  processingTime: number;     // Time taken to process
  metadata?: {
    model?: string;
    tokensUsed?: number;
    toolCalls?: ToolCall[];
  };
}
```

### 4.4 Configuration Schema

```typescript
// ~/.claude/oh-my-claude.json
{
  "bridge": {
    // Terminal backend preference
    "terminalBackend": "tmux",  // "tmux" | "wezterm" | "iterm2" | "auto"
    
    // Pane layout
    "paneLayout": {
      "type": "horizontal",     // "horizontal" | "vertical" | "grid"
      "claudeRatio": 0.6,       // 60% for Claude, 40% for others
      "autoArrange": true
    },
    
    // Daemon settings
    "daemon": {
      "idleTimeoutMs": 60000,   // Shutdown after 60s idle
      "requestTimeoutMs": 300000,  // 5 minute request timeout
      "maxRetries": 3,
      "retryDelayMs": 1000
    },
    
    // AI Configurations
    "ais": [
      {
        "name": "codex",
        "enabled": true,
        "cliCommand": "codex",
        "cliArgs": ["-p"],
        "storageType": "jsonl",
        "storagePath": "~/.codex/sessions",
        "terminalBackend": "tmux",
        "autoStart": false,
        "model": "gpt-5.3-codex"
      },
      {
        "name": "opencode",
        "enabled": false,        // Disabled by default (archived project)
        "cliCommand": "opencode",
        "storageType": "json",
        "storagePath": "~/.local/share/opencode/storage",
        "terminalBackend": "wezterm",
        "autoStart": false
      },
      {
        "name": "gemini",
        "enabled": false,
        "cliCommand": "gemini",
        "storageType": "custom",
        "terminalBackend": "tmux",
        "autoStart": false
      }
    ],
    
    // Logging
    "logging": {
      "level": "info",
      "file": "~/.claude/oh-my-claude/bridge.log",
      "maxSize": "10MB",
      "maxFiles": 5
    },
    
    // Integration with existing features
    "integration": {
      "useProxy": true,         // Route through oh-my-claude proxy
      "shareMemory": true,      // Share memory system context
      "updateStatusline": true  // Show AI status in statusline
    }
  }
}
```

---

## 5. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Core infrastructure and single AI support

**Tasks:**
- [ ] Create daemon framework (`src/daemon/base.ts`)
- [ ] Implement terminal backends (tmux, WezTerm)
- [ ] Create storage adapters (JSONL, JSON parsers)
- [ ] Build Bridge Core orchestrator
- [ ] Implement CodexDaemon with full functionality

**Deliverables:**
- Bridge starts/stops successfully
- Can launch Codex in tmux pane
- Can send/receive single message

**Testing:**
```bash
oh-my-claude bridge up codex
/omc-codex "Hello, Codex!"
/omc-pend codex  # Should return greeting
```

### Phase 2: Multi-AI Support (Week 3-4)
**Goal:** Support multiple AIs simultaneously

**Tasks:**
- [ ] Add OpenCode daemon (if desired)
- [ ] Implement pane management and registry
- [ ] Add queue management for concurrent requests
- [ ] Build health monitoring and auto-recovery
- [ ] Implement request routing and prioritization

**Deliverables:**
- Can run Claude + Codex + OpenCode simultaneously
- Each AI has isolated pane and context
- Can delegate to different AIs in parallel

**Testing:**
```bash
oh-my-claude bridge up codex opencode
/omc-codex "Review auth module"
/omc-opencode "Design database schema"
/omc-status  # Shows both processing
```

### Phase 3: Integration (Week 5-6)
**Goal:** Integrate with existing oh-my-claude features

**Tasks:**
- [ ] Hook into existing proxy system for auth
- [ ] Integrate with memory system
- [ ] Update StatusLine segments
- [ ] Add to CLI command structure
- [ ] Create slash commands

**Deliverables:**
- Uses existing OAuth credentials
- Shares memory context
- StatusLine shows AI activity
- Full CLI integration

**Testing:**
```bash
oh-my-claude doctor  # Shows bridge status
/omc-up codex
# StatusLine shows: [Claude] [Codex:🟢]
```

### Phase 4: Polish (Week 7-8)
**Goal:** Production readiness

**Tasks:**
- [ ] Error handling and recovery
- [ ] Configuration validation
- [ ] Documentation and examples
- [ ] Performance optimization
- [ ] Windows support (if feasible)

**Deliverables:**
- Comprehensive error messages
- Validated config schema
- Full documentation
- Stable performance

---

## 6. Security Considerations

### 6.1 Process Isolation
- Each AI runs in separate terminal pane with own process
- Daemons run as user processes (no elevated privileges)
- FIFO pipes created with 0600 permissions

### 6.2 File System Security
- Runtime directory: `~/.claude/oh-my-claude/run/` (0700)
- Log files readable only by owner
- Session IDs are cryptographically random

### 6.3 Command Injection Prevention
- All user input sanitized before injection
- No shell expansion in terminal commands
- Commands validated against whitelist

### 6.4 Data Privacy
- AI conversations stay in user's home directory
- No cloud transmission (except AI's own API calls)
- Optional: Memory sharing can be disabled

---

## 7. Error Handling

### 7.1 Error Categories

| Error | Cause | Resolution |
|-------|-------|------------|
| `CLI_NOT_FOUND` | AI CLI not installed | Prompt user to install |
| `PANE_CREATION_FAILED` | Terminal backend issue | Retry with fallback backend |
| `DAEMON_TIMEOUT` | AI taking too long | Return partial result, continue watching |
| `STORAGE_READ_ERROR` | Log file corrupted | Log error, skip entry |
| `IPC_ERROR` | Communication failure | Restart daemon |

### 7.2 Recovery Strategies

```typescript
async function handleError(error: BridgeError): Promise<RecoveryAction> {
  switch (error.code) {
    case 'PANE_CREATION_FAILED':
      // Try fallback terminal backend
      if (config.terminalBackend === 'tmux') {
        return { action: 'retry', backend: 'wezterm' };
      }
      break;
      
    case 'DAEMON_TIMEOUT':
      // Return partial, continue in background
      return { 
        action: 'partial',
        message: 'AI is still processing. Use /omc-pend to check later.'
      };
      
    case 'CLI_NOT_FOUND':
      return {
        action: 'fail',
        message: `Please install ${error.aiName}: ${error.installCommand}`
      };
  }
}
```

---

## 8. Migration and Compatibility

### 8.1 Backward Compatibility
- Existing commands unchanged
- New commands are additive
- Config changes are backward compatible

### 8.2 Migration Path

**For Users:**
```bash
# 1. Update oh-my-claude
npm update -g @lgcyaxi/oh-my-claude

# 2. Install AI CLI tools
npm install -g @openai/codex

# 3. Configure bridge
oh-my-claude bridge config

# 4. Start using
oh-my-claude bridge up codex
```

**For Config:**
```bash
# Auto-migration on first run
oh-my-claude bridge up  # Creates default config if missing
```

### 8.3 Deprecation Plan
- Phase 1: New system alongside old (v2.0)
- Phase 2: Deprecate old `/omc-codex` (v2.5)
- Phase 3: Remove old implementation (v3.0)

---

## 9. Open Questions

1. **Should we support Windows?**
   - tmux requires WSL
   - WezTerm has Windows support
   - Decision: Phase 2 consideration

2. **Should we persist request queue across restarts?**
   - Pros: No lost work
   - Cons: Complexity
   - Decision: Phase 2, optional feature

3. **How to handle AI tool conflicts?**
   - Two AIs editing same file
   - Decision: Each AI gets workspace copy

4. **Should we support cloud-hosted AIs?**
   - Current design is local-only
   - Could extend with SSH remotes
   - Decision: Future consideration

---

## 10. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Startup Time | < 2s | Time from `/omc-up` to ready |
| Request Latency | < 100ms | Time to queue request |
| Response Time | < 60s | 95th percentile for typical tasks |
| Reliability | > 99% | Successful delegations / total |
| User Adoption | > 50% | Users with bridge enabled |

---

## 11. Appendix

### A. Storage Format Examples

**Codex JSONL Entry:**
```json
{"type": "user_message", "payload": {"role": "user", "content": [{"type": "input_text", "text": "Fix auth bug"}]}, "timestamp": "2026-02-17T10:00:00Z"}
{"type": "response_item", "payload": {"role": "assistant", "content": [{"type": "output_text", "text": "I'll help you fix..."}]}, "timestamp": "2026-02-17T10:00:05Z"}
```

**OpenCode Session JSON:**
```json
{
  "id": "ses_abc123",
  "projectId": "proj_def456",
  "createdAt": "2026-02-17T10:00:00Z",
  "messages": [
    {"id": "msg_001", "role": "user", "content": "Hello"},
    {"id": "msg_002", "role": "assistant", "content": "Hi! How can I help?"}
  ]
}
```

### B. Terminal Backend Comparison

| Feature | tmux | WezTerm | iTerm2 |
|---------|------|---------|--------|
| Cross-platform | ✅ | ✅ | ❌ (macOS only) |
| FIFO support | ✅ | ❌ | ❌ |
| CLI injection | ✅ | ✅ | ✅ |
| Window management | ✅ | ✅ | ⚠️ (limited) |
| Performance | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Recommendation | Primary | Fallback | macOS only |

### C. Related Work

- **CCB (Claude Code Bridge):** https://github.com/cx994/ccb
- **claude-ccb-skills:** https://github.com/LeoLin990405/claude-ccb-skills
- **OpenCode:** https://github.com/opencode-ai/opencode (archived)
- **OpenAI Codex:** https://github.com/openai/codex

---

**End of RFC**

*This document is a living specification. Updates should be versioned and changelog maintained.*
