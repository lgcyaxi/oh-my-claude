#!/usr/bin/env bun
// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = import.meta.require;

// src/proxy/state/types.ts
var DEFAULT_PROXY_CONFIG, DEFAULT_SWITCH_STATE;
var init_types = __esm(() => {
  DEFAULT_PROXY_CONFIG = {
    port: 18910,
    controlPort: 18911,
    enabled: false
  };
  DEFAULT_SWITCH_STATE = {
    switched: false
  };
});

// src/proxy/state/session.ts
var exports_session = {};
__export(exports_session, {
  writeSessionState: () => writeSessionState,
  setDefaultSwitchState: () => setDefaultSwitchState,
  resetSessionState: () => resetSessionState,
  recordSessionProviderRequest: () => recordSessionProviderRequest,
  readSessionState: () => readSessionState,
  parseSessionFromPath: () => parseSessionFromPath,
  hasSession: () => hasSession,
  getDefaultSwitchState: () => getDefaultSwitchState,
  getCleanupIntervalMs: () => getCleanupIntervalMs,
  getActiveSessions: () => getActiveSessions,
  getActiveSessionCount: () => getActiveSessionCount,
  cleanupStaleSessions: () => cleanupStaleSessions
});
function parseSessionFromPath(pathname) {
  const match = pathname.match(/^\/s\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (!match)
    return null;
  return {
    sessionId: match[1],
    strippedPath: match[2] || "/"
  };
}
function readSessionState(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) {
    if (processDefaultSwitchState) {
      return { ...processDefaultSwitchState };
    }
    return { ...DEFAULT_SWITCH_STATE };
  }
  entry.lastActivity = Date.now();
  return { ...entry.state };
}
function writeSessionState(sessionId, state) {
  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    state: { ...state },
    lastActivity: Date.now(),
    providerCounts: existing?.providerCounts ?? new Map
  });
}
function resetSessionState(sessionId) {
  const existing = sessions.get(sessionId);
  sessions.set(sessionId, {
    state: { ...DEFAULT_SWITCH_STATE },
    lastActivity: Date.now(),
    providerCounts: existing?.providerCounts ?? new Map
  });
}
function cleanupStaleSessions() {
  const now = Date.now();
  let cleaned = 0;
  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastActivity > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.error(`[session] Cleaned up ${cleaned} stale session(s), ${sessions.size} active`);
  }
  return cleaned;
}
function setDefaultSwitchState(state) {
  processDefaultSwitchState = { ...state };
}
function getDefaultSwitchState() {
  return processDefaultSwitchState ? { ...processDefaultSwitchState } : null;
}
function getCleanupIntervalMs() {
  return CLEANUP_INTERVAL_MS;
}
function getActiveSessionCount() {
  return sessions.size;
}
function hasSession(sessionId) {
  return sessions.has(sessionId);
}
function recordSessionProviderRequest(sessionId, provider) {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = {
      state: processDefaultSwitchState ? { ...processDefaultSwitchState } : { ...DEFAULT_SWITCH_STATE },
      lastActivity: Date.now(),
      providerCounts: new Map
    };
    sessions.set(sessionId, entry);
  }
  entry.lastActivity = Date.now();
  entry.providerCounts.set(provider, (entry.providerCounts.get(provider) ?? 0) + 1);
}
function getActiveSessions() {
  const result = [];
  for (const [sessionId, entry] of sessions) {
    result.push({
      sessionId,
      switched: entry.state.switched,
      provider: entry.state.provider,
      model: entry.state.model,
      lastActivity: entry.lastActivity,
      providerCounts: Object.fromEntries(entry.providerCounts)
    });
  }
  result.sort((a, b) => b.lastActivity - a.lastActivity);
  return result;
}
var sessions, processDefaultSwitchState = null, SESSION_TTL_MS, CLEANUP_INTERVAL_MS;
var init_session = __esm(() => {
  init_types();
  sessions = new Map;
  SESSION_TTL_MS = 2 * 60 * 60 * 1000;
  CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
});

// src/shared/config/models-registry.json
var require_models_registry = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $comment: "Single source of truth for oh-my-claude providers, models, and agent defaults. Edit this file to add/remove models \u2014 no menubar rebuild needed. Installed to ~/.claude/oh-my-claude/models-registry.json",
    providers: [
      {
        name: "deepseek",
        label: "DeepSeek",
        models: [
          {
            id: "deepseek-v4-pro",
            label: "DeepSeek V4 Pro",
            note: "thinking model \u2014 opus/sonnet tier"
          },
          {
            id: "deepseek-v4-flash",
            label: "DeepSeek V4 Flash",
            note: "lite / haiku tier"
          }
        ],
        claudeTierMap: {
          opus: { model: "deepseek-v4-pro", effort: "max" },
          sonnet: { model: "deepseek-v4-pro", effort: "high" },
          haiku: { model: "deepseek-v4-flash" }
        }
      },
      {
        name: "zhipu",
        label: "ZhiPu",
        models: [
          { id: "glm-5.1", label: "ZhiPu GLM-5.1" },
          { id: "glm-5", label: "ZhiPu GLM-5" },
          { id: "glm-5-turbo", label: "ZhiPu GLM-5 Turbo" },
          { id: "glm-4.5-air", label: "ZhiPu GLM-4.5 Air", note: "haiku tier" }
        ],
        claudeTierMap: {
          opus: { model: "glm-5.1" },
          sonnet: { model: "glm-5-turbo" },
          haiku: { model: "glm-4.5-air" }
        }
      },
      {
        name: "zai",
        label: "Z.AI",
        models: [
          { id: "glm-5.1", label: "GLM-5.1 (Z.AI)" },
          { id: "glm-5", label: "GLM-5 (Z.AI)" },
          { id: "glm-5-turbo", label: "GLM-5 Turbo (Z.AI)" },
          { id: "glm-4.5-air", label: "GLM-4.5 Air (Z.AI)", note: "haiku tier" }
        ],
        claudeTierMap: {
          opus: { model: "glm-5.1" },
          sonnet: { model: "glm-5-turbo" },
          haiku: { model: "glm-4.5-air" }
        }
      },
      {
        name: "minimax",
        label: "MiniMax",
        models: [
          { id: "MiniMax-M2.7", label: "MiniMax M2.7" },
          { id: "MiniMax-M2.5", label: "MiniMax M2.5" }
        ]
      },
      {
        name: "minimax-cn",
        label: "MiniMax CN",
        models: [
          { id: "MiniMax-M2.7", label: "MiniMax M2.7 (CN)" },
          { id: "MiniMax-M2.5", label: "MiniMax M2.5 (CN)" }
        ]
      },
      {
        name: "kimi",
        label: "Kimi",
        models: [{ id: "kimi-for-coding", label: "Kimi K2.5" }]
      },
      {
        name: "aliyun",
        label: "Aliyun Coding Plan",
        models: [
          {
            id: "qwen3.6-plus",
            label: "Qwen 3.6 Plus",
            note: "supports vision"
          },
          {
            id: "qwen3.5-plus",
            label: "Qwen 3.5 Plus",
            note: "supports vision"
          },
          { id: "qwen3-coder-plus", label: "Qwen 3 Coder Plus" },
          { id: "qwen3-coder-next", label: "Qwen 3 Coder Next" },
          { id: "qwen3-max-2026-01-23", label: "Qwen 3 Max" },
          { id: "glm-4.7", label: "GLM 4.7" },
          {
            id: "glm-5-ay",
            realId: "glm-5",
            label: "GLM-5 (Aliyun)"
          },
          {
            id: "kimi-k2.5",
            label: "Kimi K2.5 (Aliyun)",
            note: "supports vision"
          },
          {
            id: "MiniMax-M2.5-ay",
            realId: "MiniMax-M2.5",
            label: "MiniMax M2.5 (Aliyun)"
          }
        ]
      },
      {
        name: "openrouter",
        label: "OpenRouter",
        models: [
          {
            id: "nvidia/nemotron-3-super-120b-a12b:free",
            label: "Nemotron 3 Super (free)",
            note: "120B hybrid MoE, 1M context"
          }
        ]
      },
      {
        name: "ollama",
        label: "Ollama",
        models: []
      },
      {
        name: "openai",
        label: "OpenAI",
        models: [{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" }]
      }
    ],
    crossProviderAliases: {
      $comment: "Maps model IDs to alternative providers that serve the same model. Used by loader.ts to route through a hub provider (e.g. Aliyun) when the primary provider is not configured. Note: aliyun-specific aliases use suffixed IDs (glm-5-ay, MiniMax-M2.5-ay) to avoid collisions in the /model picker.",
      "kimi-for-coding": [{ provider: "aliyun", model: "kimi-k2.5" }]
    },
    agents: {
      Sisyphus: {
        provider: "claude",
        model: "claude-opus-4-6",
        description: "Primary orchestrator \u2014 plans, delegates, tracks progress"
      },
      "claude-reviewer": {
        provider: "claude",
        model: "claude-sonnet-4-6",
        temperature: 0.1,
        description: "Code review and QA specialist"
      },
      "claude-scout": {
        provider: "claude",
        model: "claude-haiku-4-6",
        temperature: 0.3,
        description: "Fast codebase exploration"
      },
      oracle: {
        provider: "aliyun",
        model: "qwen3.6-plus",
        temperature: 0.1,
        description: "Deep reasoning, architecture, debugging",
        fallback: { provider: "deepseek", model: "deepseek-v4-pro" }
      },
      analyst: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        temperature: 0.1,
        description: "Quick code analysis and pattern review",
        fallback: { provider: "aliyun", model: "qwen3.6-plus" }
      },
      librarian: {
        provider: "zhipu",
        model: "glm-5.1",
        temperature: 0.3,
        description: "External docs, library research, remote codebases",
        fallback: { provider: "aliyun", model: "qwen3.6-plus" }
      },
      "document-writer": {
        provider: "minimax-cn",
        model: "MiniMax-M2.7",
        temperature: 0.5,
        description: "Technical documentation, READMEs, API docs",
        fallback: { provider: "aliyun", model: "qwen3.6-plus" }
      },
      navigator: {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3,
        description: "Visual-to-code, multimodal, document processing",
        fallback: { provider: "aliyun", model: "qwen3.6-plus" }
      },
      hephaestus: {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3,
        description: "Deep implementation, complex refactoring, code forge",
        fallback: { provider: "deepseek", model: "deepseek-v4-pro" }
      },
      "ui-designer": {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3,
        description: "Visual design and UI implementation",
        fallback: { provider: "aliyun", model: "qwen3.6-plus" }
      },
      kimi: {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3,
        description: "Provider agent: general-purpose via Kimi K2.5",
        agentType: "provider"
      },
      "mm-cn": {
        provider: "minimax-cn",
        model: "MiniMax-M2.7",
        temperature: 0.5,
        description: "Provider agent: general-purpose via MiniMax CN",
        agentType: "provider"
      },
      deepseek: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        temperature: 0.3,
        description: "Provider agent: general-purpose via DeepSeek V4 Pro",
        agentType: "provider"
      },
      "deepseek-r": {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        temperature: 0.1,
        description: "Provider agent: deep reasoning via DeepSeek V4 Pro (thinking effort=max)",
        agentType: "provider"
      },
      qwen: {
        provider: "aliyun",
        model: "qwen3.6-plus",
        temperature: 0.3,
        description: "Provider agent: general-purpose via Qwen 3.6 Plus (supports vision)",
        agentType: "provider"
      },
      zhipu: {
        provider: "zhipu",
        model: "glm-5.1",
        temperature: 0.3,
        description: "Provider agent: general-purpose via ZhiPu GLM-5.1",
        agentType: "provider"
      }
    },
    categories: {
      "quick-scout": {
        provider: "claude",
        model: "claude-haiku-4-6",
        temperature: 0.3
      },
      review: {
        provider: "claude",
        model: "claude-sonnet-4-6",
        temperature: 0.1
      },
      "most-capable": {
        provider: "claude",
        model: "claude-opus-4-6",
        temperature: 0.1
      },
      "visual-engineering": {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.7
      },
      ultrabrain: {
        provider: "aliyun",
        model: "qwen3.6-plus",
        temperature: 0.1
      },
      "deep-coding": {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3
      },
      quick: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        temperature: 0.3
      },
      writing: {
        provider: "minimax-cn",
        model: "MiniMax-M2.7",
        temperature: 0.5
      },
      "visual-execution": {
        provider: "kimi",
        model: "kimi-for-coding",
        temperature: 0.3
      }
    }
  };
});

// node_modules/zod/v3/helpers/util.js
var util, objectUtil, ZodParsedType, getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var init_util = __esm(() => {
  (function(util2) {
    util2.assertEqual = (_) => {};
    function assertIs(_arg) {}
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error;
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
      const filtered = {};
      for (const k of validKeys) {
        filtered[k] = obj[k];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first, second) => {
      return {
        ...first,
        ...second
      };
    };
  })(objectUtil || (objectUtil = {}));
  ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
});

// node_modules/zod/v3/ZodError.js
var ZodIssueCode, quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, ZodError;
var init_ZodError = __esm(() => {
  init_util();
  ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  ZodError = class ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < issue.path.length) {
              const el = issue.path[i];
              const terminal = i === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  };
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };
});

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, en_default;
var init_en = __esm(() => {
  init_ZodError();
  init_util();
  en_default = errorMap;
});

// node_modules/zod/v3/errors.js
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var overrideErrorMap;
var init_errors = __esm(() => {
  init_en();
  overrideErrorMap = en_default;
});

// node_modules/zod/v3/helpers/parseUtil.js
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      ctx.schemaErrorMap,
      overrideMap,
      overrideMap === en_default ? undefined : en_default
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}

class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, EMPTY_PATH, INVALID, DIRTY = (value) => ({ status: "dirty", value }), OK = (value) => ({ status: "valid", value }), isAborted = (x) => x.status === "aborted", isDirty = (x) => x.status === "dirty", isValid = (x) => x.status === "valid", isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
var init_parseUtil = __esm(() => {
  init_errors();
  init_en();
  EMPTY_PATH = [];
  INVALID = Object.freeze({
    status: "aborted"
  });
});

// node_modules/zod/v3/helpers/typeAliases.js
var init_typeAliases = () => {};

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
var init_errorUtil = __esm(() => {
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));
});

// node_modules/zod/v3/types.js
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}

class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus,
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(undefined).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
}, cuidRegex, cuid2Regex, ulidRegex, uuidRegex, nanoidRegex, jwtRegex, durationRegex, emailRegex, _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`, emojiRegex, ipv4Regex, ipv4CidrRegex, ipv6Regex, ipv6CidrRegex, base64Regex, base64urlRegex, dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`, dateRegex, ZodString, ZodNumber, ZodBigInt, ZodBoolean, ZodDate, ZodSymbol, ZodUndefined, ZodNull, ZodAny, ZodUnknown, ZodNever, ZodVoid, ZodArray, ZodObject, ZodUnion, getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [undefined];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [undefined, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, ZodDiscriminatedUnion, ZodIntersection, ZodTuple, ZodRecord, ZodMap, ZodSet, ZodFunction, ZodLazy, ZodLiteral, ZodEnum, ZodNativeEnum, ZodPromise, ZodEffects, ZodOptional, ZodNullable, ZodDefault, ZodCatch, ZodNaN, BRAND, ZodBranded, ZodPipeline, ZodReadonly, late, ZodFirstPartyTypeKind, instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), stringType, numberType, nanType, bigIntType, booleanType, dateType, symbolType, undefinedType, nullType, anyType, unknownType, neverType, voidType, arrayType, objectType, strictObjectType, unionType, discriminatedUnionType, intersectionType, tupleType, recordType, mapType, setType, functionType, lazyType, literalType, enumType, nativeEnumType, promiseType, effectsType, optionalType, nullableType, preprocessType, pipelineType, ostring = () => stringType().optional(), onumber = () => numberType().optional(), oboolean = () => booleanType().optional(), coerce, NEVER;
var init_types2 = __esm(() => {
  init_ZodError();
  init_errors();
  init_errorUtil();
  init_parseUtil();
  init_util();
  cuidRegex = /^c[^\s-]{8,}$/i;
  cuid2Regex = /^[0-9a-z]+$/;
  ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  nanoidRegex = /^[a-z0-9_-]{21}$/i;
  jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  dateRegex = new RegExp(`^${dateRegexSource}$`);
  ZodString = class ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus;
      let ctx = undefined;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  ZodNumber = class ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = undefined;
      const status = new ParseStatus;
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  };
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  ZodBigInt = class ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = undefined;
      const status = new ParseStatus;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  ZodBoolean = class ZodBoolean extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  ZodDate = class ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus;
      let ctx = undefined;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  };
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  ZodSymbol = class ZodSymbol extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  ZodUndefined = class ZodUndefined extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  ZodNull = class ZodNull extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  ZodAny = class ZodAny extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  ZodUnknown = class ZodUnknown extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  ZodNever = class ZodNever extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  };
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  ZodVoid = class ZodVoid extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  ZodArray = class ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : undefined,
            maximum: tooBig ? def.exactLength.value : undefined,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  ZodObject = class ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") {} else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== undefined ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    extend(augmentation) {
      return new ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    merge(merging) {
      const merged = new ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    catchall(index) {
      return new ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  };
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodUnion = class ZodUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = undefined;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  };
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const discriminator = this.discriminator;
      const discriminatorValue = ctx.data[discriminator];
      const option = this.optionsMap.get(discriminatorValue);
      if (!option) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union_discriminator,
          options: Array.from(this.optionsMap.keys()),
          path: [discriminator]
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return option._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      } else {
        return option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      }
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    static create(discriminator, options, params) {
      const optionsMap = new Map;
      for (const type of options) {
        const discriminatorValues = getDiscriminator(type.shape[discriminator]);
        if (!discriminatorValues.length) {
          throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
        }
        for (const value of discriminatorValues) {
          if (optionsMap.has(value)) {
            throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
          }
          optionsMap.set(value, type);
        }
      }
      return new ZodDiscriminatedUnion({
        typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
        discriminator,
        options,
        optionsMap,
        ...processCreateParams(params)
      });
    }
  };
  ZodIntersection = class ZodIntersection extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  };
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  ZodTuple = class ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x) => !!x);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new ZodTuple({
        ...this._def,
        rest
      });
    }
  };
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  ZodRecord = class ZodRecord extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const pairs = [];
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      for (const key in ctx.data) {
        pairs.push({
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
          value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (ctx.common.async) {
        return ParseStatus.mergeObjectAsync(status, pairs);
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get element() {
      return this._def.valueType;
    }
    static create(first, second, third) {
      if (second instanceof ZodType) {
        return new ZodRecord({
          keyType: first,
          valueType: second,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(third)
        });
      }
      return new ZodRecord({
        keyType: ZodString.create(),
        valueType: first,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(second)
      });
    }
  };
  ZodMap = class ZodMap extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = new Map;
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = new Map;
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  };
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  ZodSet = class ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = new Set;
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  ZodFunction = class ZodFunction extends ZodType {
    constructor() {
      super(...arguments);
      this.validate = this.implement;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.function) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.function,
          received: ctx.parsedType
        });
        return INVALID;
      }
      function makeArgsIssue(args, error) {
        return makeIssue({
          data: args,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_arguments,
            argumentsError: error
          }
        });
      }
      function makeReturnsIssue(returns, error) {
        return makeIssue({
          data: returns,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_return_type,
            returnTypeError: error
          }
        });
      }
      const params = { errorMap: ctx.common.contextualErrorMap };
      const fn = ctx.data;
      if (this._def.returns instanceof ZodPromise) {
        const me = this;
        return OK(async function(...args) {
          const error = new ZodError([]);
          const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
          const result = await Reflect.apply(fn, this, parsedArgs);
          const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
          return parsedReturns;
        });
      } else {
        const me = this;
        return OK(function(...args) {
          const parsedArgs = me._def.args.safeParse(args, params);
          if (!parsedArgs.success) {
            throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
          }
          const result = Reflect.apply(fn, this, parsedArgs.data);
          const parsedReturns = me._def.returns.safeParse(result, params);
          if (!parsedReturns.success) {
            throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
          }
          return parsedReturns.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...items) {
      return new ZodFunction({
        ...this._def,
        args: ZodTuple.create(items).rest(ZodUnknown.create())
      });
    }
    returns(returnType) {
      return new ZodFunction({
        ...this._def,
        returns: returnType
      });
    }
    implement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    strictImplement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    static create(args, returns, params) {
      return new ZodFunction({
        args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
        returns: returns || ZodUnknown.create(),
        typeName: ZodFirstPartyTypeKind.ZodFunction,
        ...processCreateParams(params)
      });
    }
  };
  ZodLazy = class ZodLazy extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  };
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  ZodLiteral = class ZodLiteral extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  };
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  ZodEnum = class ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  };
  ZodEnum.create = createZodEnum;
  ZodNativeEnum = class ZodNativeEnum extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  };
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  ZodPromise = class ZodPromise extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  };
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  ZodEffects = class ZodEffects extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  };
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  ZodOptional = class ZodOptional extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(undefined);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  ZodNullable = class ZodNullable extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  ZodDefault = class ZodDefault extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  };
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  ZodCatch = class ZodCatch extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  };
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  ZodNaN = class ZodNaN extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  };
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  BRAND = Symbol("zod_brand");
  ZodBranded = class ZodBranded extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  };
  ZodPipeline = class ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b) {
      return new ZodPipeline({
        in: a,
        out: b,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  };
  ZodReadonly = class ZodReadonly extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  late = {
    object: ZodObject.lazycreate
  };
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  stringType = ZodString.create;
  numberType = ZodNumber.create;
  nanType = ZodNaN.create;
  bigIntType = ZodBigInt.create;
  booleanType = ZodBoolean.create;
  dateType = ZodDate.create;
  symbolType = ZodSymbol.create;
  undefinedType = ZodUndefined.create;
  nullType = ZodNull.create;
  anyType = ZodAny.create;
  unknownType = ZodUnknown.create;
  neverType = ZodNever.create;
  voidType = ZodVoid.create;
  arrayType = ZodArray.create;
  objectType = ZodObject.create;
  strictObjectType = ZodObject.strictCreate;
  unionType = ZodUnion.create;
  discriminatedUnionType = ZodDiscriminatedUnion.create;
  intersectionType = ZodIntersection.create;
  tupleType = ZodTuple.create;
  recordType = ZodRecord.create;
  mapType = ZodMap.create;
  setType = ZodSet.create;
  functionType = ZodFunction.create;
  lazyType = ZodLazy.create;
  literalType = ZodLiteral.create;
  enumType = ZodEnum.create;
  nativeEnumType = ZodNativeEnum.create;
  promiseType = ZodPromise.create;
  effectsType = ZodEffects.create;
  optionalType = ZodOptional.create;
  nullableType = ZodNullable.create;
  preprocessType = ZodEffects.createWithPreprocess;
  pipelineType = ZodPipeline.create;
  coerce = {
    string: (arg) => ZodString.create({ ...arg, coerce: true }),
    number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
    boolean: (arg) => ZodBoolean.create({
      ...arg,
      coerce: true
    }),
    bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
    date: (arg) => ZodDate.create({ ...arg, coerce: true })
  };
  NEVER = INVALID;
});

// node_modules/zod/v3/external.js
var exports_external = {};
__export(exports_external, {
  void: () => voidType,
  util: () => util,
  unknown: () => unknownType,
  union: () => unionType,
  undefined: () => undefinedType,
  tuple: () => tupleType,
  transformer: () => effectsType,
  symbol: () => symbolType,
  string: () => stringType,
  strictObject: () => strictObjectType,
  setErrorMap: () => setErrorMap,
  set: () => setType,
  record: () => recordType,
  quotelessJson: () => quotelessJson,
  promise: () => promiseType,
  preprocess: () => preprocessType,
  pipeline: () => pipelineType,
  ostring: () => ostring,
  optional: () => optionalType,
  onumber: () => onumber,
  oboolean: () => oboolean,
  objectUtil: () => objectUtil,
  object: () => objectType,
  number: () => numberType,
  nullable: () => nullableType,
  null: () => nullType,
  never: () => neverType,
  nativeEnum: () => nativeEnumType,
  nan: () => nanType,
  map: () => mapType,
  makeIssue: () => makeIssue,
  literal: () => literalType,
  lazy: () => lazyType,
  late: () => late,
  isValid: () => isValid,
  isDirty: () => isDirty,
  isAsync: () => isAsync,
  isAborted: () => isAborted,
  intersection: () => intersectionType,
  instanceof: () => instanceOfType,
  getParsedType: () => getParsedType,
  getErrorMap: () => getErrorMap,
  function: () => functionType,
  enum: () => enumType,
  effect: () => effectsType,
  discriminatedUnion: () => discriminatedUnionType,
  defaultErrorMap: () => en_default,
  datetimeRegex: () => datetimeRegex,
  date: () => dateType,
  custom: () => custom,
  coerce: () => coerce,
  boolean: () => booleanType,
  bigint: () => bigIntType,
  array: () => arrayType,
  any: () => anyType,
  addIssueToContext: () => addIssueToContext,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransformer: () => ZodEffects,
  ZodSymbol: () => ZodSymbol,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodSchema: () => ZodType,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPipeline: () => ZodPipeline,
  ZodParsedType: () => ZodParsedType,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNever: () => ZodNever,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEffects: () => ZodEffects,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCatch: () => ZodCatch,
  ZodBranded: () => ZodBranded,
  ZodBoolean: () => ZodBoolean,
  ZodBigInt: () => ZodBigInt,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  Schema: () => ZodType,
  ParseStatus: () => ParseStatus,
  OK: () => OK,
  NEVER: () => NEVER,
  INVALID: () => INVALID,
  EMPTY_PATH: () => EMPTY_PATH,
  DIRTY: () => DIRTY,
  BRAND: () => BRAND
});
var init_external = __esm(() => {
  init_errors();
  init_parseUtil();
  init_typeAliases();
  init_util();
  init_types2();
  init_ZodError();
});

// node_modules/zod/index.js
var init_zod = __esm(() => {
  init_external();
  init_external();
});

// src/shared/auth/types.ts
function isOAuthProvider(type) {
  return type === "openai-oauth";
}
var OpenAICredentialSchema, AuthCredentialSchema, AuthStoreSchema;
var init_types3 = __esm(() => {
  init_zod();
  OpenAICredentialSchema = exports_external.object({
    type: exports_external.literal("oauth-openai"),
    refreshToken: exports_external.string(),
    accessToken: exports_external.string().optional(),
    expiresAt: exports_external.number().default(0),
    accountId: exports_external.string().optional()
  });
  AuthCredentialSchema = exports_external.discriminatedUnion("type", [
    OpenAICredentialSchema
  ]);
  AuthStoreSchema = exports_external.object({
    version: exports_external.literal(1).default(1),
    credentials: exports_external.record(exports_external.string(), AuthCredentialSchema).default({})
  });
});

// src/shared/auth/store.ts
var exports_store = {};
__export(exports_store, {
  writeSecretFile: () => writeSecretFile,
  setCredential: () => setCredential,
  saveAuthStore: () => saveAuthStore,
  removeCredential: () => removeCredential,
  loadAuthStore: () => loadAuthStore,
  listCredentials: () => listCredentials,
  hasCredential: () => hasCredential,
  getCredential: () => getCredential,
  getAuthStorePath: () => getAuthStorePath
});
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync3, chmodSync as chmodSync2, utimesSync } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2, platform } from "os";
function ensureAuthDir() {
  if (!existsSync3(AUTH_DIR)) {
    mkdirSync3(AUTH_DIR, { recursive: true });
  }
}
function setFilePermissions(path) {
  if (platform() === "win32")
    return;
  try {
    chmodSync2(path, 384);
  } catch {}
}
function writeSecretFile(path, content, encoding = "utf-8") {
  writeFileSync2(path, content, encoding);
  setFilePermissions(path);
}
function loadAuthStore() {
  try {
    if (!existsSync3(AUTH_PATH)) {
      return { version: 1, credentials: {} };
    }
    const content = readFileSync3(AUTH_PATH, "utf-8");
    const parsed = JSON.parse(content);
    return AuthStoreSchema.parse(parsed);
  } catch {
    return { version: 1, credentials: {} };
  }
}
function saveAuthStore(store) {
  ensureAuthDir();
  const content = JSON.stringify(store, null, 2);
  writeFileSync2(AUTH_PATH, content, "utf-8");
  setFilePermissions(AUTH_PATH);
  try {
    const now = new Date;
    utimesSync(AUTH_PATH, now, now);
  } catch {}
}
function getCredential(provider) {
  const store = loadAuthStore();
  return store.credentials[provider] ?? null;
}
function setCredential(provider, credential) {
  const store = loadAuthStore();
  store.credentials[provider] = credential;
  saveAuthStore(store);
}
function removeCredential(provider) {
  const store = loadAuthStore();
  if (!(provider in store.credentials)) {
    return false;
  }
  delete store.credentials[provider];
  saveAuthStore(store);
  return true;
}
function listCredentials() {
  const store = loadAuthStore();
  return Object.entries(store.credentials).map(([provider, cred]) => {
    let detail = "";
    switch (cred.type) {
      case "oauth-openai":
        detail = cred.accountId ? `account: ${cred.accountId}` : "authenticated";
        break;
    }
    return { provider, type: cred.type, detail };
  });
}
function hasCredential(provider) {
  const store = loadAuthStore();
  return provider in store.credentials;
}
function getAuthStorePath() {
  return AUTH_PATH;
}
var AUTH_DIR, AUTH_PATH;
var init_store = __esm(() => {
  init_types3();
  AUTH_DIR = join2(homedir2(), ".claude", "oh-my-claude");
  AUTH_PATH = join2(AUTH_DIR, "auth.json");
});

// src/shared/auth/token-manager.ts
var exports_token_manager = {};
__export(exports_token_manager, {
  getAccessToken: () => getAccessToken,
  forceRefresh: () => forceRefresh,
  clearTokenCache: () => clearTokenCache
});
function isExpired(expiresAt) {
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}
async function getAccessToken(provider) {
  const cached = tokenCache.get(provider);
  if (cached && !isExpired(cached.expiresAt)) {
    return cached.token;
  }
  const existing = refreshPromises.get(provider);
  if (existing)
    return existing;
  const promise = refreshAccessToken(provider);
  refreshPromises.set(provider, promise);
  try {
    const token = await promise;
    return token;
  } finally {
    refreshPromises.delete(provider);
  }
}
async function refreshAccessToken(provider) {
  const cred = getCredential(provider);
  if (!cred) {
    throw new Error(`No credentials stored for provider: ${provider}. Run 'oh-my-claude auth login ${provider}'.`);
  }
  switch (cred.type) {
    case "oauth-openai":
      return refreshOpenAI(provider, cred);
    default:
      throw new Error(`Unknown credential type for provider: ${provider}`);
  }
}
async function refreshOpenAI(provider, cred) {
  if (cred.accessToken && !isExpired(cred.expiresAt)) {
    tokenCache.set(provider, { token: cred.accessToken, expiresAt: cred.expiresAt });
    return cred.accessToken;
  }
  let response;
  try {
    response = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: cred.refreshToken,
        client_id: "app_EMoamEEZ73f0CkXaXp7hrann"
      }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`OpenAI token refresh network error: ${msg}`);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI token refresh failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  tokenCache.set(provider, { token: data.access_token, expiresAt });
  setCredential(provider, {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt
  });
  return data.access_token;
}
function clearTokenCache(provider) {
  if (provider) {
    tokenCache.delete(provider);
  } else {
    tokenCache.clear();
  }
}
async function forceRefresh(provider) {
  tokenCache.delete(provider);
  return getAccessToken(provider);
}
var tokenCache, refreshPromises, EXPIRY_BUFFER_MS = 60000;
var init_token_manager = __esm(() => {
  init_store();
  tokenCache = new Map;
  refreshPromises = new Map;
});

// src/proxy/response/cache.ts
var exports_cache = {};
__export(exports_cache, {
  wrapWithCapture: () => wrapWithCapture,
  startCapture: () => startCapture,
  removeCaptureListener: () => removeCaptureListener,
  getLatestResponse: () => getLatestResponse,
  completeCapture: () => completeCapture,
  cleanupSessionCache: () => cleanupSessionCache,
  appendText: () => appendText,
  addCaptureListener: () => addCaptureListener,
  SSECaptureTransformStream: () => SSECaptureTransformStream
});
function startCapture(sessionId, provider, model) {
  const seq = (seqCounters.get(sessionId) ?? 0) + 1;
  seqCounters.set(sessionId, seq);
  const entry = {
    seq,
    text: "",
    provider,
    model,
    completedAt: 0,
    streaming: true
  };
  let entries = cache.get(sessionId);
  if (!entries) {
    entries = [];
    cache.set(sessionId, entries);
  }
  entries.push(entry);
  while (entries.length > MAX_ENTRIES_PER_SESSION) {
    entries.shift();
  }
  return seq;
}
function appendText(sessionId, seq, text) {
  const entries = cache.get(sessionId);
  if (!entries)
    return;
  const entry = entries.find((e) => e.seq === seq);
  if (entry && entry.streaming) {
    entry.text += text;
    const set = listeners.get(sessionId);
    if (set) {
      for (const listener of set) {
        try {
          listener.onDelta(text);
        } catch {}
      }
    }
  }
}
function completeCapture(sessionId, seq, usage) {
  const entries = cache.get(sessionId);
  if (!entries)
    return;
  const entry = entries.find((e) => e.seq === seq);
  if (entry) {
    entry.streaming = false;
    entry.completedAt = Date.now();
    if (usage)
      entry.usage = usage;
    const set = listeners.get(sessionId);
    if (set) {
      for (const listener of set) {
        try {
          listener.onComplete(entry);
        } catch {}
      }
    }
  }
}
function getLatestResponse(sessionId, minSeq) {
  const entries = cache.get(sessionId);
  if (!entries)
    return null;
  for (let i = entries.length - 1;i >= 0; i--) {
    const entry = entries[i];
    if (entry.streaming)
      continue;
    if (minSeq !== undefined && entry.seq < minSeq)
      continue;
    return entry;
  }
  return null;
}
function cleanupSessionCache(sessionId) {
  cache.delete(sessionId);
  seqCounters.delete(sessionId);
  listeners.delete(sessionId);
}
function addCaptureListener(sessionId, listener) {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set;
    listeners.set(sessionId, set);
  }
  set.add(listener);
}
function removeCaptureListener(sessionId, listener) {
  const set = listeners.get(sessionId);
  if (set) {
    set.delete(listener);
    if (set.size === 0)
      listeners.delete(sessionId);
  }
}
function wrapWithCapture(response, sessionId, provider, model) {
  if (!sessionId)
    return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && response.body) {
    const seq = startCapture(sessionId, provider, model);
    const captureTransform = new SSECaptureTransformStream(sessionId, seq);
    const writer = captureTransform.writable.getWriter();
    const reader = response.body.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          await writer.write(value);
        }
        await writer.close();
      } catch (err) {
        try {
          writer.abort(err);
        } catch {}
      }
    })();
    return new Response(captureTransform.readable, {
      status: response.status,
      headers: response.headers
    });
  }
  if (contentType.includes("application/json") && response.body) {
    const seq = startCapture(sessionId, provider, model);
    const [stream1, stream2] = response.body.tee();
    (async () => {
      try {
        const reader = stream2.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          if (value)
            chunks.push(value);
        }
        try {
          const body = JSON.parse(chunks.map((c) => new TextDecoder().decode(c)).join(""));
          const content = body.content;
          const textParts = content?.filter((c) => c.type === "text").map((c) => c.text) ?? [];
          appendText(sessionId, seq, textParts.join(""));
          const usage = body.usage;
          completeCapture(sessionId, seq, {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0
          });
        } catch {
          completeCapture(sessionId, seq);
        }
      } catch {
        completeCapture(sessionId, seq);
      }
    })();
    return new Response(stream1, {
      status: response.status,
      headers: response.headers
    });
  }
  return response;
}
var MAX_ENTRIES_PER_SESSION = 5, cache, seqCounters, listeners, SSECaptureTransformStream;
var init_cache = __esm(() => {
  cache = new Map;
  seqCounters = new Map;
  listeners = new Map;
  SSECaptureTransformStream = class SSECaptureTransformStream extends TransformStream {
    constructor(sessionId, seq) {
      let buffer = "";
      let inputTokens = 0;
      let outputTokens = 0;
      const decoder = new TextDecoder;
      super({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split(`
`);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: "))
              continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]")
              continue;
            try {
              const data = JSON.parse(dataStr);
              const type = data.type;
              if (type === "message_start") {
                const msg = data.message;
                const usage = msg?.usage;
                if (usage?.input_tokens)
                  inputTokens = usage.input_tokens;
              } else if (type === "content_block_delta") {
                const delta = data.delta;
                if (delta?.type === "text_delta" && typeof delta.text === "string") {
                  appendText(sessionId, seq, delta.text);
                }
              } else if (type === "message_delta") {
                const usage = data.usage;
                if (usage?.output_tokens)
                  outputTokens = usage.output_tokens;
              } else if (type === "message_stop") {
                completeCapture(sessionId, seq, {
                  inputTokens,
                  outputTokens
                });
              }
            } catch {}
          }
        },
        flush() {
          const entries = cache.get(sessionId);
          const entry = entries?.find((e) => e.seq === seq);
          if (entry?.streaming) {
            completeCapture(sessionId, seq, {
              inputTokens,
              outputTokens
            });
          }
        }
      });
    }
  };
});

// src/proxy/control/helpers.ts
function jsonResponse(data, status, extraHeaders) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders
    }
  });
}
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// src/statusline/segments/usage/types.ts
var FETCH_TIMEOUT_MS = 2000;
var init_types4 = () => {};

// src/statusline/segments/usage/deepseek.ts
async function fetchDeepSeekBalance(apiKey) {
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!resp.ok)
      return null;
    const data = await resp.json();
    if (!data.balance_infos?.length)
      return null;
    const cny = data.balance_infos.find((b) => b.currency === "CNY");
    const info = cny ?? data.balance_infos[0];
    const balance = parseFloat(info.total_balance);
    const symbol = info.currency === "CNY" ? "\xA5" : "$";
    const displayBalance = `${symbol}${balance.toFixed(2)}`;
    let color;
    if (balance > 100) {
      color = "good";
    } else if (balance > 10) {
      color = "warning";
    } else {
      color = "critical";
    }
    return { timestamp: Date.now(), display: displayBalance, color };
  } catch {
    return null;
  }
}
var init_deepseek = __esm(() => {
  init_types4();
});

// src/statusline/segments/usage/zhipu.ts
async function fetchZhiPuQuota(apiKey) {
  try {
    const resp = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!resp.ok)
      return null;
    const data = await resp.json();
    if (!data.data?.limits?.length)
      return null;
    const weeklyTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 6);
    const shortTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit !== 6);
    const monthlyCallLimit = data.data.limits.find((l) => l.type === "TIME_LIMIT" && l.unit === 5);
    const parts = [];
    if (shortTokenLimit) {
      parts.push(`${Math.round(shortTokenLimit.percentage)}%`);
    }
    if (weeklyTokenLimit) {
      parts.push(`w:${Math.round(weeklyTokenLimit.percentage)}%`);
    }
    if (monthlyCallLimit) {
      const remaining = monthlyCallLimit.remaining ?? 0;
      parts.push(`m:${Math.round(monthlyCallLimit.percentage)}%/${remaining}`);
    }
    if (parts.length === 0)
      return null;
    const display = parts.join("/");
    const pct = weeklyTokenLimit?.percentage ?? monthlyCallLimit?.percentage ?? shortTokenLimit?.percentage ?? 0;
    let color;
    if (pct < 50) {
      color = "good";
    } else if (pct < 80) {
      color = "warning";
    } else {
      color = "critical";
    }
    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}
var init_zhipu = __esm(() => {
  init_types4();
});

// src/shared/auth/minimax.ts
import { existsSync as existsSync16, readFileSync as readFileSync9 } from "fs";
import { join as join18 } from "path";
import { homedir as homedir11 } from "os";
function hasMiniMaxCredential() {
  return existsSync16(CREDS_PATH);
}
function getMiniMaxCredential() {
  if (!existsSync16(CREDS_PATH)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync9(CREDS_PATH, "utf-8"));
    if (creds.cookie && creds.groupId) {
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}
var CREDS_PATH;
var init_minimax = __esm(() => {
  CREDS_PATH = join18(homedir11(), ".claude", "oh-my-claude", "minimax-creds.json");
});

// src/statusline/segments/usage/minimax.ts
function parseMiniMaxQuotaResponse(data) {
  if (!data.model_remains?.length)
    return null;
  const model = data.model_remains[0];
  const {
    current_interval_total_count: total,
    current_interval_usage_count: remaining
  } = model;
  const used = total - remaining;
  const pct = total > 0 ? Math.round(used / total * 100) : 0;
  const display = `${pct}%`;
  let color;
  if (pct < 50) {
    color = "good";
  } else if (pct < 80) {
    color = "warning";
  } else {
    color = "critical";
  }
  return { timestamp: Date.now(), display, color };
}
function resolveMiniMaxGroupId() {
  const envGroupId = process.env.MINIMAX_GROUP_ID || process.env.MINIMAX_GROUPID || process.env.minimax_group_id || process.env.minimax_groupid;
  if (envGroupId) {
    return { groupId: envGroupId };
  }
  const cred = getMiniMaxCredential();
  if (cred?.groupId) {
    return { groupId: cred.groupId, cookie: cred.cookie };
  }
  return null;
}
async function fetchMiniMaxQuota() {
  try {
    const apiKey = process.env.MINIMAX_CN_API_KEY || process.env.MINIMAX_API_KEY;
    if (apiKey) {
      try {
        const resp = await fetch("https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains", {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.base_resp?.status_code === 0 || data.model_remains?.length) {
            const result = parseMiniMaxQuotaResponse(data);
            if (result)
              return result;
          }
        }
      } catch {}
    }
    const resolved = resolveMiniMaxGroupId();
    if (!resolved)
      return null;
    const { groupId, cookie } = resolved;
    if (apiKey && groupId) {
      try {
        const urls = [
          `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?group_id=${encodeURIComponent(groupId)}`,
          `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${encodeURIComponent(groupId)}`
        ];
        for (const url of urls) {
          const resp = await fetch(url, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.base_resp?.status_code === 0) {
              const result = parseMiniMaxQuotaResponse(data);
              if (result)
                return result;
            }
          }
        }
      } catch {}
    }
    if (cookie && groupId) {
      try {
        const urls = [
          `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?group_id=${encodeURIComponent(groupId)}`,
          `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${encodeURIComponent(groupId)}`
        ];
        for (const url of urls) {
          const resp = await fetch(url, {
            headers: { Cookie: cookie },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
          });
          if (!resp.ok)
            continue;
          const data = await resp.json();
          const parsed = parseMiniMaxQuotaResponse(data);
          if (parsed)
            return parsed;
        }
        return null;
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}
var init_minimax2 = __esm(() => {
  init_types4();
  init_minimax();
});

// src/shared/auth/kimi.ts
import { existsSync as existsSync17, readFileSync as readFileSync10 } from "fs";
import { join as join19 } from "path";
import { homedir as homedir12 } from "os";
function hasKimiCredential() {
  return existsSync17(CREDS_PATH2);
}
function getKimiCredential() {
  if (!existsSync17(CREDS_PATH2)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync10(CREDS_PATH2, "utf-8"));
    const creds = raw?.credential ?? raw;
    if (creds?.token && creds?.cookie) {
      return {
        type: "kimi",
        token: creds.token,
        cookie: creds.cookie,
        loggedInAt: typeof creds.loggedInAt === "number" ? creds.loggedInAt : Date.now()
      };
    }
    return null;
  } catch {
    return null;
  }
}
var CREDS_PATH2;
var init_kimi = __esm(() => {
  CREDS_PATH2 = join19(homedir12(), ".claude", "oh-my-claude", "kimi-creds.json");
});

// src/statusline/segments/usage/kimi.ts
async function fetchKimiQuota() {
  try {
    const cred = getKimiCredential();
    if (!cred?.token || !cred?.cookie)
      return null;
    let authExpired = false;
    const fetchUsages = async (body) => {
      const resp = await fetch("https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.token}`,
          Cookie: cred.cookie,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (resp.status === 401 || resp.status === 403) {
        authExpired = true;
        return null;
      }
      if (!resp.ok)
        return null;
      return await resp.json();
    };
    let data = await fetchUsages({ scope: ["FEATURE_CODING"] });
    let entry = data?.usages?.find((u) => u.scope === "FEATURE_CODING") ?? data?.usages?.find((u) => !!u.detail) ?? data?.usages?.[0];
    if (!entry?.detail) {
      data = await fetchUsages({});
      entry = data?.usages?.find((u) => u.scope === "FEATURE_CODING") ?? data?.usages?.find((u) => !!u.detail) ?? data?.usages?.[0];
    }
    if (!entry?.detail) {
      return authExpired ? { timestamp: Date.now(), display: "!auth", color: "critical" } : null;
    }
    const parts = [];
    const windowLimit = entry.limits?.[0];
    let windowPct = 0;
    if (windowLimit?.detail) {
      const wLimit = parseInt(windowLimit.detail.limit || "100", 10);
      const wUsed = windowLimit.detail.used !== undefined ? parseInt(windowLimit.detail.used, 10) : wLimit - parseInt(windowLimit.detail.remaining || "0", 10);
      windowPct = wLimit > 0 ? Math.round(wUsed / wLimit * 100) : 0;
      parts.push(`${windowPct}%`);
    }
    const overallLimit = parseInt(entry.detail.limit || "100", 10);
    const overallUsed = entry.detail.used !== undefined ? parseInt(entry.detail.used, 10) : overallLimit - parseInt(entry.detail.remaining || "0", 10);
    const weeklyPct = overallLimit > 0 ? Math.round(overallUsed / overallLimit * 100) : 0;
    parts.push(`w:${weeklyPct}%`);
    const display = parts.join("/");
    const colorPct = windowLimit?.detail ? windowPct : weeklyPct;
    let color;
    if (colorPct < 50)
      color = "good";
    else if (colorPct < 80)
      color = "warning";
    else
      color = "critical";
    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}
var init_kimi2 = __esm(() => {
  init_types4();
  init_kimi();
});

// src/shared/auth/aliyun.ts
import { existsSync as existsSync18, readFileSync as readFileSync11 } from "fs";
import { join as join20 } from "path";
import { homedir as homedir13 } from "os";
function hasAliyunCredential() {
  return existsSync18(CREDS_PATH3);
}
function getAliyunCredential() {
  if (!existsSync18(CREDS_PATH3)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync11(CREDS_PATH3, "utf-8"));
    if (creds.cookie) {
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}
var CREDS_PATH3;
var init_aliyun = __esm(() => {
  CREDS_PATH3 = join20(homedir13(), ".claude", "oh-my-claude", "aliyun-creds.json");
});

// src/statusline/segments/usage/aliyun.ts
async function fetchAliyunQuota() {
  try {
    const cred = getAliyunCredential();
    if (!cred?.cookie) {
      return null;
    }
    const url = "https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&_v=undefined";
    const formBody = cred.formBody;
    if (!formBody)
      return null;
    const headers = {
      Cookie: cred.cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://bailian.console.aliyun.com/",
      Origin: "https://bailian.console.aliyun.com"
    };
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: formBody,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (resp.status === 302 || resp.status === 301) {
      return { timestamp: Date.now(), display: "!auth", color: "critical" };
    }
    if (resp.status === 401 || resp.status === 403) {
      return { timestamp: Date.now(), display: "!auth", color: "critical" };
    }
    if (!resp.ok)
      return null;
    const text = await resp.text();
    if (text.startsWith("<!") || text.startsWith("<html")) {
      return { timestamp: Date.now(), display: "!auth", color: "critical" };
    }
    const data = JSON.parse(text);
    if (data.code !== "200")
      return null;
    const innerData = data.data;
    if (innerData?.success === false) {
      const errorCode = innerData.errorCode;
      if (errorCode?.includes("NotLogined") || errorCode?.includes("Login")) {
        return { timestamp: Date.now(), display: "!auth", color: "critical" };
      }
      return null;
    }
    const instances = data.data?.DataV2?.data?.data?.codingPlanInstanceInfos;
    if (!instances?.length)
      return null;
    const instance = instances.find((i) => i.status === "VALID") ?? instances[0];
    const q = instance.codingPlanQuotaInfo;
    if (!q)
      return null;
    const h5Used = q.per5HourUsedQuota ?? 0;
    const h5Total = q.per5HourTotalQuota ?? 0;
    const wUsed = q.perWeekUsedQuota ?? 0;
    const wTotal = q.perWeekTotalQuota ?? 0;
    const mUsed = q.perBillMonthUsedQuota ?? 0;
    const mTotal = q.perBillMonthTotalQuota ?? 0;
    const parts = [];
    if (h5Total > 0) {
      const pct = Math.round(h5Used / h5Total * 100);
      parts.push(`${pct}%`);
    }
    if (wTotal > 0) {
      const pct = Math.round(wUsed / wTotal * 100);
      parts.push(`w:${pct}%`);
    }
    if (mTotal > 0) {
      const pct = Math.round(mUsed / mTotal * 100);
      parts.push(`m:${pct}%`);
    }
    if (parts.length === 0)
      return null;
    const display = parts.join("/");
    const colorPct = h5Total > 0 ? Math.round(h5Used / h5Total * 100) : wTotal > 0 ? Math.round(wUsed / wTotal * 100) : mTotal > 0 ? Math.round(mUsed / mTotal * 100) : 0;
    let color;
    if (colorPct < 50)
      color = "good";
    else if (colorPct < 80)
      color = "warning";
    else
      color = "critical";
    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}
var init_aliyun2 = __esm(() => {
  init_types4();
  init_aliyun();
});

// src/statusline/segments/usage/provider-registry.ts
var exports_provider_registry = {};
__export(exports_provider_registry, {
  buildProviderRegistry: () => buildProviderRegistry,
  PROVIDER_ABBREV: () => PROVIDER_ABBREV
});
function buildProviderRegistry() {
  const registry = [];
  registry.push({
    key: "deepseek",
    abbrev: PROVIDER_ABBREV.deepseek,
    isConfigured: () => !!process.env.DEEPSEEK_API_KEY,
    fetch: () => fetchDeepSeekBalance(process.env.DEEPSEEK_API_KEY)
  });
  registry.push({
    key: "zhipu",
    abbrev: PROVIDER_ABBREV.zhipu,
    isConfigured: () => !!process.env.ZHIPU_API_KEY,
    fetch: () => fetchZhiPuQuota(process.env.ZHIPU_API_KEY)
  });
  registry.push({
    key: "minimax",
    abbrev: PROVIDER_ABBREV.minimax,
    isConfigured: () => !!(process.env.MINIMAX_API_KEY || process.env.MINIMAX_CN_API_KEY) || hasMiniMaxCredential(),
    fetch: () => fetchMiniMaxQuota()
  });
  registry.push({
    key: "kimi",
    abbrev: PROVIDER_ABBREV.kimi,
    isConfigured: () => !!process.env.KIMI_API_KEY || hasKimiCredential(),
    fetch: async () => {
      if (hasKimiCredential())
        return fetchKimiQuota();
      if (process.env.KIMI_API_KEY) {
        return { timestamp: Date.now(), display: "ok", color: "good" };
      }
      return null;
    }
  });
  registry.push({
    key: "aliyun",
    abbrev: PROVIDER_ABBREV.aliyun,
    isConfigured: () => !!process.env.ALIYUN_API_KEY || hasAliyunCredential(),
    fetch: async () => {
      if (hasAliyunCredential())
        return fetchAliyunQuota();
      if (process.env.ALIYUN_API_KEY) {
        return { timestamp: Date.now(), display: "ok", color: "good" };
      }
      return null;
    }
  });
  return registry;
}
var PROVIDER_ABBREV;
var init_provider_registry = __esm(() => {
  init_deepseek();
  init_zhipu();
  init_minimax2();
  init_kimi2();
  init_aliyun2();
  init_kimi();
  init_aliyun();
  init_minimax();
  PROVIDER_ABBREV = {
    deepseek: "DS",
    zhipu: "ZP",
    minimax: "MM",
    kimi: "KM",
    aliyun: "AY"
  };
});

// src/proxy/control/usage.ts
var exports_usage = {};
__export(exports_usage, {
  handleUsageRequest: () => handleUsageRequest
});
import { readFileSync as readFileSync12, existsSync as existsSync19 } from "fs";
import { join as join21 } from "path";
import { homedir as homedir14 } from "os";
function ensureApiEnv() {
  if (envLoaded)
    return;
  envLoaded = true;
  try {
    const envFile = join21(homedir14(), ".zshrc.api");
    if (!existsSync19(envFile))
      return;
    const content = readFileSync12(envFile, "utf-8");
    for (const line of content.split(`
`)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#"))
        continue;
      const match = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!match)
        continue;
      const key = match[1];
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}
}
async function fetchProviderUsage() {
  ensureApiEnv();
  const { buildProviderRegistry: buildProviderRegistry2 } = await Promise.resolve().then(() => (init_provider_registry(), exports_provider_registry));
  const registry = buildProviderRegistry2();
  const results = [];
  const promises = registry.map(async (provider) => {
    const configured = provider.isConfigured();
    if (!configured) {
      return {
        key: provider.key,
        abbrev: provider.abbrev,
        display: "",
        color: "good",
        configured: false
      };
    }
    try {
      const entry = await Promise.race([
        provider.fetch(),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      return {
        key: provider.key,
        abbrev: provider.abbrev,
        display: entry?.display ?? "",
        color: entry?.color ?? "good",
        configured: true
      };
    } catch {
      return {
        key: provider.key,
        abbrev: provider.abbrev,
        display: "error",
        color: "critical",
        configured: true
      };
    }
  });
  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    }
  }
  return results;
}
async function handleUsageRequest(corsHeaders) {
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    return jsonResponse({ providers: cachedResult.data, cached: true }, 200, corsHeaders);
  }
  const data = await fetchProviderUsage();
  cachedResult = { data, timestamp: Date.now() };
  return jsonResponse({ providers: data, cached: false }, 200, corsHeaders);
}
var envLoaded = false, cachedResult = null, CACHE_TTL = 60000;
var init_usage = () => {};

// src/proxy/state/switch.ts
init_types();
import { existsSync as existsSync2, readFileSync as readFileSync2, mkdirSync as mkdirSync2 } from "fs";
import { join, dirname as dirname2 } from "path";
import { homedir } from "os";

// src/shared/fs/file-lock.ts
import {
  openSync,
  closeSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  statSync,
  chmodSync,
  copyFileSync
} from "fs";
import { dirname } from "path";
var DEFAULT_RETRIES = 10;
var DEFAULT_BACKOFF_MS = 20;
var DEFAULT_STALE_MS = 5000;
function sleepBlockingMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}
function acquireLock(lockPath, opts) {
  const dir = dirname(lockPath);
  for (let i = 0;i < opts.retries; i++) {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      return openSync(lockPath, "wx");
    } catch (err) {
      const code = err?.code;
      if (code !== "EEXIST") {
        return null;
      }
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > opts.staleMs) {
          try {
            unlinkSync(lockPath);
          } catch {}
          continue;
        }
      } catch {}
      sleepBlockingMs(opts.backoffMs + Math.random() * opts.backoffMs);
    }
  }
  return null;
}
function releaseLock(fd, lockPath) {
  if (fd === null)
    return;
  try {
    closeSync(fd);
  } catch {}
  try {
    unlinkSync(lockPath);
  } catch {}
}
function withFileLockSync(lockPath, fn, opts = {}) {
  const resolved = {
    retries: opts.retries ?? DEFAULT_RETRIES,
    backoffMs: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
    staleMs: opts.staleMs ?? DEFAULT_STALE_MS
  };
  const fd = acquireLock(lockPath, resolved);
  try {
    return fn();
  } finally {
    releaseLock(fd, lockPath);
  }
}
function atomicTempPath(path) {
  return `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}
function ensureParentDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function applyMode(path, mode) {
  if (mode === undefined || process.platform === "win32")
    return;
  try {
    chmodSync(path, mode);
  } catch {}
}
function atomicWriteText(path, text, opts = {}) {
  ensureParentDir(path);
  const tmp = atomicTempPath(path);
  writeFileSync(tmp, text, "utf-8");
  applyMode(tmp, opts.mode);
  renameSync(tmp, path);
  applyMode(path, opts.mode);
}
function atomicWriteJson(path, value, opts = {}) {
  const indent = opts.indent ?? "\t";
  const trailing = opts.trailingNewline ?? true;
  const text = JSON.stringify(value, null, indent) + (trailing ? `
` : "");
  atomicWriteText(path, text, { mode: opts.mode });
}

// src/proxy/state/switch.ts
function getSwitchStatePath() {
  return join(homedir(), ".claude", "oh-my-claude", "proxy-switch.json");
}
function getSwitchStateLockPath() {
  return getSwitchStatePath() + ".lock";
}
function readSwitchState() {
  const statePath = getSwitchStatePath();
  try {
    if (!existsSync2(statePath)) {
      return { ...DEFAULT_SWITCH_STATE };
    }
    const content = readFileSync2(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed.switched !== "boolean") {
      return { ...DEFAULT_SWITCH_STATE };
    }
    return {
      switched: parsed.switched,
      provider: parsed.provider,
      model: parsed.model,
      switchedAt: parsed.switchedAt
    };
  } catch {
    return { ...DEFAULT_SWITCH_STATE };
  }
}
function writeSwitchState(state) {
  const statePath = getSwitchStatePath();
  const dir = dirname2(statePath);
  if (!existsSync2(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
  withFileLockSync(getSwitchStateLockPath(), () => {
    atomicWriteJson(statePath, state, {
      indent: 2,
      trailingNewline: false
    });
  });
}
function resetSwitchState() {
  writeSwitchState({ ...DEFAULT_SWITCH_STATE });
}

// src/proxy/handlers/index.ts
init_session();

// src/proxy/routing/route-directive.ts
var ROUTE_WITH_PROVIDER = /\[omc-route:([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)\]/;
var ROUTE_MODEL_ONLY = /\[omc-route:([a-zA-Z0-9._-]+)\]/;
function extractRouteDirective(body) {
  const system = body.system;
  if (!system)
    return null;
  let systemText;
  if (typeof system === "string") {
    systemText = system;
  } else if (Array.isArray(system)) {
    const parts = [];
    for (const block of system) {
      if (block && typeof block === "object" && block.type === "text") {
        const text = block.text;
        if (typeof text === "string") {
          parts.push(text);
        }
      }
    }
    systemText = parts.join(`
`);
  } else {
    return null;
  }
  const withProvider = systemText.match(ROUTE_WITH_PROVIDER);
  if (withProvider) {
    return {
      provider: withProvider[1],
      model: withProvider[2]
    };
  }
  const modelOnly = systemText.match(ROUTE_MODEL_ONLY);
  if (modelOnly) {
    return { model: modelOnly[1] };
  }
  return null;
}

// src/proxy/routing/model-resolver.ts
var import_models_registry = __toESM(require_models_registry(), 1);
var providerModelSets = new Map;
var providerClaudeTierMaps = new Map;
var modelToProviders = new Map;
var crossProviderAliases = new Map;
for (const p of import_models_registry.default.providers) {
  const models = new Set(p.models.map((m) => m.realId ?? m.id));
  providerModelSets.set(p.name, models);
  const tierMap = p.claudeTierMap;
  if (tierMap?.opus && tierMap.sonnet && tierMap.haiku) {
    providerClaudeTierMaps.set(p.name, {
      opus: tierMap.opus,
      sonnet: tierMap.sonnet,
      haiku: tierMap.haiku
    });
  }
  for (const m of p.models) {
    const displayId = m.id;
    const realId = m.realId;
    const existing = modelToProviders.get(displayId);
    if (existing) {
      existing.push(p.name);
    } else {
      modelToProviders.set(displayId, [p.name]);
    }
    if (realId && realId !== displayId) {
      const realExisting = modelToProviders.get(realId);
      if (realExisting) {
        realExisting.push(p.name);
      } else {
        modelToProviders.set(realId, [p.name]);
      }
    }
  }
}
var aliases = import_models_registry.default.crossProviderAliases;
if (aliases) {
  for (const [model, targets] of Object.entries(aliases)) {
    if (model.startsWith("$"))
      continue;
    crossProviderAliases.set(model, targets);
  }
}
function resolveClaudeTier(model) {
  const lower = model.toLowerCase();
  if (!lower.startsWith("claude-"))
    return null;
  if (lower.includes("opus"))
    return "opus";
  if (lower.includes("sonnet"))
    return "sonnet";
  if (lower.includes("haiku"))
    return "haiku";
  return null;
}
function resolveEffectiveRoute(requestModel, switchModel, provider) {
  if (requestModel && requestModel !== switchModel && !requestModel.startsWith("claude-")) {
    const validModels = providerModelSets.get(provider);
    if (validModels && validModels.size === 0) {
      return { model: requestModel };
    }
    if (validModels?.has(requestModel)) {
      return { model: requestModel };
    }
  }
  const tierMap = providerClaudeTierMaps.get(provider);
  if (tierMap && requestModel) {
    const tier = resolveClaudeTier(requestModel);
    if (tier) {
      const entry = tierMap[tier];
      if (entry) {
        const route = { model: entry.model };
        if (entry.effort)
          route.effort = entry.effort;
        return route;
      }
    }
  }
  return { model: switchModel };
}
function resolveModelToProvider(model, isConfigured) {
  if (!model)
    return null;
  if (model.startsWith("claude-"))
    return null;
  const providers = modelToProviders.get(model);
  if (providers) {
    for (const provider of providers) {
      if (isConfigured(provider)) {
        return provider;
      }
    }
  }
  const aliasTargets = crossProviderAliases.get(model);
  if (aliasTargets) {
    for (const target of aliasTargets) {
      if (isConfigured(target.provider)) {
        return target.provider;
      }
    }
  }
  return null;
}
function resolveModelRoute(model, isConfigured) {
  if (model.startsWith("claude-"))
    return null;
  const providers = modelToProviders.get(model);
  if (providers) {
    for (const provider of providers) {
      if (isConfigured(provider)) {
        return { provider, effectiveModel: model };
      }
    }
  }
  const aliasTargets = crossProviderAliases.get(model);
  if (aliasTargets) {
    for (const target of aliasTargets) {
      if (isConfigured(target.provider)) {
        return { provider: target.provider, effectiveModel: target.model };
      }
    }
  }
  return null;
}

// src/proxy/handlers/stats.ts
var startedAt = Date.now();
var requestCount = 0;
var providerRequestCounts = new Map;
var RESPONSES_API_PROVIDERS = new Set(["openai-oauth"]);
var QUIET_PATHS = ["/v1/messages/count_tokens"];
var isDebug = process.env.OMC_PROXY_DEBUG === "1";
function nextRequestId() {
  return ++requestCount;
}
function trackProviderRequest(provider) {
  providerRequestCounts.set(provider, (providerRequestCounts.get(provider) ?? 0) + 1);
}
function getProxyStats() {
  return {
    uptime: Date.now() - startedAt,
    requestCount
  };
}
function getProviderRequestCounts() {
  return Object.fromEntries(providerRequestCounts);
}
async function cacheUsageResponse(response) {
  try {
    const data = await response.json();
    if (!data.five_hour)
      return;
    const { mkdirSync: mkdirSync3, writeFileSync: writeFileSync2 } = await import("fs");
    const { join: join2 } = await import("path");
    const { homedir: homedir2 } = await import("os");
    const cacheDir = join2(homedir2(), ".claude", "oh-my-claude", "cache");
    mkdirSync3(cacheDir, { recursive: true });
    writeFileSync2(join2(cacheDir, "api_usage.json"), JSON.stringify({
      timestamp: Date.now(),
      five_hour: data.five_hour,
      seven_day: data.seven_day
    }), "utf-8");
  } catch {}
}

// src/proxy/auth/auth.ts
import {
  existsSync as existsSync5,
  readFileSync as readFileSync5,
  writeFileSync as writeFileSync3,
  mkdirSync as mkdirSync4,
  chmodSync as chmodSync3
} from "fs";
import { join as join4, dirname as dirname3 } from "path";
import { homedir as homedir4 } from "os";
import { randomUUID } from "crypto";

// src/shared/config/schema.ts
init_zod();
var import_models_registry2 = __toESM(require_models_registry(), 1);
function buildAgentDefaults() {
  const agents = {};
  for (const [name, agent] of Object.entries(import_models_registry2.default.agents)) {
    const a = agent;
    const entry = { provider: a.provider, model: a.model };
    if (a.temperature !== undefined)
      entry.temperature = a.temperature;
    if (a.fallback)
      entry.fallback = a.fallback;
    agents[name] = entry;
  }
  return agents;
}
function buildCategoryDefaults() {
  const categories = {};
  for (const [name, cat] of Object.entries(import_models_registry2.default.categories)) {
    categories[name] = {
      provider: cat.provider,
      model: cat.model,
      temperature: cat.temperature
    };
  }
  return categories;
}
var ProviderTypeSchema = exports_external.enum([
  "claude-subscription",
  "openai-compatible",
  "anthropic-compatible",
  "openai-oauth"
]);
var ProviderConfigSchema = exports_external.object({
  type: ProviderTypeSchema,
  base_url: exports_external.string().url().optional(),
  api_key_env: exports_external.string().optional(),
  note: exports_external.string().optional()
});
var AgentConfigSchema = exports_external.object({
  provider: exports_external.string(),
  model: exports_external.string(),
  temperature: exports_external.number().min(0).max(2).optional(),
  max_tokens: exports_external.number().optional(),
  thinking: exports_external.object({
    enabled: exports_external.boolean(),
    budget_tokens: exports_external.number().optional()
  }).optional(),
  fallback: exports_external.object({
    provider: exports_external.string(),
    model: exports_external.string()
  }).optional()
});
var CategoryConfigSchema = exports_external.object({
  provider: exports_external.string(),
  model: exports_external.string(),
  temperature: exports_external.number().min(0).max(2).optional(),
  variant: exports_external.string().optional(),
  prompt_append: exports_external.string().optional()
});
var ConcurrencyConfigSchema = exports_external.object({
  global: exports_external.number().min(1).max(50).default(10),
  per_provider: exports_external.record(exports_external.string(), exports_external.number().min(1).max(20)).optional()
});
var MemoryConfigSchema = exports_external.object({
  defaultReadScope: exports_external.enum(["project", "global", "all"]).default("all"),
  defaultWriteScope: exports_external.enum(["project", "global", "auto"]).default("auto"),
  autoSaveThreshold: exports_external.number().min(0).max(100).default(75),
  aiProvider: exports_external.string().optional(),
  aiModel: exports_external.string().optional(),
  aiProviderPriority: exports_external.array(exports_external.string()).default(["minimax-cn", "minimax", "zhipu", "deepseek"]),
  embedding: exports_external.object({
    provider: exports_external.enum(["custom", "zhipu", "none"]).default("custom"),
    model: exports_external.string().default("embedding-3"),
    dimensions: exports_external.number().min(64).max(8192).optional(),
    onWrite: exports_external.boolean().default(true)
  }).optional(),
  chunking: exports_external.object({
    tokens: exports_external.number().min(100).max(2000).default(400),
    overlap: exports_external.number().min(0).max(200).default(80)
  }).optional(),
  search: exports_external.object({
    hybrid: exports_external.object({
      enabled: exports_external.boolean().default(true),
      vectorWeight: exports_external.number().min(0).max(1).default(0.7),
      textWeight: exports_external.number().min(0).max(1).default(0.3),
      candidateMultiplier: exports_external.number().min(1).max(10).default(4)
    }).optional(),
    snippetMaxChars: exports_external.number().min(100).max(1000).default(300)
  }).optional(),
  dedup: exports_external.object({
    exactHashSkip: exports_external.boolean().default(true),
    semanticThreshold: exports_external.number().min(0.5).max(1).default(0.9),
    tagAndDefer: exports_external.boolean().default(true)
  }).optional(),
  autoRotate: exports_external.object({
    enabled: exports_external.boolean().default(true),
    graceDays: exports_external.number().int().min(0).max(30).default(1),
    thresholdFiles: exports_external.number().int().min(2).max(50).default(3),
    maxDatesPerRun: exports_external.number().int().min(1).max(20).default(2),
    useLLMWhenAvailable: exports_external.boolean().default(true)
  }).default({
    enabled: true,
    graceDays: 1,
    thresholdFiles: 3,
    maxDatesPerRun: 2,
    useLLMWhenAvailable: true
  })
});
var ProxyConfigSchema = exports_external.object({
  port: exports_external.number().min(1024).max(65535).default(18910),
  controlPort: exports_external.number().min(1024).max(65535).default(18911),
  enabled: exports_external.boolean().default(false),
  failClosed: exports_external.boolean().default(true),
  maxBodyBytes: exports_external.number().int().default(4 * 1024 * 1024)
});
var OhMyClaudeConfigSchema = exports_external.object({
  $schema: exports_external.string().optional(),
  providers: exports_external.record(exports_external.string(), ProviderConfigSchema).default({
    claude: {
      type: "claude-subscription",
      note: "Uses Claude Code's native subscription - no API key needed"
    },
    deepseek: {
      type: "anthropic-compatible",
      base_url: "https://api.deepseek.com/anthropic",
      api_key_env: "DEEPSEEK_API_KEY"
    },
    zhipu: {
      type: "anthropic-compatible",
      base_url: "https://open.bigmodel.cn/api/anthropic",
      api_key_env: "ZHIPU_API_KEY"
    },
    zai: {
      type: "anthropic-compatible",
      base_url: "https://api.z.ai/api/anthropic",
      api_key_env: "ZAI_API_KEY"
    },
    minimax: {
      type: "anthropic-compatible",
      base_url: "https://api.minimax.io/anthropic",
      api_key_env: "MINIMAX_API_KEY"
    },
    "minimax-cn": {
      type: "anthropic-compatible",
      base_url: "https://api.minimaxi.com/anthropic",
      api_key_env: "MINIMAX_CN_API_KEY"
    },
    kimi: {
      type: "anthropic-compatible",
      base_url: "https://api.kimi.com/coding",
      api_key_env: "KIMI_API_KEY"
    },
    aliyun: {
      type: "anthropic-compatible",
      base_url: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      api_key_env: "ALIYUN_API_KEY"
    },
    openrouter: {
      type: "anthropic-compatible",
      base_url: "https://openrouter.ai/api",
      api_key_env: "OPENROUTER_API_KEY"
    },
    ollama: {
      type: "anthropic-compatible",
      base_url: "http://localhost:11434",
      api_key_env: "OLLAMA_API_KEY",
      note: "Ollama local inference (Anthropic Messages API) - API key optional"
    },
    openai: {
      type: "openai-oauth",
      base_url: "https://chatgpt.com/backend-api/codex",
      note: "OpenAI Codex via OAuth - run 'oh-my-claude auth login openai'"
    }
  }),
  agents: exports_external.record(exports_external.string(), AgentConfigSchema).default(buildAgentDefaults()),
  categories: exports_external.record(exports_external.string(), CategoryConfigSchema).default(buildCategoryDefaults()),
  disabled_agents: exports_external.array(exports_external.string()).optional(),
  disabled_hooks: exports_external.array(exports_external.string()).optional(),
  concurrency: ConcurrencyConfigSchema.optional(),
  proxy: ProxyConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  debugTaskTracker: exports_external.boolean().optional(),
  debugHooks: exports_external.boolean().optional()
});
var DEFAULT_CONFIG = OhMyClaudeConfigSchema.parse({});
// src/shared/config/loader.ts
import { readFileSync as readFileSync4, existsSync as existsSync4 } from "fs";
import { homedir as homedir3 } from "os";
import { join as join3 } from "path";
init_types3();
var import_models_registry3 = __toESM(require_models_registry(), 1);
var CONFIG_FILENAME = "oh-my-claude.json";
function getConfigPaths() {
  const home = homedir3();
  return [
    join3(process.cwd(), ".claude", CONFIG_FILENAME),
    join3(home, ".claude", CONFIG_FILENAME),
    join3(home, ".config", "oh-my-claude", CONFIG_FILENAME)
  ];
}
function loadConfig() {
  const configPaths = getConfigPaths();
  for (const configPath of configPaths) {
    if (existsSync4(configPath)) {
      try {
        const content = readFileSync4(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return OhMyClaudeConfigSchema.parse(parsed);
      } catch (error) {
        console.warn(`Warning: Failed to parse config at ${configPath}:`, error);
      }
    }
  }
  return DEFAULT_CONFIG;
}
function getProviderDetails(config, providerName) {
  const providerConfig = config.providers[providerName];
  if (providerConfig) {
    return {
      baseUrl: providerConfig.base_url,
      apiKeyEnv: providerConfig.api_key_env,
      type: providerConfig.type
    };
  }
  return null;
}
function isProviderConfigured(config, providerName) {
  const providerConfig = config.providers[providerName];
  if (!providerConfig) {
    return false;
  }
  if (providerConfig.type === "claude-subscription") {
    return true;
  }
  if (isOAuthProvider(providerConfig.type)) {
    try {
      const { hasCredential: hasCredential2 } = (init_store(), __toCommonJS(exports_store));
      return hasCredential2(providerName);
    } catch {
      return false;
    }
  }
  if (providerConfig.api_key_env) {
    const apiKey = process.env[providerConfig.api_key_env];
    if (apiKey && apiKey.length > 0)
      return true;
    if (providerName === "ollama") {
      const effectiveUrl = process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || providerConfig.base_url;
      if (effectiveUrl) {
        try {
          const url = new URL(effectiveUrl);
          if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE) {
            return true;
          }
        } catch {}
      }
    }
    return false;
  }
  return false;
}
// src/shared/utils.ts
function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/proxy/auth/auth.ts
function getAuthConfigPath() {
  return join4(homedir4(), ".claude", "oh-my-claude", "proxy-auth.json");
}
function readAuthConfig() {
  const authPath = getAuthConfigPath();
  try {
    if (!existsSync5(authPath)) {
      return null;
    }
    const content = readFileSync5(authPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed.proxyToken) {
      return null;
    }
    if (!parsed.authMode) {
      parsed.authMode = parsed.anthropicApiKey ? "api-key" : "oauth";
    }
    return parsed;
  } catch {
    return null;
  }
}
function writeAuthConfig(config) {
  const authPath = getAuthConfigPath();
  const dir = dirname3(authPath);
  if (!existsSync5(dir)) {
    mkdirSync4(dir, { recursive: true });
  }
  writeFileSync3(authPath, JSON.stringify(config, null, 2), "utf-8");
  try {
    chmodSync3(authPath, 384);
  } catch {}
}
function generateProxyToken() {
  return `omc-proxy-${randomUUID()}`;
}
function initializeAuth() {
  const existing = readAuthConfig();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const authMode = anthropicApiKey ? "api-key" : "oauth";
  if (existing && existing.authMode === authMode && existing.anthropicApiKey === anthropicApiKey) {
    return existing;
  }
  const config = {
    anthropicApiKey,
    proxyToken: existing?.proxyToken ?? generateProxyToken(),
    authMode,
    configuredAt: new Date().toISOString()
  };
  writeAuthConfig(config);
  return config;
}
function getPassthroughAuth() {
  const authConfig = readAuthConfig();
  if (!authConfig) {
    throw new Error("Proxy auth not configured. Launch via 'oh-my-claude cc' or restart the proxy.");
  }
  return {
    apiKey: authConfig.anthropicApiKey,
    baseUrl: "https://api.anthropic.com",
    authMode: authConfig.authMode
  };
}
var OAUTH_PROVIDER_TYPES = new Set(["openai-oauth"]);
async function getProviderAuth(providerName) {
  const config = loadConfig();
  const providerConfig = config.providers[providerName];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  if (providerConfig.type === "claude-subscription") {
    throw new Error(`Provider "${providerName}" is a Claude subscription \u2014 cannot switch to it via proxy.`);
  }
  let baseUrl = providerConfig.base_url;
  if (providerName === "ollama") {
    const envHost = process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE;
    if (envHost) {
      baseUrl = envHost.replace(/\/v1\/?$/, "");
    }
  }
  if (!baseUrl) {
    throw new Error(`Provider "${providerName}" has no base_url configured.`);
  }
  if (OAUTH_PROVIDER_TYPES.has(providerConfig.type)) {
    try {
      const { getAccessToken: getAccessToken2 } = await Promise.resolve().then(() => (init_token_manager(), exports_token_manager));
      const providerKey = providerName;
      const token = await getAccessToken2(providerKey);
      return {
        apiKey: token,
        baseUrl,
        providerType: providerConfig.type
      };
    } catch (error) {
      const msg = toErrorMessage(error);
      throw new Error(`OAuth token resolution failed for "${providerName}": ${msg}. Run 'oh-my-claude auth login ${providerName}' to authenticate.`);
    }
  }
  const apiKeyEnv = providerConfig.api_key_env;
  if (!apiKeyEnv) {
    throw new Error(`Provider "${providerName}" has no api_key_env configured.`);
  }
  const apiKey = process.env[apiKeyEnv] ?? "";
  if (!apiKey) {
    const isOllamaWithEnv = providerName === "ollama" && (process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE);
    try {
      const url = new URL(baseUrl);
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!isLocal && !isOllamaWithEnv) {
        throw new Error(`API key not set for provider "${providerName}". Set the ${apiKeyEnv} environment variable.`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("API key not set"))
        throw e;
      throw new Error(`API key not set for provider "${providerName}". Set the ${apiKeyEnv} environment variable.`);
    }
  }
  return { apiKey, baseUrl, providerType: providerConfig.type };
}

// src/proxy/response/stream.ts
var UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000;
function buildUpstreamSignal(clientSignal, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!clientSignal)
    return timeoutSignal;
  const any = AbortSignal.any;
  if (typeof any === "function") {
    return any([clientSignal, timeoutSignal]);
  }
  return timeoutSignal;
}
function createStreamingResponse(upstreamResponse, overrideHeaders, originalModel, providerModel) {
  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  const isSSE = contentType.includes("text/event-stream");
  const headers = new Headers;
  const forwardHeaders = [
    "content-type",
    "x-request-id",
    "anthropic-ratelimit-requests-limit",
    "anthropic-ratelimit-requests-remaining",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-tokens-limit",
    "anthropic-ratelimit-tokens-remaining",
    "anthropic-ratelimit-tokens-reset"
  ];
  for (const name of forwardHeaders) {
    const value = upstreamResponse.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (overrideHeaders) {
    for (const [key, value] of Object.entries(overrideHeaders)) {
      headers.set(key, value);
    }
  }
  if (isSSE) {
    headers.set("content-type", "text/event-stream");
    headers.set("cache-control", "no-cache");
    headers.set("connection", "keep-alive");
  }
  if (!upstreamResponse.body) {
    return new Response(null, {
      status: upstreamResponse.status,
      headers
    });
  }
  if (isSSE && originalModel) {
    console.error(`[stream] Transforming SSE model: "${providerModel ?? "?"}" \u2192 "${originalModel}"`);
    const transformedStream = upstreamResponse.body.pipeThrough(new SSEModelTransformStream(originalModel));
    return new Response(transformedStream, {
      status: upstreamResponse.status,
      headers
    });
  }
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers
  });
}
async function forwardToUpstream(originalRequest, targetUrl, apiKey, bodyOverride, passthroughAuth, rawBodyText, useBearerAuth) {
  const headers = new Headers;
  const forwardFromClient = [
    "content-type",
    "anthropic-version",
    "anthropic-beta",
    "accept"
  ];
  for (const name of forwardFromClient) {
    const value = originalRequest.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (passthroughAuth) {
    const authHeaders = ["authorization", "x-api-key"];
    for (const name of authHeaders) {
      const value = originalRequest.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
  } else if (useBearerAuth) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  } else {
    headers.set("x-api-key", apiKey);
  }
  headers.set("user-agent", "oh-my-claude/2.0");
  let body = null;
  if (bodyOverride) {
    body = JSON.stringify(bodyOverride);
    headers.set("content-type", "application/json");
  } else if (rawBodyText !== undefined) {
    body = rawBodyText;
  } else if (originalRequest.body) {
    body = await originalRequest.text();
  }
  const upstreamResponse = await fetch(targetUrl, {
    method: originalRequest.method,
    headers,
    body,
    signal: buildUpstreamSignal(originalRequest.signal, UPSTREAM_TIMEOUT_MS)
  });
  return upstreamResponse;
}

class SSEModelTransformStream extends TransformStream {
  decoder = new TextDecoder;
  encoder = new TextEncoder;
  buffer = "";
  originalModel;
  constructor(originalModel) {
    super({
      transform: (chunk, controller) => this._transform(chunk, controller),
      flush: (controller) => this._flush(controller)
    });
    this.originalModel = originalModel;
  }
  _transform(chunk, controller) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split(`
`);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      let outputLine = line;
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          if (typeof data.model === "string") {
            data.model = this.originalModel;
            outputLine = `data: ${JSON.stringify(data)}`;
          }
        } catch {}
      }
      controller.enqueue(this.encoder.encode(outputLine + `
`));
    }
  }
  _flush(controller) {
    if (this.buffer.length > 0) {
      controller.enqueue(this.encoder.encode(this.buffer));
    }
  }
}

// src/proxy/handlers/passthrough.ts
init_session();

// src/proxy/sanitizers/types.ts
var SUPPORTED_CONTENT_TYPES = new Set([
  "text",
  "tool_use",
  "tool_result",
  "image"
]);
var THINKING_CONTENT_TYPES = new Set([
  "thinking",
  "redacted_thinking"
]);
var UNSUPPORTED_TOP_LEVEL_KEYS = new Set([
  "thinking"
]);
function stripTopLevelKeys(body) {
  let count = 0;
  for (const key of UNSUPPORTED_TOP_LEVEL_KEYS) {
    if (key in body) {
      delete body[key];
      count++;
    }
  }
  return count;
}
function stripThinkingBlocks(body) {
  const messages = body.messages;
  if (!Array.isArray(messages))
    return 0;
  let strippedCount = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object")
      continue;
    const content = message.content;
    if (typeof content === "string" || !Array.isArray(content))
      continue;
    const filtered = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }
      const blockType = block.type;
      if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
        strippedCount++;
      } else {
        if (blockType === "tool_result") {
          strippedCount += stripThinkingFromNested(block);
        }
        filtered.push(block);
      }
    }
    if (filtered.length === 0) {
      message.content = [
        { type: "text", text: "[thinking content stripped]" }
      ];
    } else {
      message.content = filtered;
    }
  }
  return strippedCount;
}
function stripThinkingFromNested(block) {
  const content = block.content;
  if (typeof content === "string" || !Array.isArray(content))
    return 0;
  let strippedCount = 0;
  const filtered = [];
  for (const nested of content) {
    if (!nested || typeof nested !== "object") {
      filtered.push(nested);
      continue;
    }
    const nestedType = nested.type;
    if (nestedType && THINKING_CONTENT_TYPES.has(nestedType)) {
      strippedCount++;
    } else {
      filtered.push(nested);
    }
  }
  if (filtered.length === 0) {
    block.content = [{ type: "text", text: "[thinking content stripped]" }];
  } else {
    block.content = filtered;
  }
  return strippedCount;
}
function stripUnsupportedContentTypes(body, keepThinking = false) {
  const messages = body.messages;
  if (!Array.isArray(messages))
    return;
  const strippedTypes = new Set;
  for (const message of messages) {
    if (!message || typeof message !== "object")
      continue;
    const content = message.content;
    if (typeof content === "string" || !Array.isArray(content))
      continue;
    const filtered = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }
      const blockType = block.type;
      if (!blockType) {
        filtered.push(block);
        continue;
      }
      if (SUPPORTED_CONTENT_TYPES.has(blockType) || keepThinking && THINKING_CONTENT_TYPES.has(blockType)) {
        if (blockType === "tool_result") {
          stripUnsupportedFromToolResult(block, strippedTypes);
        }
        filtered.push(block);
      } else {
        strippedTypes.add(blockType);
      }
    }
    if (filtered.length === 0) {
      message.content = [
        { type: "text", text: "[content filtered]" }
      ];
    } else {
      message.content = filtered;
    }
  }
  if (strippedTypes.size > 0) {
    console.error(`[sanitize] Stripped content block types: ${[...strippedTypes].join(", ")}`);
  }
}
function stripUnsupportedFromToolResult(block, strippedTypes) {
  const content = block.content;
  if (typeof content === "string" || !Array.isArray(content))
    return;
  const filtered = [];
  for (const nested of content) {
    if (!nested || typeof nested !== "object") {
      filtered.push(nested);
      continue;
    }
    const nestedType = nested.type;
    if (!nestedType || SUPPORTED_CONTENT_TYPES.has(nestedType)) {
      filtered.push(nested);
    } else {
      strippedTypes.add(nestedType);
    }
  }
  if (filtered.length === 0) {
    block.content = [{ type: "text", text: "[content filtered]" }];
  } else {
    block.content = filtered;
  }
}

// src/proxy/handlers/passthrough.ts
var THINKING_SIGNATURE_ERROR = "Invalid `signature` in `thinking` block";
async function handlePassthrough(req, reqId, bodyText, sessionTag = "") {
  const { apiKey, baseUrl, authMode } = getPassthroughAuth();
  const isOAuth = authMode === "oauth";
  const url = new URL(req.url);
  const sessionInfo = parseSessionFromPath(url.pathname);
  const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
  const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;
  console.error(`[proxy #${reqId}]${sessionTag} \u2192 Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${canonicalPath}`);
  const upstreamResponse = await forwardToUpstream(req, targetUrl, apiKey, undefined, isOAuth, bodyText);
  if (upstreamResponse.status === 400) {
    const responseBody = await upstreamResponse.text();
    if (responseBody.includes(THINKING_SIGNATURE_ERROR)) {
      console.error(`[proxy #${reqId}]${sessionTag} \u26A0 Anthropic rejected thinking block signature, retrying with thinking stripped`);
      try {
        const body = JSON.parse(bodyText);
        const strippedBlocks = stripThinkingBlocks(body);
        const strippedKeys = stripTopLevelKeys(body);
        console.error(`[proxy #${reqId}]${sessionTag} Stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`);
        const retryResponse = await forwardToUpstream(req, targetUrl, apiKey, body, isOAuth);
        return createStreamingResponse(retryResponse);
      } catch (retryError) {
        console.error(`[proxy #${reqId}]${sessionTag} Retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
        return new Response(responseBody, {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
    }
    return new Response(responseBody, {
      status: 400,
      headers: {
        "content-type": upstreamResponse.headers.get("content-type") ?? "application/json"
      }
    });
  }
  return createStreamingResponse(upstreamResponse);
}

// src/proxy/sanitizers/deepseek.ts
function sanitizeDeepSeekV4(body, opts = {}) {
  const model = typeof body.model === "string" ? body.model : "";
  const thinkingDisabled = isThinkingExplicitlyDisabled(body);
  const thinkingRequested = isThinkingExplicitlyEnabled(body);
  if (thinkingDisabled) {
    applyFastPath(body);
    return;
  }
  const useThinkingPath = (() => {
    if (opts.effort)
      return true;
    if (model === "deepseek-v4-pro")
      return true;
    if (thinkingRequested)
      return true;
    return false;
  })();
  if (useThinkingPath) {
    applyThinkingPath(body, opts.effort ?? "max");
    return;
  }
  applyFastPath(body);
}
function isThinkingExplicitlyDisabled(body) {
  const t = body.thinking;
  if (!t || typeof t !== "object")
    return false;
  return t.type === "disabled";
}
function applyThinkingPath(body, effort) {
  ensureThinkingEnabled(body);
  ensureEffort(body, effort);
  const replaced = replaceThinkingBlocksForV4(body);
  if (replaced > 0) {
    console.error(`[sanitize:deepseek-v4] thinking path: replaced ${replaced} thinking blocks, effort=${effort}`);
  }
  stripUnsupportedContentTypes(body, true);
}
function ensureThinkingEnabled(body) {
  const existing = body.thinking;
  if (existing && typeof existing === "object") {
    const t = existing;
    if (t.type === "disabled")
      return;
    t.type = "enabled";
    return;
  }
  body.thinking = { type: "enabled" };
}
function ensureEffort(body, effort) {
  const current = body.output_config;
  if (current && typeof current === "object") {
    current.effort = effort;
    return;
  }
  body.output_config = { effort };
}
function isThinkingExplicitlyEnabled(body) {
  const t = body.thinking;
  if (!t || typeof t !== "object")
    return false;
  return t.type === "enabled";
}
function replaceThinkingBlocksForV4(body) {
  const messages = body.messages;
  if (!Array.isArray(messages))
    return 0;
  let count = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object")
      continue;
    const msg = message;
    if (msg.role !== "assistant")
      continue;
    const content = msg.content;
    if (typeof content === "string") {
      msg.content = [
        { type: "thinking", thinking: "" },
        { type: "text", text: content }
      ];
      count++;
      continue;
    }
    if (!Array.isArray(content))
      continue;
    let hasThinking = false;
    const filtered = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        filtered.push(block);
        continue;
      }
      const blockType = block.type;
      if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
        if (!hasThinking) {
          filtered.push({ type: "thinking", thinking: "" });
          hasThinking = true;
        }
        count++;
      } else {
        filtered.push(block);
      }
    }
    if (!hasThinking) {
      filtered.unshift({ type: "thinking", thinking: "" });
      count++;
    }
    msg.content = filtered;
  }
  return count;
}
function applyFastPath(body) {
  const topLevelStripped = stripTopLevelKeys(body);
  if (body.output_config && typeof body.output_config === "object") {
    const oc = body.output_config;
    delete oc.effort;
    if (Object.keys(oc).length === 0)
      delete body.output_config;
  }
  const blocksStripped = stripThinkingBlocks(body);
  stripUnsupportedContentTypes(body, false);
  if (topLevelStripped + blocksStripped > 0) {
    console.error(`[sanitize:deepseek-v4] fast path: stripped ${topLevelStripped} top-level keys, ${blocksStripped} thinking blocks`);
  }
}

// src/proxy/sanitizers/openrouter.ts
var OPENROUTER_USER_ID_MAX = 128;
var OPENROUTER_MAX_TOOLS = 64;
function sanitizeOpenRouter(body) {
  truncateUserId(body);
  const strippedBlocks = stripThinkingBlocks(body);
  const strippedKeys = stripTopLevelKeys(body);
  if (strippedKeys > 0 || strippedBlocks > 0) {
    console.error(`[sanitize:openrouter] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`);
  }
  capTools(body);
  stripUnsupportedContentTypes(body, false);
}
function truncateUserId(body) {
  const metadata = body.metadata;
  if (metadata && typeof metadata.user_id === "string") {
    if (metadata.user_id.length > OPENROUTER_USER_ID_MAX) {
      metadata.user_id = metadata.user_id.slice(0, OPENROUTER_USER_ID_MAX);
      console.error(`[sanitize:openrouter] truncated metadata.user_id to ${OPENROUTER_USER_ID_MAX} chars`);
    }
  }
}
function capTools(body) {
  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length <= OPENROUTER_MAX_TOOLS)
    return;
  const original = tools.length;
  body.tools = tools.slice(0, OPENROUTER_MAX_TOOLS);
  console.error(`[sanitize:openrouter] capped tools from ${original} to ${OPENROUTER_MAX_TOOLS}`);
}

// src/proxy/sanitizers/index.ts
function sanitizeRequestBody(body, provider, opts) {
  switch (provider) {
    case "deepseek": {
      sanitizeDeepSeekV4(body, { effort: opts?.effort });
      return;
    }
    case "kimi":
      sanitizeAnthropicCompatible(body, "kimi");
      return;
    case "ollama":
      stripUnsupportedContentTypes(body, true);
      return;
    case "openrouter":
      sanitizeOpenRouter(body);
      return;
    default:
      return;
  }
}
function sanitizeAnthropicCompatible(body, provider) {
  const strippedBlocks = stripThinkingBlocks(body);
  const strippedKeys = stripTopLevelKeys(body);
  if (strippedKeys > 0 || strippedBlocks > 0) {
    console.error(`[sanitize:${provider}] stripped ${strippedBlocks} thinking blocks, ${strippedKeys} top-level keys`);
  }
  stripUnsupportedContentTypes(body, false);
}
// src/proxy/identity.ts
function rewriteSystemIdentity(body, model) {
  const system = body.system;
  if (!system)
    return;
  if (typeof system === "string") {
    body.system = rewriteIdentityText(system, model);
    return;
  }
  if (Array.isArray(system)) {
    for (const block of system) {
      if (block && typeof block === "object" && block.type === "text") {
        const b = block;
        if (typeof b.text === "string") {
          b.text = rewriteIdentityText(b.text, model);
        }
      }
    }
  }
}
function rewriteIdentityText(text, model) {
  const original = text;
  const identityOverride = `[IMPORTANT: You are ${model}, routed via oh-my-claude proxy. ` + `When asked about your identity, respond as ${model}. ` + `Do NOT claim to be Claude or any Anthropic model.]

`;
  text = text.replace(/You are Claude Code, Anthropic's official CLI for Claude\./g, `You are Claude Code, currently routed to ${model} via oh-my-claude proxy.`);
  text = text.replace(/You are powered by the model named .+?\. The exact model ID is [\w.-]+\./g, `You are powered by the model named ${model}. The exact model ID is ${model}.`);
  text = text.replace(/The most recent Claude model family is .+$/gm, `You are currently running as ${model} via oh-my-claude proxy.`);
  text = text.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, "");
  text = text.replace(/Assistant knowledge cutoff is [A-Za-z]+ \d{4}\./g, `Assistant is currently running as ${model}.`);
  if (text !== original) {
    text = identityOverride + text;
    console.error(`[identity] Rewrote system prompt identity for ${model}`);
  }
  return text;
}

// src/proxy/converters/openai-stream.ts
import { randomUUID as randomUUID2 } from "crypto";
function isOpenAIFormatProvider(providerType) {
  return providerType === "openai-oauth" || providerType === "openai-compatible";
}

class OpenAIToAnthropicStreamConverter extends TransformStream {
  decoder = new TextDecoder;
  encoder = new TextEncoder;
  buffer = "";
  originalModel;
  messageId;
  sentMessageStart = false;
  sentBlockStart = false;
  contentBlockIndex = 0;
  outputTokens = 0;
  constructor(originalModel) {
    super({
      transform: (chunk, controller) => this._transform(chunk, controller),
      flush: (controller) => this._flush(controller)
    });
    this.originalModel = originalModel;
    this.messageId = `msg_${randomUUID2().replace(/-/g, "").slice(0, 24)}`;
  }
  _transform(chunk, controller) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split(`
`);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: "))
        continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") {
        this.emitEnd(controller);
        continue;
      }
      try {
        const data = JSON.parse(dataStr);
        this.processChunk(data, controller);
      } catch {}
    }
  }
  processChunk(data, controller) {
    const usage = data.usage;
    if (usage?.completion_tokens) {
      this.outputTokens = usage.completion_tokens;
    }
    const choices = data.choices;
    if (!choices || choices.length === 0)
      return;
    const choice = choices[0];
    const delta = choice.delta;
    const finishReason = choice.finish_reason;
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
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      });
      this.sentMessageStart = true;
    }
    if (delta) {
      const toolCalls = delta.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          this.processToolCallDelta(tc, controller);
        }
        return;
      }
      const content = delta.content;
      if (content !== undefined && content !== null) {
        if (!this.sentBlockStart) {
          this.emitEvent(controller, "content_block_start", {
            type: "content_block_start",
            index: this.contentBlockIndex,
            content_block: { type: "text", text: "" }
          });
          this.sentBlockStart = true;
        }
        this.outputTokens += Math.max(1, Math.ceil(content.length / 4));
        this.emitEvent(controller, "content_block_delta", {
          type: "content_block_delta",
          index: this.contentBlockIndex,
          delta: { type: "text_delta", text: content }
        });
      }
    }
    if (finishReason) {
      this.emitEnd(controller, finishReason);
    }
  }
  processToolCallDelta(tc, controller) {
    const fn = tc.function;
    if (!fn)
      return;
    const id = tc.id;
    const name = fn.name;
    const args = fn.arguments;
    if (id && name) {
      if (this.sentBlockStart) {
        this.emitEvent(controller, "content_block_stop", {
          type: "content_block_stop",
          index: this.contentBlockIndex
        });
        this.contentBlockIndex++;
        this.sentBlockStart = false;
      }
      this.emitEvent(controller, "content_block_start", {
        type: "content_block_start",
        index: this.contentBlockIndex,
        content_block: { type: "tool_use", id, name, input: {} }
      });
      this.sentBlockStart = true;
    }
    if (args) {
      this.emitEvent(controller, "content_block_delta", {
        type: "content_block_delta",
        index: this.contentBlockIndex,
        delta: { type: "input_json_delta", partial_json: args }
      });
    }
  }
  emitEnd(controller, finishReason) {
    if (this.sentBlockStart) {
      this.emitEvent(controller, "content_block_stop", {
        type: "content_block_stop",
        index: this.contentBlockIndex
      });
      this.sentBlockStart = false;
    }
    let stopReason;
    switch (finishReason) {
      case "stop":
        stopReason = "end_turn";
        break;
      case "length":
        stopReason = "max_tokens";
        break;
      case "tool_calls":
      case "function_call":
        stopReason = "tool_use";
        break;
      case "content_filter":
        stopReason = "stop_sequence";
        break;
      default:
        if (finishReason) {
          console.warn(`[openai-stream] unknown finish_reason "${finishReason}", mapping to end_turn`);
        }
        stopReason = "end_turn";
        break;
    }
    this.emitEvent(controller, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: this.outputTokens }
    });
    this.emitEvent(controller, "message_stop", { type: "message_stop" });
  }
  emitEvent(controller, eventType, data) {
    const output = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
    controller.enqueue(this.encoder.encode(output));
  }
  _flush(controller) {
    if (this.sentMessageStart && this.sentBlockStart) {
      this.emitEnd(controller);
    }
    if (this.buffer.length > 0) {
      if (this.buffer.startsWith("data: ")) {
        const dataStr = this.buffer.slice(6).trim();
        if (dataStr === "[DONE]") {
          this.emitEnd(controller);
        }
      }
    }
  }
}

// src/proxy/converters/openai-request.ts
import { randomUUID as randomUUID3 } from "crypto";
function convertAnthropicToOpenAI(body, targetModel) {
  const messages = [];
  const system = body.system;
  if (system) {
    if (typeof system === "string") {
      messages.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      const text = system.filter((b) => b.type === "text" && b.text).map((b) => b.text).join(`

`);
      if (text) {
        messages.push({ role: "system", content: text });
      }
    }
  }
  const anthropicMessages = body.messages ?? [];
  for (const msg of anthropicMessages) {
    const converted = convertMessage(msg);
    if (converted.length > 0) {
      messages.push(...converted);
    }
  }
  const result = {
    model: targetModel,
    messages,
    stream: body.stream ?? true
  };
  if (result.stream === true) {
    result.stream_options = { include_usage: true };
  }
  if (body.temperature !== undefined)
    result.temperature = body.temperature;
  if (body.max_tokens !== undefined)
    result.max_tokens = body.max_tokens;
  if (body.top_p !== undefined)
    result.top_p = body.top_p;
  if (body.stop_sequences !== undefined)
    result.stop = body.stop_sequences;
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    result.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));
  }
  return result;
}
function convertMessage(msg) {
  if (typeof msg.content === "string") {
    return [{ role: msg.role, content: msg.content }];
  }
  if (!Array.isArray(msg.content)) {
    return [{ role: msg.role, content: msg.content }];
  }
  const blocks = msg.content;
  const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
  const toolResultBlocks = blocks.filter((b) => b.type === "tool_result");
  if (toolResultBlocks.length > 0 && msg.role === "user") {
    const results = [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(`
`) : JSON.stringify(block.content ?? "");
        results.push({
          role: "tool",
          tool_call_id: block.tool_use_id ?? "",
          content
        });
      } else if (block.type === "text" && block.text) {
        results.push({ role: "user", content: block.text });
      }
    }
    return results;
  }
  if (toolUseBlocks.length > 0 && msg.role === "assistant") {
    const textParts = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("");
    const toolCalls = toolUseBlocks.map((b) => ({
      id: b.id ?? randomUUID3(),
      type: "function",
      function: {
        name: b.name ?? "",
        arguments: typeof b.input === "string" ? b.input : JSON.stringify(b.input ?? {})
      }
    }));
    return [
      {
        role: "assistant",
        content: textParts || null,
        tool_calls: toolCalls
      }
    ];
  }
  const hasImages = blocks.some((b) => b.type === "image");
  if (hasImages) {
    const parts = [];
    for (const block of blocks) {
      if (block.type === "text" && block.text) {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "image" && block.source) {
        parts.push({
          type: "image_url",
          image_url: {
            url: `data:${block.source.media_type};base64,${block.source.data}`
          }
        });
      }
    }
    return [{ role: msg.role, content: parts }];
  }
  const text = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("");
  return [{ role: msg.role, content: text || "" }];
}

// src/proxy/converters/responses-request.ts
import { randomUUID as randomUUID4 } from "crypto";
function convertAnthropicToResponses(body, targetModel) {
  const input = [];
  const toolIdMap = new Map;
  const anthropicMessages = body.messages ?? [];
  for (const msg of anthropicMessages) {
    const items = convertMessageToInputItems(msg, toolIdMap);
    input.push(...items);
  }
  const result = {
    model: targetModel,
    input,
    stream: true,
    store: false
  };
  const system = body.system;
  if (system) {
    if (typeof system === "string") {
      result.instructions = system;
    } else if (Array.isArray(system)) {
      const text = system.filter((b) => b.type === "text" && b.text).map((b) => b.text).join(`

`);
      result.instructions = text || "You are a helpful assistant.";
    }
  } else {
    result.instructions = "You are a helpful assistant.";
  }
  const tools = body.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    result.tools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }));
  }
  return result;
}
function mapToolId(anthropicId, idMap) {
  const existing = idMap.get(anthropicId);
  if (existing)
    return existing;
  const suffix = anthropicId.startsWith("toolu_") ? anthropicId.slice(6) : randomUUID4().replace(/-/g, "");
  const fcId = `fc_${suffix}`;
  idMap.set(anthropicId, fcId);
  return fcId;
}
function convertMessageToInputItems(msg, toolIdMap) {
  if (typeof msg.content === "string") {
    if (msg.role === "assistant") {
      return [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: msg.content }]
        }
      ];
    }
    return [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: msg.content }]
      }
    ];
  }
  if (!Array.isArray(msg.content)) {
    return [
      {
        type: "message",
        role: msg.role === "assistant" ? "assistant" : "user",
        content: [
          {
            type: msg.role === "assistant" ? "output_text" : "input_text",
            text: String(msg.content)
          }
        ]
      }
    ];
  }
  const blocks = msg.content;
  const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
  const toolResultBlocks = blocks.filter((b) => b.type === "tool_result");
  if (toolResultBlocks.length > 0 && msg.role === "user") {
    const items = [];
    for (const block of blocks) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? block.content : Array.isArray(block.content) ? block.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(`
`) : JSON.stringify(block.content ?? "");
        const anthropicId = block.tool_use_id ?? "";
        items.push({
          type: "function_call_output",
          call_id: toolIdMap.get(anthropicId) ?? mapToolId(anthropicId, toolIdMap),
          output: content
        });
      } else if (block.type === "text" && block.text) {
        items.push({
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: block.text }]
        });
      }
    }
    return items;
  }
  if (toolUseBlocks.length > 0 && msg.role === "assistant") {
    const items = [];
    const textParts = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("");
    if (textParts) {
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: textParts }]
      });
    }
    for (const block of toolUseBlocks) {
      const anthropicId = block.id ?? "";
      const fcId = mapToolId(anthropicId, toolIdMap);
      items.push({
        type: "function_call",
        id: fcId,
        call_id: fcId,
        name: block.name ?? "",
        arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? {}),
        status: "completed"
      });
    }
    return items;
  }
  const contentParts = [];
  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      contentParts.push({
        type: msg.role === "assistant" ? "output_text" : "input_text",
        text: block.text
      });
    } else if (block.type === "image" && block.source) {
      contentParts.push({
        type: "input_image",
        image_url: `data:${block.source.media_type};base64,${block.source.data}`
      });
    }
  }
  if (contentParts.length === 0) {
    contentParts.push({
      type: msg.role === "assistant" ? "output_text" : "input_text",
      text: ""
    });
  }
  return [
    {
      type: "message",
      role: msg.role === "assistant" ? "assistant" : "user",
      content: contentParts
    }
  ];
}

// src/proxy/handlers/switched.ts
init_cache();

// src/proxy/routing/provider-forward.ts
async function forwardToProvider(req, targetUrl, apiKey, body, isOpenAIFormat, provider, providerType) {
  if (!isOpenAIFormat) {
    const cleanReq = new Request(req, {
      headers: new Headers(req.headers)
    });
    if (provider !== "ollama") {
      cleanReq.headers.delete("anthropic-beta");
    }
    const useBearerAuth = provider === "openrouter";
    return forwardToUpstream(cleanReq, targetUrl, apiKey, body, false, undefined, useBearerAuth);
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  const accept = req.headers.get("accept");
  if (accept)
    headers["Accept"] = accept;
  if (providerType === "openai-oauth") {
    headers["originator"] = "oh-my-claude";
    try {
      const { getCredential: getCredential2 } = await Promise.resolve().then(() => (init_store(), exports_store));
      const cred = getCredential2("openai");
      if (cred && cred.type === "oauth-openai" && cred.accountId) {
        headers["ChatGPT-Account-Id"] = cred.accountId;
      }
    } catch {}
  }
  return fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: buildUpstreamSignal(req.signal, 300000)
  });
}

// src/proxy/converters/responses-stream.ts
import { randomUUID as randomUUID5 } from "crypto";

class ResponsesToAnthropicStreamConverter extends TransformStream {
  decoder = new TextDecoder;
  encoder = new TextEncoder;
  buffer = "";
  originalModel;
  messageId;
  sentMessageStart = false;
  contentBlockIndex = 0;
  outputItemToBlock = new Map;
  openBlocks = new Set;
  outputTokens = 0;
  constructor(originalModel) {
    super({
      transform: (chunk, controller) => this._transform(chunk, controller),
      flush: (controller) => this._flush(controller)
    });
    this.originalModel = originalModel;
    this.messageId = `msg_${randomUUID5().replace(/-/g, "").slice(0, 24)}`;
  }
  _transform(chunk, controller) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split(`
`);
    this.buffer = lines.pop() ?? "";
    let currentEventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: "))
        continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") {
        this.emitEnd(controller);
        continue;
      }
      try {
        const data = JSON.parse(dataStr);
        this.processEvent(currentEventType, data, controller);
      } catch {}
    }
  }
  processEvent(eventType, data, controller) {
    const type = eventType || data.type || "";
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
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      });
      this.sentMessageStart = true;
    }
    switch (type) {
      case "response.output_item.added": {
        const item = data.item;
        if (!item)
          break;
        const itemId = item.id ?? "";
        const itemType = item.type;
        const blockIdx = this.contentBlockIndex++;
        this.outputItemToBlock.set(itemId, blockIdx);
        this.openBlocks.add(blockIdx);
        if (itemType === "message" || itemType === "text") {
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" }
          });
        } else if (itemType === "function_call") {
          const name = item.name ?? "";
          const callId = item.call_id ?? itemId;
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: {
              type: "tool_use",
              id: callId,
              name,
              input: {}
            }
          });
        }
        break;
      }
      case "response.content_part.added": {
        const part = data.part;
        if (!part)
          break;
        if (this.openBlocks.size === 0) {
          const blockIdx = this.contentBlockIndex++;
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" }
          });
        }
        break;
      }
      case "response.output_text.delta": {
        const delta = data.delta ?? "";
        if (!delta)
          break;
        this.outputTokens += Math.max(1, Math.ceil(delta.length / 4));
        const itemId = data.item_id ?? "";
        let blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx === undefined) {
          blockIdx = this.contentBlockIndex++;
          this.outputItemToBlock.set(itemId, blockIdx);
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: { type: "text", text: "" }
          });
        }
        this.emitSSE(controller, "content_block_delta", {
          type: "content_block_delta",
          index: blockIdx,
          delta: { type: "text_delta", text: delta }
        });
        break;
      }
      case "response.function_call_arguments.delta": {
        const delta = data.delta ?? "";
        if (!delta)
          break;
        const itemId = data.item_id ?? "";
        let blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx === undefined) {
          blockIdx = this.contentBlockIndex++;
          this.outputItemToBlock.set(itemId, blockIdx);
          this.openBlocks.add(blockIdx);
          this.emitSSE(controller, "content_block_start", {
            type: "content_block_start",
            index: blockIdx,
            content_block: {
              type: "tool_use",
              id: itemId,
              name: "",
              input: {}
            }
          });
        }
        this.emitSSE(controller, "content_block_delta", {
          type: "content_block_delta",
          index: blockIdx,
          delta: { type: "input_json_delta", partial_json: delta }
        });
        break;
      }
      case "response.output_item.done": {
        const item = data.item;
        const itemId = item?.id ?? "";
        const blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx
          });
          this.openBlocks.delete(blockIdx);
        }
        break;
      }
      case "response.output_text.done":
      case "response.content_part.done": {
        const itemId = data.item_id ?? "";
        const blockIdx = this.outputItemToBlock.get(itemId);
        if (blockIdx !== undefined && this.openBlocks.has(blockIdx)) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx
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
        const error = data.error;
        const errorMsg = error?.message ?? "Unknown error from Codex API";
        const errorType = error?.type ?? "api_error";
        for (const blockIdx of this.openBlocks) {
          this.emitSSE(controller, "content_block_stop", {
            type: "content_block_stop",
            index: blockIdx
          });
        }
        this.openBlocks.clear();
        this.emitSSE(controller, "error", {
          type: "error",
          error: {
            type: errorType,
            message: errorMsg
          }
        });
        console.error(`[responses-converter] Response failed: ${errorMsg}`);
        break;
      }
      case "response.created":
      case "response.in_progress":
        break;
      default:
        if (type && !type.startsWith("response.")) {
          console.error(`[responses-converter] Unknown event type: ${type}`);
        }
        break;
    }
  }
  emitEnd(controller, completedData) {
    for (const blockIdx of this.openBlocks) {
      this.emitSSE(controller, "content_block_stop", {
        type: "content_block_stop",
        index: blockIdx
      });
    }
    this.openBlocks.clear();
    const response = completedData?.response;
    const usage = response?.usage;
    const outputTokens = usage?.output_tokens ?? this.outputTokens;
    const status = response?.status ?? "completed";
    const stopReason = status === "completed" ? "end_turn" : status === "incomplete" ? "max_tokens" : "end_turn";
    this.emitSSE(controller, "message_delta", {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: outputTokens }
    });
    this.emitSSE(controller, "message_stop", { type: "message_stop" });
  }
  emitSSE(controller, eventType, data) {
    const output = `event: ${eventType}
data: ${JSON.stringify(data)}

`;
    controller.enqueue(this.encoder.encode(output));
  }
  _flush(controller) {
    if (this.sentMessageStart && this.openBlocks.size > 0) {
      this.emitEnd(controller);
    }
  }
}

// src/proxy/response/builders.ts
async function createOpenAIToAnthropicResponse(upstreamResponse, originalModel, sessionId, provider) {
  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") && contentType.includes("application/json")) {
    const data = await upstreamResponse.json();
    const anthropic = convertOpenAIJsonToAnthropic(data, originalModel);
    return new Response(JSON.stringify(anthropic), {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json" }
    });
  }
  if (!upstreamResponse.body) {
    return new Response(null, { status: upstreamResponse.status });
  }
  console.error(`[stream] Converting OpenAI SSE \u2192 Anthropic SSE (model: "${originalModel}")`);
  const converter = new OpenAIToAnthropicStreamConverter(originalModel);
  if (sessionId && provider) {
    const { startCapture: startCapture2, appendText: appendText2, completeCapture: completeCapture2 } = await Promise.resolve().then(() => (init_cache(), exports_cache));
    const seq = startCapture2(sessionId, provider, originalModel);
    let inputTokens = 0;
    let outputTokens = 0;
    const captureTransform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        const text = new TextDecoder().decode(chunk);
        const lines = text.split(`
`);
        for (const line of lines) {
          if (line.startsWith("data: ") && line.includes("content_block_delta")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.delta?.text)
                appendText2(sessionId, seq, data.delta.text);
            } catch {}
          }
          if (line.startsWith("data: ") && line.includes("message_start")) {
            try {
              const data = JSON.parse(line.slice(6));
              inputTokens = data.message?.usage?.input_tokens || 0;
            } catch {}
          }
          if (line.startsWith("data: ") && line.includes("message_delta")) {
            try {
              const data = JSON.parse(line.slice(6));
              outputTokens = data.usage?.output_tokens || 0;
            } catch {}
          }
          if (line.startsWith("data: ") && line.includes("message_stop")) {
            completeCapture2(sessionId, seq, {
              inputTokens,
              outputTokens
            });
          }
        }
      }
    });
    const converterStream = captureTransform.readable;
    const captureWriter = captureTransform.writable.getWriter();
    const converterReader = converter.readable.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await converterReader.read();
          if (done)
            break;
          await captureWriter.write(value);
        }
        await captureWriter.close();
      } catch (err) {
        try {
          captureWriter.abort(err);
        } catch {}
      }
    })();
    return new Response(converterStream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      }
    });
  }
  const transformedStream = upstreamResponse.body.pipeThrough(converter);
  return new Response(transformedStream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}
async function createResponsesToAnthropicResponse(upstreamResponse, originalModel) {
  if (upstreamResponse.status >= 400) {
    let errorBody = "";
    try {
      errorBody = await upstreamResponse.text();
      console.error(`[proxy] Codex API error: ${upstreamResponse.status} ${errorBody}`);
    } catch {
      console.error(`[proxy] Codex API error: ${upstreamResponse.status} (could not read body)`);
    }
    return new Response(errorBody || null, {
      status: upstreamResponse.status,
      headers: {
        "content-type": upstreamResponse.headers.get("content-type") || "application/json"
      }
    });
  }
  if (!upstreamResponse.body) {
    return new Response(null, { status: upstreamResponse.status });
  }
  const responseContentType = upstreamResponse.headers.get("content-type") ?? "";
  if (responseContentType.includes("application/json") && !responseContentType.includes("text/event-stream")) {
    const data = await upstreamResponse.json();
    const anthropic = convertResponsesJsonToAnthropic(data, originalModel);
    return new Response(JSON.stringify(anthropic), {
      status: upstreamResponse.status,
      headers: { "content-type": "application/json" }
    });
  }
  console.error(`[stream] Converting Responses API SSE \u2192 Anthropic SSE (model: "${originalModel}")`);
  const converter = new ResponsesToAnthropicStreamConverter(originalModel);
  const writer = converter.writable.getWriter();
  const reader = upstreamResponse.body.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        await writer.write(value);
      }
      await writer.close();
    } catch (err) {
      console.error(`[codex] Stream pipe error: ${err instanceof Error ? err.message : String(err)}`);
      try {
        writer.abort(err);
      } catch {}
    }
  })();
  return new Response(converter.readable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}
async function collectStreamToAnthropicJson(sseResponse, originalModel) {
  if (!sseResponse.body) {
    return new Response(JSON.stringify({
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "" }],
      model: originalModel,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const reader = sseResponse.body.getReader();
  const decoder = new TextDecoder;
  let buffer = "";
  let messageId = `msg_${Date.now()}`;
  const textBlocks = [];
  let stopReason = "end_turn";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(`
`);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: "))
          continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]")
          continue;
        try {
          const data = JSON.parse(dataStr);
          const type = data.type;
          if (type === "message_start") {
            const msg = data.message;
            if (msg?.id)
              messageId = msg.id;
            const usage = msg?.usage;
            if (usage?.input_tokens)
              inputTokens = usage.input_tokens;
          } else if (type === "content_block_delta") {
            const delta = data.delta;
            if (delta?.type === "text_delta") {
              textBlocks.push(delta.text);
            }
          } else if (type === "message_delta") {
            const delta = data.delta;
            if (delta?.stop_reason)
              stopReason = delta.stop_reason;
            const usage = data.usage;
            if (usage?.output_tokens)
              outputTokens = usage.output_tokens;
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
  const result = {
    id: messageId,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: textBlocks.join("") }],
    model: originalModel,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens }
  };
  console.error(`[proxy] Collected streaming response \u2192 JSON (${textBlocks.join("").length} chars)`);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
function convertOpenAIJsonToAnthropic(data, originalModel) {
  const choices = data.choices;
  const message = choices?.[0]?.message;
  const text = message?.content ?? "";
  const usage = data.usage;
  return {
    id: data.id ?? `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: originalModel,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0
    }
  };
}
function convertResponsesJsonToAnthropic(data, originalModel) {
  const output = data.output;
  let text = "";
  if (output) {
    for (const item of output) {
      if (item.type === "message") {
        const itemContent = item.content;
        const textPart = itemContent?.find((c) => c.type === "output_text");
        if (textPart) {
          text = textPart.text ?? "";
          break;
        }
      }
    }
  }
  const usage = data.usage;
  return {
    id: data.id ?? `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: originalModel,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0
    }
  };
}

// src/proxy/handlers/switched.ts
init_session();

// src/proxy/handlers/display.ts
function displayModel(provider, model) {
  return model.startsWith(`${provider}/`) ? model : `${provider}/${model}`;
}

// src/proxy/handlers/switched.ts
async function handleSwitched(req, reqId, bodyText, provider, model, sessionId, sessionTag = "") {
  const config = loadConfig();
  if (!isProviderConfigured(config, provider)) {
    console.error(`[proxy #${reqId}]${sessionTag} Provider "${provider}" not configured (API key missing), ` + `falling back to native Claude`);
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }
  try {
    const { apiKey, baseUrl, providerType } = await getProviderAuth(provider);
    const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
    const openAIFormat = isOpenAIFormatProvider(providerType);
    const body = JSON.parse(bodyText);
    const originalModel = body.model;
    const route = resolveEffectiveRoute(originalModel, model, provider);
    const effectiveModel = route.model;
    rewriteSystemIdentity(body, effectiveModel);
    let targetUrl;
    let forwardBody;
    if (useResponsesAPI) {
      forwardBody = convertAnthropicToResponses(body, effectiveModel);
      targetUrl = `${baseUrl}/responses`;
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, effectiveModel)} (switched/responses-api) /responses`);
    } else if (openAIFormat) {
      forwardBody = convertAnthropicToOpenAI(body, effectiveModel);
      targetUrl = `${baseUrl}/chat/completions`;
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, effectiveModel)} (switched/openai-fmt) /chat/completions`);
    } else {
      body.model = effectiveModel;
      sanitizeRequestBody(body, provider, { effort: route.effort });
      forwardBody = body;
      const url = new URL(req.url);
      targetUrl = `${baseUrl}/v1/messages${url.search}`;
      const modelNote = effectiveModel !== model ? ` (user: ${effectiveModel})` : "";
      const effortNote = route.effort ? ` effort=${route.effort}` : "";
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, effectiveModel)} (switched${modelNote}${effortNote}) /v1/messages`);
    }
    const upstreamResponse = await forwardToProvider(req, targetUrl, apiKey, forwardBody, openAIFormat || useResponsesAPI, provider, providerType);
    trackProviderRequest(provider);
    if (sessionId)
      recordSessionProviderRequest(sessionId, provider);
    let result;
    if (useResponsesAPI) {
      result = await createResponsesToAnthropicResponse(upstreamResponse, originalModel);
    } else if (openAIFormat) {
      result = await createOpenAIToAnthropicResponse(upstreamResponse, originalModel, sessionId, provider);
    } else {
      result = createStreamingResponse(upstreamResponse, undefined, originalModel, effectiveModel);
    }
    return wrapWithCapture(result, sessionId, provider, effectiveModel);
  } catch (error) {
    const message = toErrorMessage(error);
    const cfg = loadConfig();
    if (cfg.proxy?.failClosed !== false) {
      console.error(`[proxy #${reqId}]${sessionTag} Provider "${provider}" request failed: ${message} ` + `(fail-closed \u2192 returning 502; set proxy.failClosed=false to fall back to native Claude)`);
      return new Response(JSON.stringify({
        type: "error",
        error: {
          type: "upstream_error",
          message,
          provider,
          model
        }
      }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }
    console.error(`[proxy #${reqId}]${sessionTag} Provider "${provider}" request failed: ${message}, ` + `falling back to native Claude (proxy.failClosed=false)`);
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }
}

// src/proxy/handlers/directive.ts
init_cache();
init_session();
async function handleDirectiveRoute(req, reqId, bodyText, parsedBody, provider, model, sessionTag, sessionId) {
  const config = loadConfig();
  if (!isProviderConfigured(config, provider)) {
    console.error(`[proxy #${reqId}]${sessionTag} Route directive \u2192 ${displayModel(provider, model)} but provider not configured, ` + `falling back to passthrough`);
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }
  try {
    const { apiKey, baseUrl, providerType } = await getProviderAuth(provider);
    const originalModel = parsedBody.model;
    const useResponsesAPI = RESPONSES_API_PROVIDERS.has(providerType);
    const openAIFormat = isOpenAIFormatProvider(providerType);
    rewriteSystemIdentity(parsedBody, model);
    let targetUrl;
    let forwardBody;
    const requestStream = parsedBody.stream !== false;
    if (useResponsesAPI) {
      forwardBody = convertAnthropicToResponses(parsedBody, model);
      targetUrl = `${baseUrl}/responses`;
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, model)} (directive/responses-api) /responses`);
    } else if (openAIFormat) {
      forwardBody = convertAnthropicToOpenAI(parsedBody, model);
      targetUrl = `${baseUrl}/chat/completions`;
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, model)} (directive/openai-fmt) /chat/completions`);
    } else {
      const body = parsedBody;
      body.model = model;
      const directiveEffort = resolveDirectiveEffort(provider, model);
      sanitizeRequestBody(body, provider, { effort: directiveEffort });
      forwardBody = body;
      const url = new URL(req.url);
      targetUrl = `${baseUrl}/v1/messages${url.search}`;
      const effortNote = directiveEffort ? ` effort=${directiveEffort}` : "";
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 ${displayModel(provider, model)} (directive${effortNote}) /v1/messages`);
    }
    const upstreamResponse = await forwardToProvider(req, targetUrl, apiKey, forwardBody, openAIFormat || useResponsesAPI, provider, providerType);
    trackProviderRequest(provider);
    if (sessionId)
      recordSessionProviderRequest(sessionId, provider);
    let result;
    if (useResponsesAPI) {
      if (!requestStream) {
        result = await collectStreamToAnthropicJson(await createResponsesToAnthropicResponse(upstreamResponse, originalModel), originalModel);
      } else {
        result = await createResponsesToAnthropicResponse(upstreamResponse, originalModel);
      }
    } else if (openAIFormat) {
      result = await createOpenAIToAnthropicResponse(upstreamResponse, originalModel, sessionId, provider);
    } else {
      result = createStreamingResponse(upstreamResponse, undefined, originalModel, model);
    }
    return wrapWithCapture(result, sessionId, provider, model);
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(`[proxy #${reqId}]${sessionTag} Route directive ${displayModel(provider, model)} failed: ${message}, ` + `falling back to passthrough`);
    return await handlePassthrough(req, reqId, bodyText, sessionTag);
  }
}
function resolveDirectiveEffort(provider, model) {
  if (provider !== "deepseek")
    return;
  if (model === "deepseek-v4-pro")
    return "max";
  return;
}
// src/proxy/handlers/other.ts
init_session();
async function handleOtherRequest(req, sessionId) {
  const reqId = nextRequestId();
  try {
    const { apiKey, baseUrl, authMode } = getPassthroughAuth();
    const isOAuth = authMode === "oauth";
    const url = new URL(req.url);
    const sessionInfo = parseSessionFromPath(url.pathname);
    const canonicalPath = sessionInfo ? sessionInfo.strippedPath : url.pathname;
    const targetUrl = `${baseUrl}${canonicalPath}${url.search}`;
    const isQuiet = !isDebug && QUIET_PATHS.includes(canonicalPath);
    if (!isQuiet) {
      const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : "";
      console.error(`[proxy #${reqId}]${sessionTag} \u2192 Anthropic (passthrough${isOAuth ? "/oauth" : ""}) ${canonicalPath}`);
    }
    const upstreamResponse = await forwardToUpstream(req, targetUrl, apiKey, undefined, isOAuth);
    if (canonicalPath === "/api/oauth/usage" && upstreamResponse.ok) {
      cacheUsageResponse(upstreamResponse.clone()).catch((e) => console.warn(`[proxy #${reqId}] usage cache failed:`, e instanceof Error ? e.message : e));
    }
    return createStreamingResponse(upstreamResponse);
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(`[proxy #${reqId}] Error: ${message}`);
    return new Response(JSON.stringify({ error: { type: "proxy_error", message } }), { status: 502, headers: { "content-type": "application/json" } });
  }
}
// src/proxy/handlers/models.ts
var import_models_registry4 = __toESM(require_models_registry(), 1);
async function handleModelsRequest(req, sessionId) {
  const config = loadConfig();
  const now = Math.floor(Date.now() / 1000);
  const reg = import_models_registry4.default;
  const aliasWinners = new Map;
  for (const [modelId, targets] of Object.entries(reg.crossProviderAliases ?? {})) {
    for (const target of targets) {
      if (isProviderConfigured(config, target.provider)) {
        aliasWinners.set(modelId, target.provider);
        break;
      }
    }
  }
  const seen = new Set;
  const models = [];
  for (const p of reg.providers) {
    if (!isProviderConfigured(config, p.name))
      continue;
    if (p.name === "ollama")
      continue;
    for (const m of p.models) {
      if (seen.has(m.id))
        continue;
      const winner = aliasWinners.get(m.id);
      if (winner && winner !== p.name)
        continue;
      seen.add(m.id);
      models.push({
        type: "model",
        id: m.id,
        display_name: m.label ?? m.id,
        created_at: now
      });
    }
  }
  if (models.length === 0) {
    return handleOtherRequest(req, sessionId);
  }
  return new Response(JSON.stringify({
    data: models,
    has_more: false,
    first_id: models[0]?.id,
    last_id: models[models.length - 1]?.id
  }), { status: 200, headers: { "content-type": "application/json" } });
}

// src/proxy/handlers/index.ts
function buildBodyTooLargeResponse(limit, actual) {
  const message = actual !== undefined ? `Request body exceeds proxy.maxBodyBytes (${actual} > ${limit})` : `Request body exceeds proxy.maxBodyBytes (${limit})`;
  return new Response(JSON.stringify({
    type: "error",
    error: { type: "request_too_large", message }
  }), {
    status: 413,
    headers: { "content-type": "application/json" }
  });
}
async function readBodyWithLimit(req) {
  const cfg = loadConfig();
  const limit = cfg.proxy?.maxBodyBytes ?? 4 * 1024 * 1024;
  if (limit > 0) {
    const cl = req.headers.get("content-length");
    if (cl) {
      const declared = Number.parseInt(cl, 10);
      if (Number.isFinite(declared) && declared > limit) {
        return {
          ok: false,
          response: buildBodyTooLargeResponse(limit, declared)
        };
      }
    }
  }
  const bodyText = await req.text();
  if (limit > 0) {
    const byteLen = Buffer.byteLength(bodyText, "utf8");
    if (byteLen > limit) {
      return {
        ok: false,
        response: buildBodyTooLargeResponse(limit, byteLen)
      };
    }
  }
  return { ok: true, bodyText };
}
async function handleMessages(req, sessionId) {
  const reqId = nextRequestId();
  const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : "";
  const bodyOutcome = await readBodyWithLimit(req);
  if (!bodyOutcome.ok) {
    console.error(`[proxy #${reqId}]${sessionTag} Request body rejected (413)`);
    return bodyOutcome.response;
  }
  const bodyText = bodyOutcome.bodyText;
  try {
    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {}
    if (parsedBody) {
      const directive = extractRouteDirective(parsedBody);
      if (directive) {
        if (directive.provider) {
          return await handleDirectiveRoute(req, reqId, bodyText, parsedBody, directive.provider, directive.model, sessionTag, sessionId);
        }
        const config = loadConfig();
        const resolved = resolveModelRoute(directive.model, (p) => isProviderConfigured(config, p));
        if (resolved) {
          console.error(`[proxy #${reqId}]${sessionTag} Model-only directive: ${directive.model} \u2192 ${resolved.provider}/${resolved.effectiveModel}`);
          return await handleDirectiveRoute(req, reqId, bodyText, parsedBody, resolved.provider, resolved.effectiveModel, sessionTag, sessionId);
        }
        console.error(`[proxy #${reqId}]${sessionTag} Model-only directive: ${directive.model} \u2014 no configured provider, falling through`);
      }
    }
    if (parsedBody) {
      const requestModel = parsedBody.model;
      const config = loadConfig();
      const provider = resolveModelToProvider(requestModel, (p) => isProviderConfigured(config, p));
      if (provider) {
        const model = requestModel || providerModelSets.get(provider)?.values().next().value || "unknown";
        console.error(`[proxy #${reqId}]${sessionTag} Auto-routing: ${requestModel} \u2192 ${displayModel(provider, model)}`);
        return await handleDirectiveRoute(req, reqId, bodyText, parsedBody, provider, model, sessionTag, sessionId);
      }
    }
    let state;
    if (sessionId) {
      state = readSessionState(sessionId);
      if (!state.switched) {
        const globalState = readSwitchState();
        if (globalState.switched) {
          state = globalState;
        }
      }
      if (state.switched && !hasSession(sessionId)) {
        writeSessionState(sessionId, state);
      }
    } else {
      state = readSwitchState();
    }
    if (!state.switched) {
      if (sessionId)
        recordSessionProviderRequest(sessionId, "anthropic");
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
    }
    if (!state.provider || !state.model) {
      console.error(`[proxy #${reqId}]${sessionTag} Invalid switch state (missing provider/model), reverting`);
      if (sessionId) {
        resetSessionState(sessionId);
      } else {
        resetSwitchState();
      }
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
    }
    return await handleSwitched(req, reqId, bodyText, state.provider, state.model, sessionId, sessionTag);
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(`[proxy #${reqId}]${sessionTag} Error: ${message}`);
    const cfg = loadConfig();
    if (cfg.proxy?.failClosed !== false) {
      return new Response(JSON.stringify({
        type: "error",
        error: { type: "proxy_error", message }
      }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }
    try {
      console.error(`[proxy #${reqId}]${sessionTag} Falling back to passthrough (proxy.failClosed=false)`);
      return await handlePassthrough(req, reqId, bodyText, sessionTag);
    } catch (fallbackError) {
      const fbMsg = toErrorMessage(fallbackError);
      return new Response(JSON.stringify({
        error: { type: "proxy_error", message: fbMsg }
      }), {
        status: 502,
        headers: { "content-type": "application/json" }
      });
    }
  }
}

// src/proxy/control/health.ts
init_session();
async function handleHealth(corsHeaders) {
  const stats = getProxyStats();
  return jsonResponse({
    status: "ok",
    uptime: stats.uptime,
    uptimeHuman: formatUptime(stats.uptime),
    requestCount: stats.requestCount,
    activeSessions: getActiveSessionCount()
  }, 200, corsHeaders);
}
async function handleStatus(sessionId, corsHeaders) {
  let state;
  if (sessionId) {
    state = readSessionState(sessionId);
  } else {
    const { getDefaultSwitchState: getDefaultSwitchState2 } = await Promise.resolve().then(() => (init_session(), exports_session));
    const defaultState = getDefaultSwitchState2();
    state = defaultState ?? readSwitchState();
  }
  return jsonResponse({ ...state, sessionId: sessionId ?? null }, 200, corsHeaders);
}
function handleSessions(corsHeaders) {
  const activeSessions = getActiveSessions();
  return jsonResponse({ sessions: activeSessions, count: activeSessions.length }, 200, corsHeaders);
}
function handleUsage(corsHeaders) {
  const providerCounts = getProviderRequestCounts();
  return jsonResponse({ providers: providerCounts }, 200, corsHeaders);
}

// src/proxy/control/switch.ts
init_session();
var shutdownProxy = null;
function registerShutdown(fn) {
  shutdownProxy = fn;
}
async function handleSwitch(req, sessionId, sessionTag, corsHeaders) {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405, corsHeaders);
  }
  const body = await req.json();
  if (!body.provider || !body.model) {
    return jsonResponse({ error: "provider and model are required" }, 400, corsHeaders);
  }
  const config = loadConfig();
  const providerConfig = config.providers[body.provider];
  if (!providerConfig) {
    return jsonResponse({
      error: `Unknown provider: "${body.provider}"`,
      available: Object.keys(config.providers)
    }, 400, corsHeaders);
  }
  if (providerConfig.type === "claude-subscription") {
    return jsonResponse({
      error: `Cannot switch to "${body.provider}" \u2014 it uses Claude subscription.`
    }, 400, corsHeaders);
  }
  const providerConfigured = isProviderConfigured(config, body.provider);
  const state = {
    switched: true,
    provider: body.provider,
    model: body.model,
    switchedAt: Date.now()
  };
  if (sessionId) {
    writeSessionState(sessionId, state);
  } else {
    writeSwitchState(state);
  }
  const warning = !providerConfigured ? `Warning: ${body.provider} API key not set. Requests will fallback to native Claude.` : undefined;
  const displayModel2 = body.model.startsWith(`${body.provider}/`) ? body.model : `${body.provider}/${body.model}`;
  console.error(`[control]${sessionTag} Switched to ${displayModel2}` + (warning ? ` [${warning}]` : ""));
  return jsonResponse({ ...state, sessionId: sessionId ?? null, ...warning && { warning } }, 200, corsHeaders);
}
async function handleRevert(req, sessionId, sessionTag, corsHeaders) {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405, corsHeaders);
  }
  if (sessionId) {
    resetSessionState(sessionId);
  } else {
    resetSwitchState();
  }
  console.error(`[control]${sessionTag} Reverted to passthrough`);
  return jsonResponse({
    switched: false,
    sessionId: sessionId ?? null,
    message: "Reverted to passthrough"
  }, 200, corsHeaders);
}
async function handleStop(req, corsHeaders) {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405, corsHeaders);
  }
  console.error("[control] Stopping proxy server...");
  const response = jsonResponse({ message: "Proxy server stopping" }, 200, corsHeaders);
  setTimeout(() => {
    if (shutdownProxy) {
      shutdownProxy();
    } else {
      console.error("[control] Warning: No shutdown handler registered");
      process.exit(0);
    }
  }, 100);
  return response;
}

// src/proxy/control/providers.ts
var NON_LLM_PATTERNS = [
  /^bge-/i,
  /^nomic-embed/i,
  /^mxbai-embed/i,
  /^snowflake-arctic-embed/i,
  /^all-minilm/i,
  /^paraphrase-/i,
  /^minicpm-v/i,
  /^llava/i,
  /^bakllava/i,
  /^moondream/i,
  /^granite3-guardian/i,
  /-ocr[:/]|^.*-ocr$/i,
  /-embedding[:/]|^.*-embedding$/i
];
async function handleProviders(corsHeaders) {
  const provConfig = loadConfig();
  const registry = await Promise.resolve().then(() => __toESM(require_models_registry(), 1));
  const available = [];
  for (const p of registry.providers) {
    const pName = p.name;
    const pc = provConfig.providers[pName];
    if (!pc || pc.type === "claude-subscription")
      continue;
    if (!isProviderConfigured(provConfig, pName))
      continue;
    let models = (p.models ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      ...m.note ? { note: m.note } : {},
      ...m.realId ? { realId: m.realId } : {}
    }));
    if (pName === "ollama" && models.length === 0) {
      try {
        const ollamaHost = (process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || "http://localhost:11434").replace(/\/v1\/?$/, "");
        const resp = await fetch(`${ollamaHost}/api/tags`, {
          signal: AbortSignal.timeout(3000)
        });
        if (resp.ok) {
          const data = await resp.json();
          models = (data.models ?? []).filter((m) => !NON_LLM_PATTERNS.some((pat) => pat.test(m.name))).map((m) => ({ id: m.name, label: m.name }));
        }
      } catch {}
    }
    available.push({
      name: pName,
      label: p.label ?? pName,
      models
    });
  }
  return jsonResponse({ providers: available }, 200, corsHeaders);
}
async function handleModels(url, corsHeaders) {
  const modelsProvider = url.searchParams.get("provider");
  if (!modelsProvider) {
    return jsonResponse({ error: "provider query param is required" }, 400, corsHeaders);
  }
  if (modelsProvider === "ollama") {
    let isLLMModel = function(name) {
      return !NON_LLM_PATTERNS.some((p) => p.test(name));
    };
    try {
      const ollamaHost = (process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || "http://localhost:11434").replace(/\/v1\/?$/, "");
      const resp = await fetch(`${ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const allModels = data.models ?? [];
        const models = allModels.filter((m) => isLLMModel(m.name)).map((m) => ({
          id: m.name,
          label: m.name,
          size: m.size
        }));
        return jsonResponse({
          provider: "ollama",
          models,
          filtered: allModels.length - models.length
        }, 200, corsHeaders);
      }
      return jsonResponse({
        error: "Ollama API not reachable",
        hint: "Is Ollama running? Try: ollama serve"
      }, 502, corsHeaders);
    } catch {
      return jsonResponse({
        error: "Ollama API not reachable",
        hint: "Is Ollama running? Try: ollama serve"
      }, 502, corsHeaders);
    }
  }
  const modelsRegistryData = await Promise.resolve().then(() => __toESM(require_models_registry(), 1));
  const providerEntry = modelsRegistryData.providers.find((p) => p.name === modelsProvider);
  if (providerEntry) {
    return jsonResponse({ provider: modelsProvider, models: providerEntry.models }, 200, corsHeaders);
  }
  return jsonResponse({ error: `Unknown provider: ${modelsProvider}` }, 404, corsHeaders);
}

// src/proxy/control/response.ts
init_cache();
async function handleResponse(url, corsHeaders) {
  const respSessionId = url.searchParams.get("session");
  if (!respSessionId) {
    return jsonResponse({ error: "session query parameter is required" }, 400, corsHeaders);
  }
  const minSeq = url.searchParams.has("seq") ? parseInt(url.searchParams.get("seq"), 10) : undefined;
  const shouldWait = url.searchParams.get("wait") === "true";
  const timeoutMs = Math.min(parseInt(url.searchParams.get("timeout") ?? "30000", 10) || 30000, 120000);
  if (shouldWait) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const resp2 = getLatestResponse(respSessionId, minSeq);
      if (resp2) {
        return jsonResponse({ found: true, response: resp2 }, 200, corsHeaders);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return jsonResponse({ found: false }, 200, corsHeaders);
  }
  const resp = getLatestResponse(respSessionId, minSeq);
  if (resp) {
    return jsonResponse({ found: true, response: resp }, 200, corsHeaders);
  }
  return jsonResponse({ found: false }, 200, corsHeaders);
}
async function handleStream(url, corsHeaders) {
  const streamSessionId = url.searchParams.get("session");
  if (!streamSessionId) {
    return jsonResponse({ error: "session query parameter is required" }, 400, corsHeaders);
  }
  const streamTimeoutMs = Math.min(parseInt(url.searchParams.get("timeout") ?? "120000", 10) || 120000, 300000);
  const { addCaptureListener: addCaptureListener2, removeCaptureListener: removeCaptureListener2 } = await Promise.resolve().then(() => (init_cache(), exports_cache));
  const encoder = new TextEncoder;
  let listenerRef = null;
  let timeoutId = null;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", session: streamSessionId })}

`));
      listenerRef = {
        onDelta: (text) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}

`));
          } catch {}
        },
        onComplete: (response) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", seq: response.seq, provider: response.provider, model: response.model, usage: response.usage })}

`));
          } catch {}
        }
      };
      addCaptureListener2(streamSessionId, listenerRef);
      timeoutId = setTimeout(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "timeout" })}

`));
          controller.close();
        } catch {}
      }, streamTimeoutMs);
    },
    cancel() {
      if (listenerRef) {
        removeCaptureListener2(streamSessionId, listenerRef);
        listenerRef = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...corsHeaders
    }
  });
}

// src/shared/providers/base-client.ts
class OpenAICompatibleClient {
  name;
  baseUrl;
  apiKey;
  defaultModel;
  timeout;
  tokenResolver;
  constructor(name, options) {
    this.name = name;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.timeout = options.timeout ?? 120000;
    this.tokenResolver = options.tokenResolver;
  }
  isConfigured() {
    if (this.tokenResolver)
      return true;
    return !!this.apiKey && this.apiKey.length > 0;
  }
  async createChatCompletion(request) {
    const apiKey = this.tokenResolver ? await this.tokenResolver() : this.apiKey;
    if (!apiKey) {
      throw new Error(`${this.name} API key not configured`);
    }
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: false
    };
    if (request.thinking) {
      body.thinking = request.thinking;
    }
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.name} API error (${response.status}): ${errorText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${this.name} API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

// src/shared/providers/anthropic-client.ts
class AnthropicCompatibleClient {
  name;
  baseUrl;
  apiKey;
  defaultModel;
  timeout;
  constructor(name, options) {
    this.name = name;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.timeout = options.timeout ?? 120000;
  }
  isConfigured() {
    return !!this.apiKey && this.apiKey.length > 0;
  }
  convertMessages(messages) {
    let system;
    const anthropicMessages = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        system = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
    return { system, messages: anthropicMessages };
  }
  convertResponse(response) {
    const text = response.content.filter((block) => block.type === "text" && block.text).map((block) => block.text).join("");
    const thinking = response.content.filter((block) => block.type === "thinking" && block.thinking).map((block) => block.thinking).join("");
    return {
      id: response.id,
      object: "chat.completion",
      created: Date.now(),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text || thinking
          },
          finish_reason: response.stop_reason ?? "stop"
        }
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      },
      thinking: thinking || undefined
    };
  }
  async createChatCompletion(request) {
    if (!this.isConfigured()) {
      throw new Error(`${this.name} API key not configured`);
    }
    const url = `${this.baseUrl}/v1/messages`;
    const { system, messages } = this.convertMessages(request.messages);
    const body = {
      model: request.model || this.defaultModel || "claude-3-sonnet-20240229",
      messages,
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature,
      stream: false
    };
    if (system) {
      body.system = system;
    }
    if (request.thinking?.enabled) {
      body.thinking = {
        type: "enabled",
        ...request.thinking.budget_tokens !== undefined ? { budget_tokens: request.thinking.budget_tokens } : {}
      };
    }
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.name} API error (${response.status}): ${errorText}`);
      }
      const data = await response.json();
      return this.convertResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${this.name} API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

// src/shared/providers/openai-native.ts
init_token_manager();
init_store();
var CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
var API_BASE_URL = "https://api.openai.com/v1";
function createOpenAIClient() {
  if (hasCredential("openai")) {
    return new OpenAICompatibleClient("openai", {
      baseUrl: CODEX_BASE_URL,
      apiKey: "",
      tokenResolver: () => getAccessToken("openai")
    });
  }
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  return new OpenAICompatibleClient("openai", {
    baseUrl: API_BASE_URL,
    apiKey
  });
}

// src/shared/auth/index.ts
init_store();
init_token_manager();
init_types3();

// src/shared/providers/router.ts
import { statSync as statSync2 } from "fs";
var clientCache = new Map;
var watchedMtimes = new Map;
function getWatchedConfigPaths() {
  return [...getConfigPaths(), getAuthStorePath()];
}
function maybeInvalidateClientCacheByMtime() {
  const paths = getWatchedConfigPaths();
  let anyChanged = false;
  for (const p of paths) {
    let current = 0;
    try {
      const st = statSync2(p, { throwIfNoEntry: false });
      if (st)
        current = st.mtimeMs;
    } catch {}
    const hadPrev = watchedMtimes.has(p);
    const prev = watchedMtimes.get(p) ?? 0;
    watchedMtimes.set(p, current);
    if (hadPrev && current !== prev) {
      anyChanged = true;
    }
  }
  if (anyChanged) {
    clientCache.clear();
  }
}
function getProviderClient(providerName, config) {
  maybeInvalidateClientCacheByMtime();
  const cached = clientCache.get(providerName);
  if (cached) {
    return cached;
  }
  const details = getProviderDetails(config, providerName);
  if (!details) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  let client;
  switch (details.type) {
    case "claude-subscription":
      throw new Error(`Provider "${providerName}" uses Claude subscription and cannot be used with MCP background tasks`);
    case "openai-oauth":
      client = createOpenAIClient();
      break;
    case "anthropic-compatible": {
      const apiKey = details.apiKeyEnv ? process.env[details.apiKeyEnv] ?? "" : "";
      client = new AnthropicCompatibleClient(providerName, {
        baseUrl: details.baseUrl ?? "",
        apiKey: apiKey || (providerName === "ollama" ? "ollama" : "")
      });
      break;
    }
    case "openai-compatible":
    default: {
      const apiKey = details.apiKeyEnv ? process.env[details.apiKeyEnv] ?? "" : "";
      client = new OpenAICompatibleClient(providerName, {
        baseUrl: details.baseUrl ?? "",
        apiKey: apiKey || (providerName === "ollama" ? "ollama" : "")
      });
      break;
    }
  }
  clientCache.set(providerName, client);
  return client;
}
async function routeByModel(providerName, modelName, messages, options) {
  const config = loadConfig();
  const providerDetails = getProviderDetails(config, providerName);
  if (!providerDetails) {
    throw new Error(`Unknown provider: "${providerName}"`);
  }
  if (providerDetails.type === "claude-subscription") {
    throw new Error(`Provider "${providerName}" uses Claude subscription. Use Claude Code's Task tool instead.`);
  }
  if (!isProviderConfigured(config, providerName)) {
    const envVar = providerDetails.apiKeyEnv ?? `${providerName.toUpperCase()}_API_KEY`;
    throw new Error(`Provider "${providerName}" is not configured. Set ${envVar} environment variable.`);
  }
  const client = getProviderClient(providerName, config);
  const request = {
    model: modelName,
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens
  };
  return client.createChatCompletion(request);
}
// src/proxy/control/internal.ts
var runtimeMemoryModel = {
  provider: null,
  model: null
};
async function handleMemoryConfig(req, corsHeaders) {
  if (req.method === "GET") {
    return handleMemoryConfigGet(corsHeaders);
  }
  if (req.method === "POST") {
    return handleMemoryConfigPost(req, corsHeaders);
  }
  return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
}
function handleMemoryConfigGet(corsHeaders) {
  const config = loadConfig();
  const memCfg = config.memory;
  const resolved = resolveMemoryProvider();
  if (runtimeMemoryModel.provider) {
    return jsonResponse({
      provider: runtimeMemoryModel.provider,
      model: runtimeMemoryModel.model,
      source: "runtime",
      resolvedProvider: resolved.provider,
      resolvedModel: resolved.model
    }, 200, corsHeaders);
  }
  if (memCfg?.aiProvider) {
    return jsonResponse({
      provider: memCfg.aiProvider,
      model: memCfg.aiModel ?? null,
      source: "config",
      resolvedProvider: resolved.provider,
      resolvedModel: resolved.model
    }, 200, corsHeaders);
  }
  return jsonResponse({
    provider: null,
    model: null,
    source: "auto",
    resolvedProvider: resolved.provider,
    resolvedModel: resolved.model
  }, 200, corsHeaders);
}
async function handleMemoryConfigPost(req, corsHeaders) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const provider = typeof body.provider === "string" ? body.provider : null;
  const model = typeof body.model === "string" ? body.model : null;
  runtimeMemoryModel = { provider, model };
  const source = provider ? "runtime" : "auto";
  const resolved = resolveMemoryProvider();
  console.log(`[control] Memory model ${provider ? `set to ${provider}/${model}` : "reset to auto"} (resolved: ${resolved.provider}/${resolved.model})`);
  return jsonResponse({
    provider,
    model,
    source,
    resolvedProvider: resolved.provider,
    resolvedModel: resolved.model,
    message: provider ? `Memory model set to ${provider}/${model}` : "Memory model reset to auto"
  }, 200, corsHeaders);
}
function resolveMemoryProvider(requestProvider, requestModel) {
  if (requestProvider && requestModel) {
    return { provider: requestProvider, model: requestModel };
  }
  if (runtimeMemoryModel.provider && runtimeMemoryModel.model) {
    return {
      provider: runtimeMemoryModel.provider,
      model: runtimeMemoryModel.model
    };
  }
  const config = loadConfig();
  const memCfg = config.memory;
  if (memCfg?.aiProvider && memCfg?.aiModel) {
    if (isProviderConfigured(config, memCfg.aiProvider)) {
      return { provider: memCfg.aiProvider, model: memCfg.aiModel };
    }
  }
  const priority = memCfg?.aiProviderPriority ?? [
    "minimax-cn",
    "minimax",
    "zhipu",
    "deepseek"
  ];
  const defaultModels = {
    zhipu: "glm-5.1",
    minimax: "MiniMax-M2.7",
    "minimax-cn": "MiniMax-M2.7",
    deepseek: "deepseek-v4-pro",
    kimi: "kimi-for-coding",
    aliyun: "qwen3.6-plus"
  };
  for (const p of priority) {
    if (isProviderConfigured(config, p)) {
      const details = getProviderDetails(config, p);
      if (details && details.type !== "claude-subscription") {
        return { provider: p, model: defaultModels[p] ?? p };
      }
    }
  }
  return { provider: "anthropic", model: "claude-sonnet-4-20250514" };
}
async function handleInternalComplete(req, corsHeaders) {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }
  const messages = body.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "messages array is required and must not be empty" }, 400, corsHeaders);
  }
  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;
  const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : 4096;
  const requestProvider = typeof body.provider === "string" ? body.provider : undefined;
  const requestModel = typeof body.model === "string" ? body.model : undefined;
  const resolved = resolveMemoryProvider(requestProvider, requestModel);
  if (resolved.provider === "anthropic") {
    return handleAnthropicPassthrough(messages, resolved.model, temperature, maxTokens, corsHeaders);
  }
  try {
    const response = await routeByModel(resolved.provider, resolved.model, messages.map((m) => ({
      role: m.role,
      content: m.content
    })), { temperature, maxTokens });
    const content = response.choices[0]?.message?.content ?? "";
    return jsonResponse({
      content,
      thinking: response.thinking,
      model: resolved.model,
      provider: resolved.provider,
      usage: response.usage
    }, 200, corsHeaders);
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(`[internal/complete] Provider ${resolved.provider} failed: ${message}`);
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? "";
    if (anthropicKey) {
      try {
        return await handleAnthropicPassthrough(messages, "claude-sonnet-4-20250514", temperature, maxTokens, corsHeaders);
      } catch {}
    }
    return jsonResponse({
      error: `AI failed: ${message}`,
      provider: resolved.provider
    }, 502, corsHeaders);
  }
}
async function handleAnthropicPassthrough(messages, model, temperature, maxTokens, corsHeaders) {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? "";
  if (!apiKey) {
    return jsonResponse({
      error: "No Anthropic API key found (ANTHROPIC_API_KEY or CLAUDE_API_KEY)"
    }, 500, corsHeaders);
  }
  const anthropicBody = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content
    })),
    ...temperature !== undefined ? { temperature } : {}
  };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(anthropicBody),
    signal: AbortSignal.timeout(120000)
  });
  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown error");
    throw new Error(`Anthropic API error ${resp.status}: ${errorText}`);
  }
  const result = await resp.json();
  const content = result.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "";
  return jsonResponse({
    content,
    model: result.model,
    provider: "anthropic",
    usage: result.usage
  }, 200, corsHeaders);
}

// src/proxy/control/registry.ts
import { readFileSync as readFileSync6, writeFileSync as writeFileSync4, existsSync as existsSync6, renameSync as renameSync2 } from "fs";
import { join as join5 } from "path";
import { homedir as homedir5 } from "os";
function getRegistryPath() {
  return join5(homedir5(), ".claude", "oh-my-claude", "models-registry.json");
}
function readRegistry() {
  const registryPath = getRegistryPath();
  if (!existsSync6(registryPath)) {
    throw new Error(`Registry not found at ${registryPath}`);
  }
  return JSON.parse(readFileSync6(registryPath, "utf-8"));
}
function writeRegistry(registry) {
  const registryPath = getRegistryPath();
  const tmpPath = registryPath + ".tmp";
  writeFileSync4(tmpPath, JSON.stringify(registry, null, "\t") + `
`, "utf-8");
  renameSync2(tmpPath, registryPath);
}
function parseRegistryPath(path) {
  const match = path.match(/^\/api\/registry\/providers\/([^/]+)\/models(?:\/(.+))?$/);
  if (match) {
    return {
      providerName: decodeURIComponent(match[1]),
      modelId: match[2] ? decodeURIComponent(match[2]) : undefined
    };
  }
  return {};
}
async function handleRegistryRequest(req, path, corsHeaders) {
  try {
    if (path === "/api/registry" && req.method === "GET") {
      const registry2 = readRegistry();
      return jsonResponse(registry2, 200, corsHeaders);
    }
    const { providerName, modelId } = parseRegistryPath(path);
    if (!providerName) {
      return jsonResponse({ error: "Invalid registry path" }, 400, corsHeaders);
    }
    const registry = readRegistry();
    const provider = registry.providers.find((p) => p.name === providerName);
    if (!provider) {
      return jsonResponse({ error: `Provider "${providerName}" not found` }, 404, corsHeaders);
    }
    switch (req.method) {
      case "GET": {
        return jsonResponse({ provider: providerName, models: provider.models }, 200, corsHeaders);
      }
      case "POST": {
        const body = await req.json();
        if (!body.id || !body.label) {
          return jsonResponse({ error: "Model id and label are required" }, 400, corsHeaders);
        }
        if (provider.models.some((m) => m.id === body.id)) {
          return jsonResponse({ error: `Model "${body.id}" already exists in ${providerName}` }, 409, corsHeaders);
        }
        const newModel = { id: body.id, label: body.label };
        if (body.note)
          newModel.note = body.note;
        if (body.realId)
          newModel.realId = body.realId;
        provider.models.push(newModel);
        writeRegistry(registry);
        return jsonResponse({ ok: true, model: newModel }, 201, corsHeaders);
      }
      case "PUT": {
        const body = await req.json();
        if (!Array.isArray(body.models)) {
          return jsonResponse({ error: "models array is required" }, 400, corsHeaders);
        }
        for (const m of body.models) {
          if (!m.id || !m.label) {
            return jsonResponse({ error: `Each model needs id and label (got: ${JSON.stringify(m)})` }, 400, corsHeaders);
          }
        }
        provider.models = body.models;
        writeRegistry(registry);
        return jsonResponse({ ok: true }, 200, corsHeaders);
      }
      case "DELETE": {
        if (!modelId) {
          return jsonResponse({ error: "Model ID required for DELETE" }, 400, corsHeaders);
        }
        const idx = provider.models.findIndex((m) => m.id === modelId);
        if (idx === -1) {
          return jsonResponse({ error: `Model "${modelId}" not found in ${providerName}` }, 404, corsHeaders);
        }
        provider.models.splice(idx, 1);
        writeRegistry(registry);
        return jsonResponse({ ok: true }, 200, corsHeaders);
      }
      default:
        return jsonResponse({ error: `Method ${req.method} not allowed` }, 405, corsHeaders);
    }
  } catch (error) {
    const message = toErrorMessage(error);
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
}
// src/proxy/control/config.ts
async function handleConfigRequest(_req, path, corsHeaders) {
  try {
    const config = loadConfig();
    if (path === "/api/config/providers") {
      const registry = await Promise.resolve().then(() => __toESM(require_models_registry(), 1));
      const providers = Object.entries(config.providers).map(([name, pc]) => {
        const regProvider = registry.providers.find((p) => p.name === name);
        let envVar;
        const type = pc.type;
        if (type === "openai-compatible" || type === "anthropic-compatible") {
          const envPatterns = {
            deepseek: "DEEPSEEK_API_KEY",
            zhipu: "ZHIPU_API_KEY",
            zai: "ZAI_API_KEY",
            minimax: "MINIMAX_API_KEY",
            "minimax-cn": "MINIMAX_CN_API_KEY",
            kimi: "KIMI_API_KEY",
            aliyun: "ALIYUN_API_KEY",
            openrouter: "OPENROUTER_API_KEY",
            ollama: "OLLAMA_HOST"
          };
          envVar = envPatterns[name];
        }
        return {
          name,
          label: regProvider?.label ?? name,
          type: pc.type,
          baseUrl: pc.base_url,
          envVar,
          isConfigured: isProviderConfigured(config, name),
          modelCount: regProvider?.models?.length ?? 0
        };
      });
      return jsonResponse({ providers }, 200, corsHeaders);
    }
    if (path === "/api/config") {
      const sanitized = {
        providers: Object.fromEntries(Object.entries(config.providers).map(([name, pc]) => [
          name,
          {
            type: pc.type,
            baseUrl: pc.base_url,
            isConfigured: isProviderConfigured(config, name)
          }
        ])),
        agents: config.agents,
        categories: config.categories
      };
      return jsonResponse(sanitized, 200, corsHeaders);
    }
    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  } catch (error) {
    const message = toErrorMessage(error);
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
}

// src/proxy/state/instance-registry.ts
import {
  readFileSync as readFileSync7,
  writeFileSync as writeFileSync5,
  existsSync as existsSync7,
  mkdirSync as mkdirSync5,
  openSync as openSync2,
  closeSync as closeSync2,
  unlinkSync as unlinkSync2
} from "fs";
import { join as join6 } from "path";
import { homedir as homedir6 } from "os";
var REGISTRY_DIR = join6(homedir6(), ".claude", "oh-my-claude");
var REGISTRY_FILE = join6(REGISTRY_DIR, "proxy-instances.json");
var LOCK_FILE = join6(REGISTRY_DIR, "proxy-instances.lock");
var STALE_TTL_MS = 5 * 60 * 1000;
var LOCK_RETRIES = 10;
var LOCK_BASE_BACKOFF_MS = 20;
var LOCK_STALE_MS = 5000;
function sleepBlockingMs2(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}
function acquireRegistryLock() {
  for (let i = 0;i < LOCK_RETRIES; i++) {
    try {
      if (!existsSync7(REGISTRY_DIR)) {
        mkdirSync5(REGISTRY_DIR, { recursive: true });
      }
      return openSync2(LOCK_FILE, "wx");
    } catch (err) {
      const code = err?.code;
      if (code !== "EEXIST") {
        return null;
      }
      try {
        const stat = __require("fs").statSync(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          try {
            unlinkSync2(LOCK_FILE);
          } catch {}
          continue;
        }
      } catch {}
      sleepBlockingMs2(LOCK_BASE_BACKOFF_MS + Math.random() * LOCK_BASE_BACKOFF_MS);
    }
  }
  return null;
}
function releaseRegistryLock(fd) {
  if (fd === null)
    return;
  try {
    closeSync2(fd);
  } catch {}
  try {
    unlinkSync2(LOCK_FILE);
  } catch {}
}
function withRegistryLock(fn) {
  const fd = acquireRegistryLock();
  try {
    return fn();
  } finally {
    releaseRegistryLock(fd);
  }
}
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readInstances() {
  return readInstancesLockFree();
}
function readInstancesLockFree() {
  if (!existsSync7(REGISTRY_FILE))
    return [];
  try {
    const data = JSON.parse(readFileSync7(REGISTRY_FILE, "utf-8"));
    const instances = Array.isArray(data) ? data : [];
    const now = Date.now();
    return instances.filter((i) => {
      const heartbeat = new Date(i.lastHeartbeat).getTime();
      if (now - heartbeat >= STALE_TTL_MS)
        return false;
      if (!isPidAlive(i.pid))
        return false;
      return true;
    });
  } catch {
    return [];
  }
}
function pruneInstances() {
  const raw = existsSync7(REGISTRY_FILE) ? (() => {
    try {
      return JSON.parse(readFileSync7(REGISTRY_FILE, "utf-8"));
    } catch {
      return [];
    }
  })() : [];
  const instances = Array.isArray(raw) ? raw : [];
  const now = Date.now();
  const alive = instances.filter((i) => {
    const heartbeat = new Date(i.lastHeartbeat).getTime();
    if (now - heartbeat >= STALE_TTL_MS)
      return false;
    if (!isPidAlive(i.pid))
      return false;
    return true;
  });
  if (alive.length < instances.length) {
    writeInstances(alive);
  }
  return alive;
}
function writeInstances(instances) {
  mkdirSync5(REGISTRY_DIR, { recursive: true });
  const tmpPath = REGISTRY_FILE + ".tmp";
  writeFileSync5(tmpPath, JSON.stringify(instances, null, "\t") + `
`, "utf-8");
  const { renameSync: renameSync3 } = __require("fs");
  renameSync3(tmpPath, REGISTRY_FILE);
}
function registerInstance(instance) {
  withRegistryLock(() => {
    const instances = pruneInstances();
    const filtered = instances.filter((i) => i.sessionId !== instance.sessionId && i.port !== instance.port);
    filtered.push({
      ...instance,
      lastHeartbeat: new Date().toISOString()
    });
    writeInstances(filtered);
  });
}
function deregisterInstance(sessionId) {
  withRegistryLock(() => {
    const instances = pruneInstances();
    writeInstances(instances.filter((i) => i.sessionId !== sessionId));
  });
}
function heartbeatInstance(sessionId) {
  withRegistryLock(() => {
    const instances = pruneInstances();
    const instance = instances.find((i) => i.sessionId === sessionId);
    if (instance) {
      instance.lastHeartbeat = new Date().toISOString();
      writeInstances(instances);
    }
  });
}
function startHeartbeat(sessionId, intervalMs = 60000) {
  const timer = setInterval(() => heartbeatInstance(sessionId), intervalMs);
  return () => clearInterval(timer);
}

// src/proxy/control/instances.ts
async function probeInstance(instance) {
  const base = `http://localhost:${instance.controlPort}`;
  const timeout = 2000;
  try {
    const [healthRes, sessionsRes] = await Promise.all([
      fetch(`${base}/health`, { signal: AbortSignal.timeout(timeout) }),
      fetch(`${base}/sessions`, { signal: AbortSignal.timeout(timeout) })
    ]);
    const health = healthRes.ok ? await healthRes.json() : undefined;
    const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
    return {
      ...instance,
      alive: true,
      health,
      sessions: sessionsData.sessions ?? []
    };
  } catch {
    return {
      ...instance,
      alive: false,
      sessions: []
    };
  }
}
async function handleInstancesRequest(_req, corsHeaders) {
  const registered = readInstances();
  const allInstances = await Promise.all(registered.map(probeInstance));
  const deadInstances = allInstances.filter((i) => !i.alive);
  for (const dead of deadInstances) {
    deregisterInstance(dead.sessionId);
  }
  const instances = allInstances.filter((i) => i.alive);
  const totalSessions = instances.reduce((sum, i) => sum + i.sessions.length, 0);
  const totalRequests = instances.reduce((sum, i) => sum + (i.health?.requestCount ?? 0), 0);
  const aliveCount = instances.length;
  return jsonResponse({
    instances,
    summary: {
      registered: registered.length,
      alive: aliveCount,
      totalSessions,
      totalRequests
    }
  }, 200, corsHeaders);
}

// src/proxy/control/sessions/handler.ts
import { readdir as readdir2, readFile as readFile3, writeFile as writeFile2, stat as stat3, unlink, rm } from "fs/promises";
import { join as join9 } from "path";
import { existsSync as existsSync9 } from "fs";

// src/proxy/control/sessions/path.ts
import { readdir, readFile, stat } from "fs/promises";
import { join as join7 } from "path";
import { homedir as homedir7 } from "os";
import { createReadStream } from "fs";
import { createInterface } from "readline";
var PROJECTS_DIR = join7(homedir7(), ".claude", "projects");
function looksLikeValidPath(p) {
  if (/^[A-Z]:\\/.test(p))
    return true;
  if (p.startsWith("/"))
    return true;
  return false;
}
async function resolveProjectPath(folder) {
  const dirPath = join7(PROJECTS_DIR, folder);
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        candidates.push(join7(dirPath, entry.name));
      }
    }
    if (candidates.length === 0) {
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === "memory")
          continue;
        const subagentsDir = join7(dirPath, entry.name, "subagents");
        try {
          const subFiles = await readdir(subagentsDir);
          for (const sf of subFiles) {
            if (sf.endsWith(".jsonl")) {
              candidates.push(join7(subagentsDir, sf));
              break;
            }
          }
        } catch {}
        if (candidates.length >= 3)
          break;
      }
    }
    for (const jsonlPath of candidates.slice(0, 5)) {
      const rl = createInterface({
        input: createReadStream(jsonlPath, { encoding: "utf-8" }),
        crlfDelay: Infinity
      });
      let linesRead = 0;
      for await (const line of rl) {
        if (!line.trim())
          continue;
        linesRead++;
        try {
          const entry = JSON.parse(line);
          if (entry.cwd) {
            rl.close();
            return entry.cwd;
          }
        } catch {}
        if (linesRead >= 10) {
          rl.close();
          break;
        }
      }
    }
  } catch {}
  return folder;
}
async function readSessionIndex(folder) {
  try {
    const indexPath = join7(PROJECTS_DIR, folder, "sessions-index.json");
    const raw = await readFile(indexPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function scanJsonlFiles(folder) {
  const dirPath = join7(PROJECTS_DIR, folder);
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results = [];
  const seenIds = new Set;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl"))
      continue;
    const sessionId = entry.name.replace(".jsonl", "");
    const filePath = join7(dirPath, entry.name);
    try {
      const st = await stat(filePath);
      results.push({ sessionId, filePath, mtime: st.mtime, isDirectory: false });
      seenIds.add(sessionId);
    } catch {}
  }
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    if (!UUID_RE.test(entry.name))
      continue;
    if (entry.name === "memory")
      continue;
    if (seenIds.has(entry.name))
      continue;
    const sessionDir = join7(dirPath, entry.name);
    try {
      const st = await stat(sessionDir);
      results.push({
        sessionId: entry.name,
        filePath: null,
        mtime: st.mtime,
        isDirectory: true
      });
    } catch {}
  }
  return results;
}

// src/proxy/control/sessions/parser.ts
import { createReadStream as createReadStream2 } from "fs";
import { createInterface as createInterface2 } from "readline";
async function extractQuickMeta(filePath, fileMtime) {
  try {
    const rl = createInterface2({
      input: createReadStream2(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity
    });
    let firstPrompt = "";
    let created = "";
    let gitBranch = "";
    let linesRead = 0;
    const MAX_LINES = 30;
    for await (const line of rl) {
      if (!line.trim())
        continue;
      linesRead++;
      try {
        const entry = JSON.parse(line);
        if (!created && entry.timestamp) {
          created = entry.timestamp;
        }
        if (!gitBranch && entry.gitBranch) {
          gitBranch = entry.gitBranch;
        }
        if (entry.type === "user" && !firstPrompt && entry.message) {
          const content = entry.message.content;
          if (typeof content === "string") {
            firstPrompt = content.slice(0, 200);
          } else if (Array.isArray(content)) {
            const textBlock = content.find((b) => b.type === "text" && b.text);
            if (textBlock?.text) {
              firstPrompt = textBlock.text.slice(0, 200);
            }
          }
        }
      } catch {}
      if (firstPrompt && gitBranch && created || linesRead >= MAX_LINES) {
        rl.close();
        break;
      }
    }
    if (!created)
      return null;
    return {
      firstPrompt,
      created,
      modified: fileMtime.toISOString(),
      gitBranch,
      messageCount: 0
    };
  } catch {
    return null;
  }
}
async function countMessages(filePath) {
  let count = 0;
  try {
    const rl = createInterface2({
      input: createReadStream2(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
        count++;
      }
    }
  } catch {}
  return count;
}
async function parseConversation(filePath) {
  const entries = [];
  const renderableTypes = new Set(["user", "assistant"]);
  try {
    const rl = createInterface2({
      input: createReadStream2(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      if (!line.trim())
        continue;
      try {
        const entry = JSON.parse(line);
        if (renderableTypes.has(entry.type) && !entry.isSidechain) {
          entries.push(entry);
        }
      } catch {}
    }
  } catch {}
  return entries;
}

// src/proxy/control/sessions/ai-rename.ts
import { readFile as readFile2, writeFile, stat as stat2 } from "fs/promises";
import { join as join8 } from "path";
import { existsSync as existsSync8 } from "fs";
async function handleAiRename(req, folder, sessionId, corsHeaders) {
  const jsonlPath = join8(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
  if (!existsSync8(jsonlPath)) {
    return jsonResponse({ error: "Session not found" }, 404, corsHeaders);
  }
  let bodyProvider;
  let bodyModel;
  try {
    const body = await req.json();
    if (typeof body.provider === "string")
      bodyProvider = body.provider;
    if (typeof body.model === "string")
      bodyModel = body.model;
  } catch {}
  const entries = await parseConversation(jsonlPath);
  if (entries.length === 0) {
    return jsonResponse({ error: "Session has no conversation messages" }, 400, corsHeaders);
  }
  const snippets = [];
  let userCount = 0;
  let assistantCount = 0;
  for (const entry of entries) {
    if (!entry.message)
      continue;
    const content = entry.message.content;
    if (entry.type === "user" && userCount < 5) {
      if (typeof content === "string") {
        snippets.push(`User: ${content.slice(0, 300)}`);
      } else if (Array.isArray(content)) {
        const text = content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join(" ");
        if (text)
          snippets.push(`User: ${text.slice(0, 300)}`);
      }
      userCount++;
    } else if (entry.type === "assistant" && assistantCount < 3) {
      if (typeof content === "string") {
        snippets.push(`Assistant: ${content.slice(0, 200)}`);
      } else if (Array.isArray(content)) {
        const text = content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join(" ");
        if (text)
          snippets.push(`Assistant: ${text.slice(0, 200)}`);
      }
      assistantCount++;
    }
    if (userCount >= 5 && assistantCount >= 3)
      break;
  }
  const conversationContext = snippets.join(`

`);
  const controlPort = new URL(req.url).port || "18920";
  try {
    const resp = await fetch(`http://localhost:${controlPort}/internal/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: bodyProvider,
        model: bodyModel,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: `Generate a concise title (5-10 words, no quotes) summarizing this Claude Code conversation:

${conversationContext}`
          }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return jsonResponse({
        error: `AI provider failed: ${err.error ?? resp.statusText}`
      }, 502, corsHeaders);
    }
    const result = await resp.json();
    const summary = result.content.trim().replace(/^["']|["']$/g, "").slice(0, 120);
    if (!summary) {
      return jsonResponse({ error: "AI returned empty summary" }, 500, corsHeaders);
    }
    const indexPath = join8(PROJECTS_DIR, folder, "sessions-index.json");
    try {
      const raw = await readFile2(indexPath, "utf-8");
      const index = JSON.parse(raw);
      const indexEntry = index.entries.find((e) => e.sessionId === sessionId);
      if (indexEntry) {
        indexEntry.summary = summary;
      } else {
        const fileMtime = (await stat2(jsonlPath)).mtime;
        const meta = await extractQuickMeta(jsonlPath, fileMtime);
        const msgCount = await countMessages(jsonlPath);
        index.entries.push({
          sessionId,
          firstPrompt: meta?.firstPrompt ?? "",
          summary,
          messageCount: msgCount,
          created: meta?.created ?? fileMtime.toISOString(),
          modified: fileMtime.toISOString(),
          gitBranch: meta?.gitBranch ?? "",
          projectPath: index.originalPath ?? await resolveProjectPath(folder),
          isSidechain: false
        });
      }
      await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
    } catch {
      const fileMtime = (await stat2(jsonlPath)).mtime;
      const meta = await extractQuickMeta(jsonlPath, fileMtime);
      const msgCount = await countMessages(jsonlPath);
      const newIndex = {
        version: 1,
        entries: [
          {
            sessionId,
            firstPrompt: meta?.firstPrompt ?? "",
            summary,
            messageCount: msgCount,
            created: meta?.created ?? fileMtime.toISOString(),
            modified: fileMtime.toISOString(),
            gitBranch: meta?.gitBranch ?? "",
            projectPath: await resolveProjectPath(folder),
            isSidechain: false
          }
        ]
      };
      await writeFile(indexPath, JSON.stringify(newIndex, null, 2), "utf-8");
    }
    return jsonResponse({
      ok: true,
      sessionId,
      summary,
      provider: result.provider,
      model: result.model
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({
      error: `AI rename failed: ${toErrorMessage(error)}`
    }, 500, corsHeaders);
  }
}

// src/proxy/control/sessions/handler.ts
async function handleSessionsRequest(req, path, corsHeaders) {
  const subpath = path.replace(/^\/api\/sessions/, "") || "/";
  if (req.method === "GET" && (subpath === "/" || subpath === "")) {
    return handleListProjects(corsHeaders);
  }
  const parts = subpath.slice(1).split("/");
  const folder = decodeURIComponent(parts[0] ?? "");
  if (!folder)
    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  if (req.method === "GET" && parts.length === 1) {
    return handleListSessions(folder, corsHeaders);
  }
  if (req.method === "DELETE" && parts.length === 1) {
    return handleDeleteProject(folder, corsHeaders);
  }
  if (req.method === "DELETE" && parts.length === 2 && parts[1] === "empty") {
    return handleCleanupEmpty(folder, corsHeaders);
  }
  if (req.method === "DELETE" && parts.length === 2 && parts[1] === "old") {
    const url = new URL(req.url, "http://localhost");
    const days = parseInt(url.searchParams.get("days") ?? "15", 10);
    return handleCleanupOld(folder, days, corsHeaders);
  }
  const sessionId = parts[1] ?? "";
  if (!sessionId)
    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  if (req.method === "GET" && parts.length === 2) {
    return handleGetConversation(folder, sessionId, corsHeaders);
  }
  if (req.method === "GET" && parts.length === 3 && parts[2] === "meta") {
    return handleGetSessionMeta(folder, sessionId, corsHeaders);
  }
  if (req.method === "PATCH" && parts.length === 2) {
    return handleRenameSession(req, folder, sessionId, corsHeaders);
  }
  if (req.method === "POST" && parts.length === 3 && parts[2] === "ai-rename") {
    return handleAiRename(req, folder, sessionId, corsHeaders);
  }
  if (req.method === "DELETE" && parts.length === 2) {
    return handleDeleteSession(folder, sessionId, corsHeaders);
  }
  return jsonResponse({ error: "Not found" }, 404, corsHeaders);
}
async function handleListProjects(corsHeaders) {
  try {
    const entries = await readdir2(PROJECTS_DIR, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      const sessionEntries = await scanJsonlFiles(entry.name);
      const index = await readSessionIndex(entry.name);
      const diskIds = new Set(sessionEntries.map((e) => e.sessionId));
      const indexOnlyCount = index ? index.entries.filter((e) => !diskIds.has(e.sessionId)).length : 0;
      const totalCount = sessionEntries.length + indexOnlyCount;
      if (totalCount === 0)
        continue;
      const candidatePath = index?.originalPath ?? index?.entries[0]?.projectPath;
      const projectPath = candidatePath && looksLikeValidPath(candidatePath) ? candidatePath : await resolveProjectPath(entry.name);
      let latestMtime;
      if (sessionEntries.length > 0) {
        latestMtime = sessionEntries.reduce((max, f) => f.mtime > max ? f.mtime : max, sessionEntries[0].mtime);
      } else if (index && index.entries.length > 0) {
        latestMtime = index.entries.reduce((max, e) => {
          const d = new Date(e.modified);
          return d > max ? d : max;
        }, new Date(index.entries[0].modified));
      } else {
        latestMtime = new Date;
      }
      projects.push({
        folder: entry.name,
        projectPath,
        sessionCount: totalCount,
        lastModified: latestMtime.toISOString()
      });
    }
    projects.sort((a, b) => {
      if (!a.lastModified)
        return 1;
      if (!b.lastModified)
        return -1;
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });
    return jsonResponse({ projects }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "Failed to scan projects", detail: String(error) }, 500, corsHeaders);
  }
}
async function handleListSessions(folder, corsHeaders) {
  let sessionEntries;
  try {
    sessionEntries = await scanJsonlFiles(folder);
  } catch {
    return jsonResponse({ error: "Project folder not found" }, 404, corsHeaders);
  }
  const index = await readSessionIndex(folder);
  const indexMap = new Map;
  if (index) {
    for (const e of index.entries) {
      indexMap.set(e.sessionId, e);
    }
  }
  if (sessionEntries.length === 0 && indexMap.size === 0) {
    return jsonResponse({ error: "No sessions found in project" }, 404, corsHeaders);
  }
  const sessions2 = [];
  for (const entry of sessionEntries) {
    const indexed = indexMap.get(entry.sessionId);
    if (indexed) {
      sessions2.push({
        sessionId: indexed.sessionId,
        firstPrompt: indexed.firstPrompt,
        summary: indexed.summary,
        messageCount: indexed.messageCount,
        created: indexed.created,
        modified: indexed.modified,
        gitBranch: indexed.gitBranch,
        isSidechain: indexed.isSidechain,
        isArchive: entry.isDirectory
      });
    } else if (entry.filePath) {
      const meta = await extractQuickMeta(entry.filePath, entry.mtime);
      if (meta) {
        sessions2.push({
          sessionId: entry.sessionId,
          firstPrompt: meta.firstPrompt,
          summary: "",
          messageCount: meta.messageCount,
          created: meta.created,
          modified: meta.modified,
          gitBranch: meta.gitBranch,
          isSidechain: false,
          isArchive: false
        });
      } else {
        sessions2.push({
          sessionId: entry.sessionId,
          firstPrompt: "",
          summary: "",
          messageCount: 0,
          created: entry.mtime.toISOString(),
          modified: entry.mtime.toISOString(),
          gitBranch: "",
          isSidechain: false,
          isArchive: false
        });
      }
    } else {
      sessions2.push({
        sessionId: entry.sessionId,
        firstPrompt: "",
        summary: "",
        messageCount: 0,
        created: entry.mtime.toISOString(),
        modified: entry.mtime.toISOString(),
        gitBranch: "",
        isSidechain: false,
        isArchive: true
      });
    }
  }
  const onDiskIds = new Set(sessionEntries.map((e) => e.sessionId));
  for (const [id, indexed] of indexMap) {
    if (onDiskIds.has(id))
      continue;
    sessions2.push({
      sessionId: indexed.sessionId,
      firstPrompt: indexed.firstPrompt,
      summary: indexed.summary,
      messageCount: indexed.messageCount,
      created: indexed.created,
      modified: indexed.modified,
      gitBranch: indexed.gitBranch,
      isSidechain: indexed.isSidechain,
      isArchive: true
    });
  }
  sessions2.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  const candidatePath = index?.originalPath ?? index?.entries[0]?.projectPath;
  const projectPath = candidatePath && looksLikeValidPath(candidatePath) ? candidatePath : await resolveProjectPath(folder);
  return jsonResponse({ folder, projectPath, sessions: sessions2 }, 200, corsHeaders);
}
async function handleGetConversation(folder, sessionId, corsHeaders) {
  const filePath = join9(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
  const sessionDir = join9(PROJECTS_DIR, folder, sessionId);
  const index = await readSessionIndex(folder);
  const indexEntry = index?.entries.find((e) => e.sessionId === sessionId);
  const meta = indexEntry ? {
    summary: indexEntry.summary,
    firstPrompt: indexEntry.firstPrompt,
    messageCount: indexEntry.messageCount,
    created: indexEntry.created,
    modified: indexEntry.modified,
    gitBranch: indexEntry.gitBranch
  } : null;
  if (existsSync9(filePath)) {
    const entries = await parseConversation(filePath);
    return jsonResponse({ sessionId, folder, meta, entries }, 200, corsHeaders);
  }
  if (existsSync9(sessionDir)) {
    return jsonResponse({
      sessionId,
      folder,
      meta,
      entries: [],
      isArchive: true,
      message: "Session conversation data is managed by Claude Code and not available for replay."
    }, 200, corsHeaders);
  }
  return jsonResponse({ error: "Session not found" }, 404, corsHeaders);
}
async function handleGetSessionMeta(folder, sessionId, corsHeaders) {
  const index = await readSessionIndex(folder);
  const indexEntry = index?.entries.find((e) => e.sessionId === sessionId);
  if (indexEntry) {
    return jsonResponse({
      sessionId: indexEntry.sessionId,
      summary: indexEntry.summary,
      firstPrompt: indexEntry.firstPrompt,
      messageCount: indexEntry.messageCount,
      created: indexEntry.created,
      modified: indexEntry.modified,
      gitBranch: indexEntry.gitBranch,
      projectPath: indexEntry.projectPath,
      isSidechain: indexEntry.isSidechain
    }, 200, corsHeaders);
  }
  const filePath = join9(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
  const sessionDir = join9(PROJECTS_DIR, folder, sessionId);
  if (existsSync9(filePath)) {
    let fileMtime = new Date;
    try {
      fileMtime = (await stat3(filePath)).mtime;
    } catch {}
    const meta = await extractQuickMeta(filePath, fileMtime);
    if (meta) {
      return jsonResponse({
        sessionId,
        summary: "",
        firstPrompt: meta.firstPrompt,
        messageCount: meta.messageCount,
        created: meta.created,
        modified: meta.modified,
        gitBranch: meta.gitBranch,
        projectPath: await resolveProjectPath(folder),
        isSidechain: false
      }, 200, corsHeaders);
    }
  }
  if (existsSync9(sessionDir)) {
    let dirMtime = new Date;
    try {
      dirMtime = (await stat3(sessionDir)).mtime;
    } catch {}
    return jsonResponse({
      sessionId,
      summary: "",
      firstPrompt: "",
      messageCount: 0,
      created: dirMtime.toISOString(),
      modified: dirMtime.toISOString(),
      gitBranch: "",
      projectPath: await resolveProjectPath(folder),
      isSidechain: false,
      isArchive: true
    }, 200, corsHeaders);
  }
  return jsonResponse({ error: "Session not found" }, 404, corsHeaders);
}
async function handleRenameSession(req, folder, sessionId, corsHeaders) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }
  if (!body.summary || typeof body.summary !== "string") {
    return jsonResponse({ error: 'Missing or invalid "summary" field' }, 400, corsHeaders);
  }
  const newSummary = body.summary.trim();
  if (!newSummary) {
    return jsonResponse({ error: "Summary cannot be empty" }, 400, corsHeaders);
  }
  const jsonlPath = join9(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
  const sessionDir = join9(PROJECTS_DIR, folder, sessionId);
  const hasJsonl = existsSync9(jsonlPath);
  const hasDir = existsSync9(sessionDir);
  if (!hasJsonl && !hasDir) {
    return jsonResponse({ error: "Session not found" }, 404, corsHeaders);
  }
  const indexPath = join9(PROJECTS_DIR, folder, "sessions-index.json");
  try {
    const raw = await readFile3(indexPath, "utf-8");
    const index = JSON.parse(raw);
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    if (entry) {
      entry.summary = newSummary;
    } else {
      let fileMtime = new Date;
      let meta = null;
      if (hasJsonl) {
        fileMtime = (await stat3(jsonlPath)).mtime;
        meta = await extractQuickMeta(jsonlPath, fileMtime);
      } else if (hasDir) {
        fileMtime = (await stat3(sessionDir)).mtime;
      }
      const msgCount = hasJsonl ? await countMessages(jsonlPath) : 0;
      index.entries.push({
        sessionId,
        firstPrompt: meta?.firstPrompt ?? "",
        summary: newSummary,
        messageCount: msgCount,
        created: meta?.created ?? fileMtime.toISOString(),
        modified: fileMtime.toISOString(),
        gitBranch: meta?.gitBranch ?? "",
        projectPath: index.originalPath ?? await resolveProjectPath(folder),
        isSidechain: false
      });
    }
    await writeFile2(indexPath, JSON.stringify(index, null, 2), "utf-8");
  } catch {
    let fileMtime = new Date;
    let meta = null;
    if (hasJsonl) {
      fileMtime = (await stat3(jsonlPath)).mtime;
      meta = await extractQuickMeta(jsonlPath, fileMtime);
    } else if (hasDir) {
      fileMtime = (await stat3(sessionDir)).mtime;
    }
    const msgCount = hasJsonl ? await countMessages(jsonlPath) : 0;
    const newIndex = {
      version: 1,
      entries: [
        {
          sessionId,
          firstPrompt: meta?.firstPrompt ?? "",
          summary: newSummary,
          messageCount: msgCount,
          created: meta?.created ?? fileMtime.toISOString(),
          modified: fileMtime.toISOString(),
          gitBranch: meta?.gitBranch ?? "",
          projectPath: await resolveProjectPath(folder),
          isSidechain: false
        }
      ]
    };
    await writeFile2(indexPath, JSON.stringify(newIndex, null, 2), "utf-8");
  }
  return jsonResponse({ ok: true, sessionId, summary: newSummary }, 200, corsHeaders);
}
async function handleDeleteSession(folder, sessionId, corsHeaders) {
  const jsonlPath = join9(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
  const sessionDir = join9(PROJECTS_DIR, folder, sessionId);
  const hasJsonl = existsSync9(jsonlPath);
  const hasDir = existsSync9(sessionDir);
  let hasIndexEntry = false;
  if (!hasJsonl && !hasDir) {
    const index = await readSessionIndex(folder);
    hasIndexEntry = !!index?.entries.some((e) => e.sessionId === sessionId);
    if (!hasIndexEntry) {
      return jsonResponse({ error: "Session not found" }, 404, corsHeaders);
    }
  }
  if (hasJsonl) {
    try {
      await unlink(jsonlPath);
    } catch (error) {
      return jsonResponse({ error: `Failed to delete: ${error}` }, 500, corsHeaders);
    }
  }
  if (hasDir) {
    try {
      await rm(sessionDir, { recursive: true });
    } catch {}
  }
  try {
    const indexPath = join9(PROJECTS_DIR, folder, "sessions-index.json");
    const raw = await readFile3(indexPath, "utf-8");
    const index = JSON.parse(raw);
    const before = index.entries.length;
    index.entries = index.entries.filter((e) => e.sessionId !== sessionId);
    if (index.entries.length < before) {
      await writeFile2(indexPath, JSON.stringify(index, null, 2), "utf-8");
    }
  } catch {}
  return jsonResponse({ ok: true, sessionId }, 200, corsHeaders);
}
async function handleCleanupEmpty(folder, corsHeaders) {
  const jsonlFiles = await scanJsonlFiles(folder);
  const deleted = [];
  for (const file of jsonlFiles) {
    const meta = file.filePath ? await extractQuickMeta(file.filePath, file.mtime) : null;
    if (!meta || !meta.firstPrompt) {
      try {
        if (file.filePath)
          await unlink(file.filePath);
        const sessionDir = join9(PROJECTS_DIR, folder, file.sessionId);
        if (existsSync9(sessionDir)) {
          await rm(sessionDir, { recursive: true });
        }
        deleted.push(file.sessionId);
      } catch {}
    }
  }
  try {
    const indexPath = join9(PROJECTS_DIR, folder, "sessions-index.json");
    const raw = await readFile3(indexPath, "utf-8");
    const index = JSON.parse(raw);
    const deletedSet = new Set(deleted);
    const onDiskIds = new Set(jsonlFiles.map((f) => f.sessionId));
    const before = index.entries.length;
    index.entries = index.entries.filter((e) => {
      if (deletedSet.has(e.sessionId))
        return false;
      if (!onDiskIds.has(e.sessionId) && !e.firstPrompt) {
        deleted.push(e.sessionId);
        return false;
      }
      return true;
    });
    if (index.entries.length < before) {
      await writeFile2(indexPath, JSON.stringify(index, null, 2), "utf-8");
    }
  } catch {}
  return jsonResponse({ ok: true, deleted: deleted.length, sessionIds: deleted }, 200, corsHeaders);
}
async function handleCleanupOld(folder, days, corsHeaders) {
  const today = new Date;
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime() - days * 86400000;
  const jsonlFiles = await scanJsonlFiles(folder);
  const deleted = [];
  for (const file of jsonlFiles) {
    const mday = new Date(file.mtime);
    mday.setHours(0, 0, 0, 0);
    if (mday.getTime() < cutoff) {
      try {
        if (file.filePath)
          await unlink(file.filePath);
        const sessionDir = join9(PROJECTS_DIR, folder, file.sessionId);
        if (existsSync9(sessionDir)) {
          await rm(sessionDir, { recursive: true });
        }
        deleted.push(file.sessionId);
      } catch {}
    }
  }
  try {
    const indexPath = join9(PROJECTS_DIR, folder, "sessions-index.json");
    const raw = await readFile3(indexPath, "utf-8");
    const index = JSON.parse(raw);
    const deletedSet = new Set(deleted);
    const onDiskIds = new Set(jsonlFiles.map((f) => f.sessionId));
    const before = index.entries.length;
    index.entries = index.entries.filter((e) => {
      if (deletedSet.has(e.sessionId))
        return false;
      if (!onDiskIds.has(e.sessionId)) {
        const mday = new Date(e.modified);
        mday.setHours(0, 0, 0, 0);
        if (mday.getTime() < cutoff) {
          deleted.push(e.sessionId);
          return false;
        }
      }
      return true;
    });
    if (index.entries.length < before) {
      await writeFile2(indexPath, JSON.stringify(index, null, 2), "utf-8");
    }
  } catch {}
  return jsonResponse({ ok: true, deleted: deleted.length, sessionIds: deleted, days }, 200, corsHeaders);
}
async function handleDeleteProject(folder, corsHeaders) {
  const dirPath = join9(PROJECTS_DIR, folder);
  if (!existsSync9(dirPath)) {
    return jsonResponse({ error: "Project not found" }, 404, corsHeaders);
  }
  try {
    await rm(dirPath, { recursive: true });
    return jsonResponse({ ok: true, folder }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Failed to delete project: ${error}` }, 500, corsHeaders);
  }
}
// src/proxy/control/memory/handler.ts
import { readdir as readdir6, readFile as readFile7, writeFile as writeFile5, unlink as unlink3 } from "fs/promises";
import { join as join15 } from "path";
import { existsSync as existsSync13 } from "fs";

// src/proxy/control/memory/path.ts
import { readdir as readdir3 } from "fs/promises";
import { join as join10 } from "path";
import { homedir as homedir8 } from "os";
import { existsSync as existsSync10 } from "fs";
import { createReadStream as createReadStream3 } from "fs";
import { createInterface as createInterface3 } from "readline";
var GLOBAL_MEMORY_DIR = join10(homedir8(), ".claude", "oh-my-claude", "memory");
var PROJECTS_DIR2 = join10(homedir8(), ".claude", "projects");
var omcProjectRoots = new Map;
function resolveOmcProjectMemoryPath(id) {
  const parts = id.split("/");
  if (parts.length < 4 || parts[0] !== "omc")
    return null;
  const projectName = parts[1];
  const subdir = parts[2];
  const noteId = parts.slice(3).join("/");
  const projectRoot = omcProjectRoots.get(projectName);
  if (!projectRoot)
    return null;
  return join10(projectRoot, ".claude", "mem", subdir, `${noteId}.md`);
}
async function extractCwdFromJsonl(filePath) {
  const rl = createInterface3({
    input: createReadStream3(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity
  });
  let cwd = "";
  let lines = 0;
  for await (const line of rl) {
    if (!line.trim())
      continue;
    lines++;
    try {
      const entry = JSON.parse(line);
      if (entry.cwd) {
        cwd = entry.cwd;
        rl.close();
        break;
      }
    } catch {}
    if (lines >= 200) {
      rl.close();
      break;
    }
  }
  return cwd;
}
async function findJsonlFile(projDir) {
  const files = await readdir3(projDir).catch(() => []);
  const rootJsonl = files.find((n) => n.endsWith(".jsonl"));
  if (rootJsonl)
    return join10(projDir, rootJsonl);
  for (const name of files) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name))
      continue;
    const subDir = join10(projDir, name);
    const subFiles = await readdir3(subDir).catch(() => []);
    const jsonl = subFiles.find((n) => n.endsWith(".jsonl"));
    if (jsonl)
      return join10(subDir, jsonl);
    if (subFiles.includes("subagents")) {
      const agentFiles = await readdir3(join10(subDir, "subagents")).catch(() => []);
      const agentJsonl = agentFiles.find((n) => n.endsWith(".jsonl"));
      if (agentJsonl)
        return join10(subDir, "subagents", agentJsonl);
    }
  }
  return null;
}
async function resolveProjectCwd(projDir) {
  const jsonlPath = await findJsonlFile(projDir);
  if (!jsonlPath)
    return "";
  return extractCwdFromJsonl(jsonlPath);
}
async function findOmcProjectMemDirs() {
  const results = [];
  try {
    const seenRoots = new Set;
    const folders = await readdir3(PROJECTS_DIR2, { withFileTypes: true });
    for (const f of folders) {
      if (!f.isDirectory())
        continue;
      const projDir = join10(PROJECTS_DIR2, f.name);
      const cwd = await resolveProjectCwd(projDir);
      if (!cwd || seenRoots.has(cwd))
        continue;
      seenRoots.add(cwd);
      const memBaseDir = join10(cwd, ".claude", "mem");
      if (existsSync10(memBaseDir)) {
        const segments = cwd.replace(/\\/g, "/").split("/");
        const projName = segments[segments.length - 1] ?? f.name;
        if (!omcProjectRoots.has(projName)) {
          omcProjectRoots.set(projName, cwd);
        }
        for (const sub of ["notes", "sessions"]) {
          const subDir = join10(memBaseDir, sub);
          if (existsSync10(subDir)) {
            results.push({
              dir: subDir,
              projectName: projName,
              projectPath: cwd
            });
          }
        }
      }
    }
  } catch {}
  return results;
}
function resolveMemoryPath(scope, id) {
  if (scope === "global") {
    const notesPath = join10(GLOBAL_MEMORY_DIR, "notes", `${id}.md`);
    if (existsSync10(notesPath))
      return notesPath;
    const sessionsPath = join10(GLOBAL_MEMORY_DIR, "sessions", `${id}.md`);
    if (existsSync10(sessionsPath))
      return sessionsPath;
    return notesPath;
  }
  if (scope === "omc-project") {
    return resolveOmcProjectMemoryPath(id);
  }
  const slashIdx = id.indexOf("/");
  if (slashIdx === -1)
    return null;
  const folder = id.slice(0, slashIdx);
  const fileId = id.slice(slashIdx + 1);
  if (fileId === "MEMORY") {
    return join10(PROJECTS_DIR2, folder, "memory", "MEMORY.md");
  }
  return join10(PROJECTS_DIR2, folder, "memory", "notes", `${fileId}.md`);
}

// src/proxy/control/memory/io.ts
import { readdir as readdir4, readFile as readFile4 } from "fs/promises";
import { join as join11 } from "path";
import { existsSync as existsSync11 } from "fs";
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match)
    return { meta: {}, content: raw };
  const meta = {};
  const yamlLines = match[1].split(`
`);
  for (const line of yamlLines) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let value = kv[2].trim();
      if (typeof value === "string" && value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map((s) => s.trim());
      }
      meta[key] = value;
    }
  }
  return { meta, content: match[2].trim() };
}
async function readMemoryFiles(dir, scope) {
  if (!existsSync11(dir))
    return [];
  const files = await readdir4(dir);
  const entries = [];
  for (const file of files) {
    if (!file.endsWith(".md"))
      continue;
    try {
      const raw = await readFile4(join11(dir, file), "utf-8");
      const { meta, content } = parseFrontmatter(raw);
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : file.replace(".md", "");
      const boilerplateTags = new Set(["auto-capture", "session-end", "context-threshold"]);
      const rawTags = Array.isArray(meta.tags) ? meta.tags : [];
      const rawConcepts = Array.isArray(meta.concepts) ? meta.concepts : [];
      const cleanTags = [...rawTags, ...rawConcepts].map((t) => String(t).trim()).filter((t) => t && !boilerplateTags.has(t));
      entries.push({
        id: file.replace(".md", ""),
        filename: file,
        scope,
        type: meta.type ?? "note",
        tags: cleanTags,
        created: meta.created ?? "",
        title,
        content,
        raw
      });
    } catch {}
  }
  return entries.sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime());
}
async function readMemoryFilesWithPaths(dir) {
  if (!existsSync11(dir))
    return [];
  const files = await readdir4(dir);
  const entries = [];
  for (const file of files) {
    if (!file.endsWith(".md"))
      continue;
    try {
      const filePath = join11(dir, file);
      const raw = await readFile4(filePath, "utf-8");
      const { meta, content } = parseFrontmatter(raw);
      const titleMatch = content.match(/^#\s+(.+)$/m);
      entries.push({
        id: file.replace(".md", ""),
        title: titleMatch ? titleMatch[1] : file.replace(".md", ""),
        content,
        type: meta.type ?? "note",
        created: meta.created ?? "",
        filePath,
        dir
      });
    } catch {}
  }
  return entries;
}

// src/proxy/control/memory/ai-ops.ts
import { readFile as readFile6, writeFile as writeFile4, unlink as unlink2, mkdir } from "fs/promises";
import { join as join14 } from "path";

// src/memory/ai-ops-shared.ts
function parseAIJsonResult(content) {
  if (!content)
    return null;
  for (let start = 0;start < content.length; start++) {
    if (content[start] !== "{")
      continue;
    const end = findBalancedBraceEnd(content, start);
    if (end === -1)
      continue;
    const candidate = content.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const match = content.match(/\{[\s\S]*\}/);
  if (!match)
    return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
function findBalancedBraceEnd(s, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start;i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0)
        return i;
      if (depth < 0)
        return -1;
    }
  }
  return -1;
}
function deduplicateTags(tagArrays, boilerplate) {
  const seen = new Set;
  for (const tags of tagArrays) {
    for (const t of tags) {
      const tag = t.trim();
      if (tag && (!boilerplate || !boilerplate.has(tag))) {
        seen.add(tag);
      }
    }
  }
  return [...seen];
}
var BOILERPLATE_TAGS = new Set([
  "auto-capture",
  "session-end",
  "context-threshold"
]);
function buildCompactAnalyzePrompt(memorySummaries, typeFilter) {
  const typeLabel = typeFilter === "all" ? "" : `${typeFilter} `;
  return `You are a memory organization assistant. Analyze these ${typeLabel}memories and suggest groups that can be merged together.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Find memories that cover the same topic, are duplicates, or are closely related
2. Group them for merging (each group should have 2+ memories)
3. Suggest a title for each merged memory

## Rules:
- Only group memories that are truly related
- Keep distinct topics separate
- Prefer quality over quantity of groups

## Output format (JSON only, no explanation):
{
  "groups": [
    {
      "ids": ["memory-id-1", "memory-id-2"],
      "title": "Suggested merged title",
      "reason": "Brief reason for grouping"
    }
  ],
  "ungrouped": ["memory-ids-that-should-stay-separate"]
}`;
}
function buildClearAnalyzePrompt(memorySummaries) {
  return `You are a memory cleanup assistant. Analyze these memories and identify ones that should be deleted because they are outdated, redundant, or no longer useful.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Identify memories that are outdated (old session logs, stale context)
2. Identify memories that are redundant (duplicates, superseded by newer info)
3. Identify memories that are trivial or no longer useful
4. Provide a clear reason for each deletion candidate

## Rules:
- Be conservative \u2014 only suggest deletion for clearly unneeded memories
- Session memories older than 14 days are good candidates
- Keep architectural decisions, conventions, and important patterns
- Keep memories that document bugs, fixes, or lessons learned
- If unsure, do NOT suggest deletion

## Output format (JSON only, no explanation):
{
  "candidates": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be deleted",
      "confidence": "high" | "medium"
    }
  ],
  "keep": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be kept"
    }
  ]
}`;
}
function buildSummarizeAnalyzePrompt(memoryDetails, dateRangeLabel, allOriginalTags, narrative) {
  const tagList = [...allOriginalTags].join(", ") || "(none)";
  if (narrative) {
    return `You are creating a daily session narrative. Merge these session summaries from ${dateRangeLabel} into ONE chronological story.

## Sessions to consolidate:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
Create a chronological narrative that tells the story of what happened during this day.

## Output format:
### Session Flow
Describe what happened first, then what happened next, in chronological order based on session timestamps.

### Key Accomplishments
- Bullet list of concrete achievements

### Decisions Made
- Bullet list of architectural or design decisions with rationale

### Patterns & Gotchas Discovered
- Bullet list of reusable knowledge

## Rules:
- Maintain chronological flow based on session timestamps
- Deduplicate repeated content
- Preserve specific technical details (file paths, commands, APIs)
- Remove redundant "session started" or "session ended" phrasing
- Keep it concise but actionable (400-800 words max)

## Tags (CRITICAL for retrieval):
Include all important keywords from the sessions: ${tagList}

## Output format (JSON only):
{
  "title": "Daily Narrative: ${dateRangeLabel.split(" to ")[0]}",
  "summary": "## Daily Narrative: ...\\n\\n### Session Flow\\n...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`;
  }
  return `You are a memory summarization assistant. Create a consolidated timeline summary of these memories.

## Date Range: ${dateRangeLabel}

## Memories to summarize:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
1. Create a chronological timeline of key events, decisions, and activities
2. Group related items together
3. Highlight important decisions and outcomes
4. Keep the summary concise but comprehensive

## Rules:
- Use markdown format with date-based sections
- Preserve important technical details and decisions
- Merge related session entries into coherent narratives
- The summary should stand alone \u2014 someone reading it should understand the full context

## Tags (CRITICAL for retrieval):
The tags array is the PRIMARY way this summary will be found later. You MUST include:
1. ALL tags from the original memories: ${tagList}
2. Key technical terms mentioned in the content (library names, tools, APIs, patterns)
3. Feature/component names discussed
4. Action types (bug-fix, refactor, architecture, config, etc.)
5. Project names and identifiers

Do NOT use generic tags like "summary" or "timeline" \u2014 those are useless for retrieval.
Aim for 8-20 specific, searchable tags.

## Output format (JSON only):
{
  "title": "Summary: <concise topic description>",
  "summary": "# Timeline Summary\\n\\n## <Date>\\n\\n- ...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`;
}
function buildDailyNarrativePrompt(date, entries) {
  return `You are a technical session historian. Generate a comprehensive daily narrative for ${date} from these ${entries.length} session memories. Preserve ALL important details including:
- Decisions made and their rationale
- Bugs found and how they were fixed
- Architecture/design choices
- Key code changes and files modified
- Patterns discovered or gotchas encountered

Write as a structured markdown narrative:

## Daily Narrative: ${date}

### Session Flow
[Chronological story of what happened across all sessions]

### Key Decisions
[Important decisions with rationale]

### Technical Details
[Specific bugs, fixes, patterns, file changes worth remembering]

### Accomplishments
[What was achieved]

Here are the full session contents:

${entries.map((e) => `=== Session: ${e.title} (${e.created ?? "unknown"}) ===
${e.content}`).join(`

`)}`;
}

// src/memory/parser.ts
function formatLocalYYYYMMDD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// src/proxy/control/memory/query.ts
import { join as join12 } from "path";
var GLOBAL_SCOPE = "__global__";
async function collectMemoryEntries(targetProject, fullContent) {
  const all = [];
  const globalOnly = targetProject === GLOBAL_SCOPE;
  if (!globalOnly) {
    const omcDirs = await findOmcProjectMemDirs();
    for (const { dir, projectPath: pp } of omcDirs) {
      if (targetProject && pp !== targetProject)
        continue;
      if (fullContent) {
        all.push(...await readMemoryFilesWithPaths(dir));
      } else {
        const entries = await readMemoryFiles(dir, "global");
        for (const e of entries) {
          all.push({
            id: e.id,
            title: e.title,
            content: e.content.slice(0, 300),
            type: e.type,
            created: e.created,
            filePath: join12(dir.replace(/\\/g, "/").includes("/sessions") ? dir : dir, `${e.id}.md`),
            dir
          });
        }
      }
    }
  }
  if (!targetProject || globalOnly) {
    for (const sub of ["notes", "sessions"]) {
      const dir = join12(GLOBAL_MEMORY_DIR, sub);
      if (fullContent) {
        all.push(...await readMemoryFilesWithPaths(dir));
      } else {
        const entries = await readMemoryFiles(dir, "global");
        for (const e of entries) {
          all.push({
            id: e.id,
            title: e.title,
            content: e.content.slice(0, 300),
            type: e.type,
            created: e.created,
            filePath: join12(dir, `${e.id}.md`),
            dir
          });
        }
      }
    }
  }
  return all;
}

// src/proxy/control/memory/timeline.ts
import { readdir as readdir5, readFile as readFile5, writeFile as writeFile3 } from "fs/promises";
import { join as join13 } from "path";
import { existsSync as existsSync12 } from "fs";
async function regenerateTimeline(memRoot) {
  const entries = [];
  const boilerplate = new Set(["auto-capture", "session-end", "context-threshold"]);
  for (const sub of ["notes", "sessions"]) {
    const dir = join13(memRoot, sub);
    if (!existsSync12(dir))
      continue;
    const files = await readdir5(dir);
    for (const file of files) {
      if (!file.endsWith(".md") || file === "TIMELINE.md")
        continue;
      try {
        const raw = await readFile5(join13(dir, file), "utf-8");
        const { meta, content } = parseFrontmatter(raw);
        const titleMatch = content.match(/^#?\s*(.+)$/m);
        const rawTags = Array.isArray(meta.tags) ? meta.tags : [];
        const rawConcepts = Array.isArray(meta.concepts) ? meta.concepts : [];
        const tags = [...rawTags, ...rawConcepts].map((t) => String(t).trim()).filter((t) => t && !boilerplate.has(t));
        entries.push({
          title: titleMatch ? titleMatch[1].slice(0, 80) : file.replace(".md", ""),
          type: meta.type ?? "note",
          tags,
          created: meta.created ?? ""
        });
      } catch {}
    }
  }
  entries.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const now = new Date;
  const todayStr = formatLocalYYYYMMDD(now);
  const lines = [
    "# Memory Timeline",
    `> ${entries.length} memories | Updated: ${now.toISOString()}`,
    ""
  ];
  const byDate = new Map;
  for (const e of entries) {
    const date = e.created.slice(0, 10) || "unknown";
    const group = byDate.get(date) ?? [];
    group.push(e);
    byDate.set(date, group);
  }
  const dates = [...byDate.keys()].sort().reverse();
  for (const date of dates) {
    const group = byDate.get(date);
    const label = date === todayStr ? `Today (${date})` : date;
    lines.push(`## ${label}`);
    for (const e of group) {
      const time = e.created.slice(11, 16) || "";
      const tagStr = e.tags.length > 0 ? ` \`${e.tags.join(", ")}\`` : "";
      lines.push(`- ${time} [${e.type}] **${e.title}**${tagStr}`);
    }
    lines.push("");
  }
  const maxLines = 120;
  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines - 1);
    truncated.push(`
> ... truncated (${lines.length - maxLines + 1} lines omitted)`);
    await writeFile3(join13(memRoot, "TIMELINE.md"), truncated.join(`
`), "utf-8");
  } else {
    await writeFile3(join13(memRoot, "TIMELINE.md"), lines.join(`
`), "utf-8");
  }
}

// src/proxy/control/memory/ai-ops.ts
async function callAI(controlPort, prompt, body, maxTokens = 2000) {
  const resp = await fetch(`http://localhost:${controlPort}/internal/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: typeof body.provider === "string" ? body.provider : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`AI failed: ${err.error ?? resp.statusText}`);
  }
  return await resp.json();
}
async function handleDailyOperation(controlPort, body, targetProject, corsHeaders) {
  const allEntries = await collectMemoryEntries(targetProject, true);
  const sessionEntries = allEntries.filter((e) => e.type === "session");
  if (sessionEntries.length === 0) {
    return jsonResponse({ ok: true, action: "daily", analysis: "No session memories found.", memoriesAnalyzed: 0 }, 200, corsHeaders);
  }
  const dateGroups = new Map;
  for (const entry of sessionEntries) {
    if (!entry.created)
      continue;
    const date = entry.created.slice(0, 10);
    if (!date || date.length !== 10)
      continue;
    const group = dateGroups.get(date) ?? [];
    group.push(entry);
    dateGroups.set(date, group);
  }
  const targetDate = typeof body.date === "string" ? body.date : undefined;
  const datesToProcess = [];
  if (targetDate) {
    if (dateGroups.has(targetDate)) {
      datesToProcess.push(targetDate);
    } else {
      return jsonResponse({ ok: true, action: "daily", analysis: `No session memories found for ${targetDate}.`, memoriesAnalyzed: 0 }, 200, corsHeaders);
    }
  } else {
    for (const [date, entries] of dateGroups) {
      if (entries.length >= 2) {
        datesToProcess.push(date);
      }
    }
    datesToProcess.sort();
  }
  if (datesToProcess.length === 0) {
    return jsonResponse({
      ok: true,
      action: "daily",
      analysis: `Found ${dateGroups.size} dates but none with 2+ sessions to consolidate.`,
      memoriesAnalyzed: sessionEntries.length
    }, 200, corsHeaders);
  }
  const results = [];
  let lastProvider;
  let lastModel;
  for (const date of datesToProcess) {
    const entries = dateGroups.get(date);
    const prompt = buildDailyNarrativePrompt(date, entries);
    try {
      const result = await callAI(controlPort, prompt, body, 4000);
      lastProvider = result.provider;
      lastModel = result.model;
      const targetDir = entries[0].dir;
      await mkdir(targetDir, { recursive: true });
      const narrativeId = `${date}-daily-narrative`;
      const narrativePath = join14(targetDir, `${narrativeId}.md`);
      const entryTagArrays = [["daily-narrative"]];
      for (const e of entries) {
        const raw = await readFile6(e.filePath, "utf-8").catch(() => "");
        const { meta } = parseFrontmatter(raw);
        if (Array.isArray(meta.tags))
          entryTagArrays.push(meta.tags.map(String));
        if (Array.isArray(meta.concepts))
          entryTagArrays.push(meta.concepts.map(String));
      }
      const allTags = new Set(deduplicateTags(entryTagArrays, BOILERPLATE_TAGS));
      const narrativeContent = `---
title: "Daily Narrative: ${date}"
type: session
tags: [${[...allTags].join(", ")}]
created: "${date}T00:00:00.000Z"
updated: "${new Date().toISOString()}"
---

${result.content}`;
      await writeFile4(narrativePath, narrativeContent, "utf-8");
      const deletedFiles = [];
      for (const e of entries) {
        if (e.id.includes("daily-narrative"))
          continue;
        try {
          await unlink2(e.filePath);
          deletedFiles.push(e.filePath);
        } catch {}
      }
      results.push({
        date,
        sessionsConsolidated: entries.length,
        narrativePath,
        deletedFiles
      });
    } catch (error) {
      results.push({
        date,
        sessionsConsolidated: entries.length,
        narrativePath: "",
        deletedFiles: [],
        error: toErrorMessage(error)
      });
    }
  }
  const regeneratedRoots = new Set;
  for (const entry of sessionEntries) {
    const memRoot = join14(entry.dir, "..");
    if (!regeneratedRoots.has(memRoot)) {
      regeneratedRoots.add(memRoot);
      await regenerateTimeline(memRoot).catch(() => {});
    }
  }
  const totalConsolidated = results.reduce((sum, r) => sum + r.sessionsConsolidated, 0);
  const totalDeleted = results.reduce((sum, r) => sum + r.deletedFiles.length, 0);
  const successCount = results.filter((r) => !r.error).length;
  const analysisParts = [
    `Daily Narrative Results`,
    `=======================`,
    `Processed: ${totalConsolidated} sessions across ${datesToProcess.length} dates`,
    `Created: ${successCount} narratives`,
    `Deleted: ${totalDeleted} original session files`,
    ``
  ];
  for (const r of results) {
    if (r.error) {
      analysisParts.push(`- ${r.date}: ERROR \u2014 ${r.error}`);
    } else {
      analysisParts.push(`- ${r.date}: Consolidated ${r.sessionsConsolidated} sessions \u2192 daily narrative (deleted ${r.deletedFiles.length} originals)`);
    }
  }
  return jsonResponse({
    ok: true,
    action: "daily",
    analysis: analysisParts.join(`
`),
    memoriesAnalyzed: sessionEntries.length,
    datesProcessed: datesToProcess.length,
    provider: lastProvider,
    model: lastModel,
    results
  }, 200, corsHeaders);
}
async function handleCompactOperation(controlPort, body, targetProject, mode, corsHeaders) {
  const allEntries = await collectMemoryEntries(targetProject, true);
  const typeFilter = typeof body.type === "string" ? body.type : "note";
  const filteredEntries = typeFilter === "all" ? allEntries : allEntries.filter((e) => e.type === typeFilter);
  if (mode === "execute") {
    const groups = body.groups;
    if (!groups || groups.length === 0) {
      return jsonResponse({ error: "No groups provided. Use mode='analyze' first." }, 400, corsHeaders);
    }
    const results = [];
    for (const group of groups) {
      try {
        const entries = group.ids.map((id) => allEntries.find((e) => e.id === id)).filter((e) => !!e);
        if (entries.length < 2) {
          results.push({ title: group.title, merged: 0, newFile: "", deleted: [], error: "Not enough valid memories" });
          continue;
        }
        const mergedContent = entries.map((e) => `### ${e.title}

${e.content.trim()}`).join(`

---

`);
        const tagArrays = [];
        for (const e of entries) {
          const raw = await readFile6(e.filePath, "utf-8").catch(() => "");
          const { meta } = parseFrontmatter(raw);
          if (Array.isArray(meta.tags))
            tagArrays.push(meta.tags.map(String));
          if (Array.isArray(meta.concepts))
            tagArrays.push(meta.concepts.map(String));
        }
        const mergedTags = new Set(deduplicateTags(tagArrays, BOILERPLATE_TAGS));
        const allSessions = entries.every((e) => e.type === "session");
        const outputType = allSessions ? "session" : "note";
        const targetDir = entries[0].dir;
        await mkdir(targetDir, { recursive: true });
        const dateStr = formatLocalYYYYMMDD(new Date);
        const slug = group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
        const newId = `${dateStr}-compact-${slug}`;
        const newPath = join14(targetDir, `${newId}.md`);
        const latestCreated = entries.map((e) => e.created).filter(Boolean).sort().pop() || new Date().toISOString();
        const fileContent = `---
title: "${group.title}"
type: ${outputType}
tags: [${[...mergedTags].join(", ")}]
created: "${latestCreated}"
updated: "${new Date().toISOString()}"
---

${mergedContent}`;
        await writeFile4(newPath, fileContent, "utf-8");
        const deleted = [];
        for (const e of entries) {
          try {
            await unlink2(e.filePath);
            deleted.push(e.id);
          } catch {}
        }
        results.push({ title: group.title, merged: entries.length, newFile: newId, deleted });
      } catch (error) {
        results.push({ title: group.title, merged: 0, newFile: "", deleted: [], error: toErrorMessage(error) });
      }
    }
    const roots = new Set;
    for (const e of allEntries) {
      const r = join14(e.dir, "..");
      if (!roots.has(r)) {
        roots.add(r);
        await regenerateTimeline(r).catch(() => {});
      }
    }
    const totalMerged = results.reduce((s, r) => s + r.merged, 0);
    const totalDeleted = results.reduce((s, r) => s + r.deleted.length, 0);
    return jsonResponse({
      ok: true,
      action: "compact",
      mode: "execute",
      analysis: `Compact Results
===============
Merged: ${totalMerged} memories into ${results.filter((r) => !r.error).length} groups
Deleted: ${totalDeleted} originals

${results.map((r) => r.error ? `- ${r.title}: ERROR \u2014 ${r.error}` : `- ${r.title}: Merged ${r.merged} \u2192 ${r.newFile} (deleted ${r.deleted.length})`).join(`
`)}`,
      memoriesAnalyzed: filteredEntries.length,
      typeFilter,
      results
    }, 200, corsHeaders);
  }
  if (filteredEntries.length < 2) {
    return jsonResponse({
      ok: true,
      action: "compact",
      mode: "analyze",
      analysis: `Not enough ${typeFilter === "all" ? "" : typeFilter + " "}memories to compact (found ${filteredEntries.length}, need at least 2).`,
      groups: [],
      typeFilter,
      memoriesAnalyzed: filteredEntries.length
    }, 200, corsHeaders);
  }
  const summaries = filteredEntries.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    created: e.created,
    preview: e.content.slice(0, 200)
  }));
  const prompt = buildCompactAnalyzePrompt(summaries, typeFilter);
  try {
    const result = await callAI(controlPort, prompt, body);
    const parsed = parseAIJsonResult(result.content);
    const groups = parsed?.groups ?? [];
    return jsonResponse({
      ok: true,
      action: "compact",
      mode: "analyze",
      analysis: result.content,
      groups,
      typeFilter,
      provider: result.provider,
      model: result.model,
      memoriesAnalyzed: filteredEntries.length
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Compact failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
  }
}
async function handleClearOperation(controlPort, body, targetProject, mode, corsHeaders) {
  const allEntries = await collectMemoryEntries(targetProject, true);
  if (mode === "execute") {
    const ids = body.ids;
    if (!ids || ids.length === 0) {
      return jsonResponse({ error: "No IDs provided. Use mode='analyze' first." }, 400, corsHeaders);
    }
    const results = [];
    for (const id of ids) {
      const entry = allEntries.find((e) => e.id === id);
      if (!entry) {
        results.push({ id, title: id, deleted: false, error: "Not found" });
        continue;
      }
      try {
        await unlink2(entry.filePath);
        results.push({ id, title: entry.title, deleted: true });
      } catch (error) {
        results.push({ id, title: entry.title, deleted: false, error: toErrorMessage(error) });
      }
    }
    const roots = new Set;
    for (const e of allEntries) {
      const r = join14(e.dir, "..");
      if (!roots.has(r)) {
        roots.add(r);
        await regenerateTimeline(r).catch(() => {});
      }
    }
    const deleted = results.filter((r) => r.deleted).length;
    return jsonResponse({
      ok: true,
      action: "clear",
      mode: "execute",
      analysis: `Clear Results
=============
Deleted: ${deleted}/${ids.length} memories

${results.map((r) => r.deleted ? `- \u2713 ${r.title}` : `- \u2717 ${r.title}: ${r.error}`).join(`
`)}`,
      memoriesAnalyzed: allEntries.length,
      results
    }, 200, corsHeaders);
  }
  const clearSummaries = allEntries.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    created: e.created,
    preview: e.content.slice(0, 200)
  }));
  const prompt = buildClearAnalyzePrompt(clearSummaries);
  try {
    const result = await callAI(controlPort, prompt, body);
    const parsed = parseAIJsonResult(result.content);
    const candidates = parsed?.candidates ?? [];
    return jsonResponse({
      ok: true,
      action: "clear",
      mode: "analyze",
      analysis: result.content,
      candidates,
      provider: result.provider,
      model: result.model,
      memoriesAnalyzed: allEntries.length
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Clear failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
  }
}
async function handleSummarizeOperation(controlPort, body, targetProject, mode, corsHeaders) {
  const allEntries = await collectMemoryEntries(targetProject, true);
  const days = typeof body.days === "number" ? body.days : 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const recentAll = allEntries.filter((e) => e.created && e.created >= cutoff);
  const typeFilter = typeof body.type === "string" ? body.type : "all";
  const recent = typeFilter === "all" ? recentAll : recentAll.filter((e) => e.type === typeFilter);
  if (mode === "execute") {
    const summary = body.summary;
    const title = body.title || `Summary: Last ${days} days`;
    const tags = body.tags || ["summary", "timeline"];
    const originalIds = body.originalIds || [];
    if (!summary) {
      return jsonResponse({ error: "No summary provided. Use mode='analyze' first." }, 400, corsHeaders);
    }
    const targetDir = recent[0]?.dir || allEntries[0]?.dir;
    if (!targetDir) {
      return jsonResponse({ error: "No memory directory found" }, 400, corsHeaders);
    }
    await mkdir(targetDir, { recursive: true });
    const dateStr = formatLocalYYYYMMDD(new Date);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const newId = `${dateStr}-summary-${slug}`;
    const newPath = join14(targetDir, `${newId}.md`);
    const fileContent = `---
title: "${title}"
type: note
tags: [${tags.join(", ")}]
created: "${new Date().toISOString()}"
updated: "${new Date().toISOString()}"
---

${summary}`;
    await writeFile4(newPath, fileContent, "utf-8");
    let deleted = 0;
    if (originalIds.length > 0) {
      for (const id of originalIds) {
        const entry = allEntries.find((e) => e.id === id);
        if (entry) {
          try {
            await unlink2(entry.filePath);
            deleted++;
          } catch {}
        }
      }
    }
    const roots = new Set;
    for (const e of allEntries) {
      const r = join14(e.dir, "..");
      if (!roots.has(r)) {
        roots.add(r);
        await regenerateTimeline(r).catch(() => {});
      }
    }
    return jsonResponse({
      ok: true,
      action: "summarize",
      mode: "execute",
      analysis: `Summary saved as ${newId}
Deleted ${deleted} original memories`,
      summaryId: newId,
      deleted,
      memoriesAnalyzed: recent.length
    }, 200, corsHeaders);
  }
  const typeLabel = typeFilter === "all" ? "" : `${typeFilter} `;
  if (recent.length === 0) {
    return jsonResponse({
      ok: true,
      action: "summarize",
      mode: "analyze",
      analysis: `No ${typeLabel}memories found in the last ${days} days.`,
      memoriesAnalyzed: 0,
      typeFilter
    }, 200, corsHeaders);
  }
  const summaryDetails = recent.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    created: e.created,
    content: e.content.slice(0, 500)
  }));
  const allTags = new Set;
  for (const e of recent) {
    const raw = await readFile6(e.filePath, "utf-8").catch(() => "");
    const { meta } = parseFrontmatter(raw);
    if (Array.isArray(meta.tags))
      for (const t of meta.tags)
        allTags.add(String(t).trim());
  }
  const dateRangeLabel = `${cutoff.slice(0, 10)} to ${formatLocalYYYYMMDD(new Date)}`;
  const prompt = buildSummarizeAnalyzePrompt(summaryDetails, dateRangeLabel, allTags);
  try {
    const result = await callAI(controlPort, prompt, body, 4000);
    const parsed = parseAIJsonResult(result.content) ?? {};
    return jsonResponse({
      ok: true,
      action: "summarize",
      mode: "analyze",
      analysis: result.content,
      suggestedTitle: parsed.title || `Summary: Last ${days} days`,
      suggestedSummary: parsed.summary || result.content,
      suggestedTags: parsed.tags || [],
      originalIds: parsed.originalIds || recent.map((e) => e.id),
      provider: result.provider,
      model: result.model,
      memoriesAnalyzed: recent.length,
      typeFilter
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Summarize failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
  }
}

// src/proxy/control/memory/handler.ts
async function handleMemoryRequest(req, path, corsHeaders) {
  const subpath = path.replace(/^\/api\/memory/, "") || "/";
  if (req.method === "GET" && (subpath === "/" || subpath === "")) {
    return handleListMemories(corsHeaders);
  }
  if (req.method === "POST" && subpath.startsWith("/operations/")) {
    const action = subpath.replace("/operations/", "");
    return handleMemoryOperation(req, action, corsHeaders);
  }
  const parts = subpath.slice(1).split("/");
  const scope = parts[0];
  const id = parts.slice(1).join("/");
  if (!scope || !id || !["global", "project", "omc-project"].includes(scope)) {
    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  }
  if (req.method === "GET") {
    return handleGetMemory(scope, id, corsHeaders);
  }
  if (req.method === "PUT") {
    return handleUpdateMemory(req, scope, id, corsHeaders);
  }
  if (req.method === "DELETE") {
    return handleDeleteMemory(scope, id, corsHeaders);
  }
  return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
}
async function handleListMemories(corsHeaders) {
  const globalNotes = await readMemoryFiles(join15(GLOBAL_MEMORY_DIR, "notes"), "global");
  const globalSessions = await readMemoryFiles(join15(GLOBAL_MEMORY_DIR, "sessions"), "global");
  const globalEntries = [
    ...globalNotes,
    ...globalSessions
  ];
  const projectEntries = [];
  try {
    const projects = await readdir6(PROJECTS_DIR2, { withFileTypes: true });
    for (const proj of projects) {
      if (!proj.isDirectory())
        continue;
      const memDir = join15(PROJECTS_DIR2, proj.name, "memory");
      if (!existsSync13(memDir))
        continue;
      const memoryMdPath = join15(memDir, "MEMORY.md");
      if (existsSync13(memoryMdPath)) {
        try {
          const raw = await readFile7(memoryMdPath, "utf-8");
          const titleMatch = raw.match(/^#\s+(.+)$/m);
          projectEntries.push({
            id: `${proj.name}/MEMORY`,
            filename: "MEMORY.md",
            scope: "project",
            type: "index",
            tags: [],
            created: "",
            title: titleMatch ? titleMatch[1] : `${proj.name} Memory`,
            content: raw,
            raw,
            project: proj.name
          });
        } catch {}
      }
      const notesDir = join15(memDir, "notes");
      if (existsSync13(notesDir)) {
        const notes = await readMemoryFiles(notesDir, "project");
        for (const note of notes) {
          projectEntries.push({
            ...note,
            id: `${proj.name}/${note.id}`,
            project: proj.name
          });
        }
      }
    }
  } catch {}
  const omcProjectEntries = [];
  try {
    const omcDirs = await findOmcProjectMemDirs();
    for (const { dir, projectName, projectPath: projPath } of omcDirs) {
      const subdir = dir.replace(/\\/g, "/").split("/").pop() ?? "notes";
      const notes = await readMemoryFiles(dir, "omc-project");
      for (const note of notes) {
        omcProjectEntries.push({
          ...note,
          scope: "omc-project",
          id: `omc/${projectName}/${subdir}/${note.id}`,
          project: projectName,
          projectPath: projPath
        });
      }
    }
  } catch {}
  const seenOmcIds = new Set;
  const dedupedOmcEntries = omcProjectEntries.filter((e) => {
    if (seenOmcIds.has(e.id))
      return false;
    seenOmcIds.add(e.id);
    return true;
  });
  const strip = (entries) => entries.map((e) => ({
    ...e,
    content: e.content.slice(0, 200),
    raw: ""
  }));
  return jsonResponse({
    global: strip(globalEntries),
    project: strip(projectEntries),
    omcProject: strip(dedupedOmcEntries),
    total: globalEntries.length + projectEntries.length + dedupedOmcEntries.length
  }, 200, corsHeaders);
}
async function handleGetMemory(scope, id, corsHeaders) {
  const filePath = resolveMemoryPath(scope, id);
  if (!filePath || !existsSync13(filePath)) {
    return jsonResponse({ error: "Memory not found" }, 404, corsHeaders);
  }
  const raw = await readFile7(filePath, "utf-8");
  const { meta, content } = parseFrontmatter(raw);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return jsonResponse({
    id,
    scope,
    type: meta.type ?? "note",
    tags: meta.tags ?? [],
    created: meta.created ?? "",
    title: titleMatch ? titleMatch[1] : id,
    content,
    raw
  }, 200, corsHeaders);
}
async function handleUpdateMemory(req, scope, id, corsHeaders) {
  const filePath = resolveMemoryPath(scope, id);
  if (!filePath) {
    return jsonResponse({ error: "Invalid memory path" }, 400, corsHeaders);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (typeof body.content !== "string") {
    return jsonResponse({ error: "content field required" }, 400, corsHeaders);
  }
  try {
    await writeFile5(filePath, body.content, "utf-8");
    return jsonResponse({ ok: true, id, scope }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Write failed: ${error}` }, 500, corsHeaders);
  }
}
async function handleDeleteMemory(scope, id, corsHeaders) {
  const filePath = resolveMemoryPath(scope, id);
  if (!filePath || !existsSync13(filePath)) {
    return jsonResponse({ error: "Memory not found" }, 404, corsHeaders);
  }
  try {
    await unlink3(filePath);
    return jsonResponse({ ok: true, id, scope }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: `Delete failed: ${error}` }, 500, corsHeaders);
  }
}
async function handleMemoryOperation(req, action, corsHeaders) {
  if (!["compact", "summarize", "clear", "daily"].includes(action)) {
    return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders);
  }
  let body = {};
  try {
    body = await req.json();
  } catch {}
  const controlPort = new URL(req.url).port || "18920";
  const targetProject = typeof body.projectPath === "string" ? body.projectPath : undefined;
  if (action === "daily") {
    return handleDailyOperation(controlPort, body, targetProject, corsHeaders);
  }
  const mode = typeof body.mode === "string" ? body.mode : "analyze";
  if (action === "compact") {
    return handleCompactOperation(controlPort, body, targetProject, mode, corsHeaders);
  } else if (action === "clear") {
    return handleClearOperation(controlPort, body, targetProject, mode, corsHeaders);
  } else if (action === "summarize") {
    return handleSummarizeOperation(controlPort, body, targetProject, mode, corsHeaders);
  }
  return jsonResponse({ error: `Unknown action: ${action}` }, 400, corsHeaders);
}
// src/proxy/control/preferences.ts
import { readFile as readFile8, writeFile as writeFile6, readdir as readdir7 } from "fs/promises";
import { join as join16 } from "path";
import { homedir as homedir9 } from "os";
import { existsSync as existsSync14 } from "fs";
import { createReadStream as createReadStream4 } from "fs";
import { createInterface as createInterface4 } from "readline";
var GLOBAL_PREFS_FILE = join16(homedir9(), ".claude", "oh-my-claude", "preferences.json");
var PROJECTS_DIR3 = join16(homedir9(), ".claude", "projects");
async function readPrefs(filePath = GLOBAL_PREFS_FILE) {
  if (!existsSync14(filePath))
    return {};
  try {
    const raw = await readFile8(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function writePrefs(prefs, filePath = GLOBAL_PREFS_FILE) {
  await writeFile6(filePath, JSON.stringify(prefs, null, 2), "utf-8");
}
async function extractCwdFromJsonl2(filePath) {
  const rl = createInterface4({
    input: createReadStream4(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity
  });
  let cwd = "";
  let lines = 0;
  for await (const line of rl) {
    if (!line.trim())
      continue;
    lines++;
    try {
      const entry = JSON.parse(line);
      if (entry.cwd) {
        cwd = entry.cwd;
        rl.close();
        break;
      }
    } catch {}
    if (lines >= 200) {
      rl.close();
      break;
    }
  }
  return cwd;
}
async function findJsonlFile2(projDir) {
  const files = await readdir7(projDir).catch(() => []);
  const rootJsonl = files.find((n) => n.endsWith(".jsonl"));
  if (rootJsonl)
    return join16(projDir, rootJsonl);
  for (const name of files) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name))
      continue;
    const subDir = join16(projDir, name);
    const subFiles = await readdir7(subDir).catch(() => []);
    const jsonl = subFiles.find((n) => n.endsWith(".jsonl"));
    if (jsonl)
      return join16(subDir, jsonl);
    if (subFiles.includes("subagents")) {
      const agentFiles = await readdir7(join16(subDir, "subagents")).catch(() => []);
      const agentJsonl = agentFiles.find((n) => n.endsWith(".jsonl"));
      if (agentJsonl)
        return join16(subDir, "subagents", agentJsonl);
    }
  }
  return null;
}
async function findProjectPrefs() {
  const results = [];
  try {
    const folders = await readdir7(PROJECTS_DIR3, { withFileTypes: true });
    for (const f of folders) {
      if (!f.isDirectory())
        continue;
      const projDir = join16(PROJECTS_DIR3, f.name);
      const jsonlPath = await findJsonlFile2(projDir);
      if (!jsonlPath)
        continue;
      const cwd = await extractCwdFromJsonl2(jsonlPath);
      if (!cwd)
        continue;
      const prefsFile = join16(cwd, ".claude", "preferences.json");
      if (existsSync14(prefsFile)) {
        const segments = cwd.replace(/\\/g, "/").split("/");
        results.push({
          projectName: segments[segments.length - 1] ?? f.name,
          projectPath: cwd,
          filePath: prefsFile
        });
      }
    }
  } catch {}
  return results;
}
async function handlePreferencesRequest(req, path, corsHeaders) {
  const subpath = path.replace(/^\/api\/preferences/, "") || "/";
  if (req.method === "GET" && (subpath === "/" || subpath === "")) {
    const globalPrefs = await readPrefs();
    const globalList = Object.entries(globalPrefs).map(([prefId, p]) => ({
      ...p,
      id: prefId,
      scope: "global"
    }));
    const projectList = [];
    try {
      const projPrefs = await findProjectPrefs();
      for (const { projectName, filePath } of projPrefs) {
        const prefs = await readPrefs(filePath);
        for (const [prefId, p] of Object.entries(prefs)) {
          projectList.push({
            ...p,
            id: prefId,
            scope: "project",
            project: projectName
          });
        }
      }
    } catch {}
    return jsonResponse({ preferences: [...globalList, ...projectList] }, 200, corsHeaders);
  }
  if (req.method === "POST" && (subpath === "/" || subpath === "")) {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
    }
    if (!body.title || !body.content) {
      return jsonResponse({ error: "title and content required" }, 400, corsHeaders);
    }
    const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const id2 = `pref-${date}-${slug}`;
    const pref = {
      id: id2,
      title: body.title,
      content: body.content,
      tags: body.tags ?? [],
      autoInject: body.autoInject ?? true,
      trigger: body.trigger ?? { always: true },
      createdAt: new Date().toISOString()
    };
    let targetFile = GLOBAL_PREFS_FILE;
    if (body.projectPath) {
      const projFile = join16(body.projectPath, ".claude", "preferences.json");
      const { mkdirSync: mkdirSync6 } = await import("fs");
      mkdirSync6(join16(body.projectPath, ".claude"), { recursive: true });
      targetFile = projFile;
    }
    const prefs = await readPrefs(targetFile);
    prefs[id2] = pref;
    await writePrefs(prefs, targetFile);
    return jsonResponse({ ok: true, preference: pref }, 201, corsHeaders);
  }
  const id = decodeURIComponent(subpath.slice(1));
  if (req.method === "DELETE" && id) {
    const prefs = await readPrefs();
    if (!prefs[id]) {
      return jsonResponse({ error: "Preference not found" }, 404, corsHeaders);
    }
    delete prefs[id];
    await writePrefs(prefs);
    return jsonResponse({ ok: true, id }, 200, corsHeaders);
  }
  if (req.method === "PUT" && id) {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
    }
    const prefs = await readPrefs();
    if (!prefs[id]) {
      return jsonResponse({ error: "Preference not found" }, 404, corsHeaders);
    }
    if (body.title !== undefined)
      prefs[id].title = body.title;
    if (body.content !== undefined)
      prefs[id].content = body.content;
    if (body.tags !== undefined)
      prefs[id].tags = body.tags;
    if (body.autoInject !== undefined)
      prefs[id].autoInject = body.autoInject;
    if (body.trigger !== undefined)
      prefs[id].trigger = body.trigger;
    await writePrefs(prefs);
    return jsonResponse({ ok: true, preference: prefs[id] }, 200, corsHeaders);
  }
  return jsonResponse({ error: "Not found" }, 404, corsHeaders);
}
// src/proxy/control/web-static.ts
import { existsSync as existsSync15, readFileSync as readFileSync8 } from "fs";
import { join as join17, extname } from "path";
import { homedir as homedir10 } from "os";
var __dirname = "D:\\Github\\oh-my-claude\\src\\proxy\\control";
var MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
function getWebDirs() {
  const dirs = [];
  dirs.push(join17(process.cwd(), "dist", "proxy", "web"));
  const installed = join17(homedir10(), ".claude", "oh-my-claude", "dist", "proxy", "web");
  dirs.push(installed);
  if (typeof __dirname !== "undefined") {
    dirs.push(join17(__dirname, "web"));
  }
  return dirs;
}
var cachedWebDir = null;
function resolveWebDir() {
  if (cachedWebDir !== null)
    return cachedWebDir;
  for (const dir of getWebDirs()) {
    if (existsSync15(join17(dir, "index.html"))) {
      cachedWebDir = dir;
      return dir;
    }
  }
  return null;
}
var cachedIndexHtml = null;
function getIndexHtml(webDir) {
  if (cachedIndexHtml !== null)
    return cachedIndexHtml;
  cachedIndexHtml = readFileSync8(join17(webDir, "index.html"));
  return cachedIndexHtml;
}
function serveWebAsset(assetPath) {
  const webDir = resolveWebDir();
  if (!webDir) {
    return new Response("<html><body><h1>Dashboard not built</h1><p>Run <code>bun run build:web</code> to build the dashboard.</p></body></html>", {
      status: 404,
      headers: { "content-type": "text/html" }
    });
  }
  const normalized = assetPath.replace(/\.\./g, "").replace(/^\/+/, "");
  const filePath = join17(webDir, normalized);
  if (normalized === "index.html" || normalized === "") {
    return new Response(getIndexHtml(webDir), {
      headers: {
        "content-type": "text/html",
        "cache-control": "no-cache"
      }
    });
  }
  if (existsSync15(filePath)) {
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(readFileSync8(filePath), {
      headers: {
        "content-type": contentType,
        "cache-control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
      }
    });
  }
  return new Response(getIndexHtml(webDir), {
    headers: {
      "content-type": "text/html",
      "cache-control": "no-cache"
    }
  });
}

// src/proxy/control/index.ts
var responseCache = new Map;
var CACHE_TTL_MS = 5000;
var MAX_CACHE_SIZE = 50;
function getCached(key, corsHeaders) {
  const entry = responseCache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS)
    return null;
  return new Response(entry.body, {
    status: entry.status,
    headers: { "content-type": "application/json", ...corsHeaders }
  });
}
async function cachedHandler(key, handler, corsHeaders) {
  const cached = getCached(key, corsHeaders);
  if (cached)
    return cached;
  const resp = await handler();
  if (resp.status < 300 && resp.headers.get("content-type")?.includes("json")) {
    const body = await resp.text();
    if (responseCache.size >= MAX_CACHE_SIZE) {
      let oldestKey;
      let oldestTs = Infinity;
      for (const [k, v] of responseCache) {
        if (v.ts < oldestTs) {
          oldestTs = v.ts;
          oldestKey = k;
        }
      }
      if (oldestKey)
        responseCache.delete(oldestKey);
    }
    responseCache.set(key, { body, status: resp.status, ts: Date.now() });
    return new Response(body, {
      status: resp.status,
      headers: { "content-type": "application/json", ...corsHeaders }
    });
  }
  return resp;
}
function invalidateCache(prefix) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix))
      responseCache.delete(key);
  }
}
async function forwardToInstance(req, controlPort, path, corsHeaders) {
  const targetUrl = `http://localhost:${controlPort}${path}`;
  let resp;
  try {
    resp = await fetch(targetUrl, {
      method: req.method,
      headers: { "content-type": "application/json" },
      body: req.method === "POST" ? await req.text() : undefined,
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({
      error: `Instance on port ${controlPort} unreachable`,
      detail: message
    }, 502, corsHeaders);
  }
  const bodyText = await resp.text();
  try {
    const data = bodyText ? JSON.parse(bodyText) : {};
    return jsonResponse(data, resp.status, corsHeaders);
  } catch {
    return jsonResponse({
      error: "non-json response from instance",
      status: resp.status,
      body: bodyText.slice(0, 500)
    }, resp.ok ? 502 : resp.status, corsHeaders);
  }
}
async function handleControl(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const sessionId = url.searchParams.get("session") || undefined;
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (path === "/web" || path === "/web/") {
    return serveWebAsset("index.html");
  }
  if (path.startsWith("/web/")) {
    return serveWebAsset(path.slice(5));
  }
  if (path === "/favicon.ico" || path === "/favicon.svg") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#6366f1"/><text x="16" y="21" font-size="12" font-family="system-ui" fill="white" text-anchor="middle" font-weight="bold">omc</text></svg>`;
    return new Response(svg, {
      headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" }
    });
  }
  if (path === "/") {
    return Response.redirect(new URL("/web/", req.url).toString(), 302);
  }
  if (path.startsWith("/api/registry")) {
    return handleRegistryRequest(req, path, corsHeaders);
  }
  if (path === "/api/usage") {
    const { handleUsageRequest: handleUsageRequest2 } = await Promise.resolve().then(() => (init_usage(), exports_usage));
    return handleUsageRequest2(corsHeaders);
  }
  if (path === "/api/instances") {
    if (req.method === "GET") {
      return cachedHandler("api:instances", () => handleInstancesRequest(req, corsHeaders), corsHeaders);
    }
    return handleInstancesRequest(req, corsHeaders);
  }
  const instanceMatch = path.match(/^\/api\/instances\/(\d+)\/(switch|revert|status)$/);
  if (instanceMatch) {
    const [, targetPort, action] = instanceMatch;
    const sessionParam = url.searchParams.get("session");
    const targetPath = sessionParam ? `/${action}?session=${sessionParam}` : `/${action}`;
    return forwardToInstance(req, Number(targetPort), targetPath, corsHeaders);
  }
  if (path.startsWith("/api/config")) {
    return handleConfigRequest(req, path, corsHeaders);
  }
  if (path.startsWith("/api/sessions")) {
    if (req.method === "GET") {
      return cachedHandler(`sessions:${path}`, () => handleSessionsRequest(req, path, corsHeaders), corsHeaders);
    }
    invalidateCache("sessions:");
    return handleSessionsRequest(req, path, corsHeaders);
  }
  if (path.startsWith("/api/memory")) {
    if (req.method === "GET") {
      return cachedHandler(`memory:${path}`, () => handleMemoryRequest(req, path, corsHeaders), corsHeaders);
    }
    invalidateCache("memory:");
    return handleMemoryRequest(req, path, corsHeaders);
  }
  if (path.startsWith("/api/preferences")) {
    if (req.method === "GET") {
      return cachedHandler(`prefs:${path}`, () => handlePreferencesRequest(req, path, corsHeaders), corsHeaders);
    }
    invalidateCache("prefs:");
    return handlePreferencesRequest(req, path, corsHeaders);
  }
  const sessionTag = sessionId ? ` [s:${sessionId.slice(0, 8)}]` : " [global]";
  try {
    switch (path) {
      case "/health":
        return await handleHealth(corsHeaders);
      case "/status":
        return await handleStatus(sessionId, corsHeaders);
      case "/sessions":
        return handleSessions(corsHeaders);
      case "/usage":
        return handleUsage(corsHeaders);
      case "/providers":
        return await handleProviders(corsHeaders);
      case "/response":
        return await handleResponse(url, corsHeaders);
      case "/stream":
        return await handleStream(url, corsHeaders);
      case "/switch":
        return await handleSwitch(req, sessionId, sessionTag, corsHeaders);
      case "/revert":
        return await handleRevert(req, sessionId, sessionTag, corsHeaders);
      case "/models":
        return await handleModels(url, corsHeaders);
      case "/stop":
        return await handleStop(req, corsHeaders);
      case "/internal/complete":
        return await handleInternalComplete(req, corsHeaders);
      case "/internal/memory-config":
        return await handleMemoryConfig(req, corsHeaders);
      default:
        return jsonResponse({
          error: "Not found",
          endpoints: [
            "/health",
            "/status",
            "/sessions",
            "/usage",
            "/providers",
            "/response",
            "/stream",
            "/switch",
            "/revert",
            "/models",
            "/stop",
            "/internal/complete",
            "/internal/memory-config",
            "/api/sessions"
          ],
          hint: "Add ?session=ID for session-scoped operations"
        }, 404, corsHeaders);
    }
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(`[control] Error: ${message}`);
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
}

// src/proxy/server.ts
init_session();
init_types();

// src/shared/providers/aliases.ts
var ALIAS_MAP = {
  ds: { provider: "deepseek", model: "deepseek-v4-pro" },
  dr: { provider: "deepseek", model: "deepseek-v4-pro" },
  "ds-r": { provider: "deepseek", model: "deepseek-v4-pro" },
  deepseek: { provider: "deepseek", model: "deepseek-v4-pro" },
  "deepseek-v4": { provider: "deepseek", model: "deepseek-v4-pro" },
  "deepseek-v4-pro": { provider: "deepseek", model: "deepseek-v4-pro" },
  "ds-f": { provider: "deepseek", model: "deepseek-v4-flash" },
  "deepseek-v4-flash": { provider: "deepseek", model: "deepseek-v4-flash" },
  zp: { provider: "zhipu", model: "glm-5.1" },
  zhipu: { provider: "zhipu", model: "glm-5.1" },
  zai: { provider: "zai", model: "glm-5.1" },
  "zp-g": { provider: "zai", model: "glm-5.1" },
  "zhipu-global": { provider: "zai", model: "glm-5.1" },
  mm: { provider: "minimax", model: "MiniMax-M2.7" },
  minimax: { provider: "minimax", model: "MiniMax-M2.7" },
  "mm-cn": { provider: "minimax-cn", model: "MiniMax-M2.7" },
  "minimax-cn": { provider: "minimax-cn", model: "MiniMax-M2.7" },
  km: { provider: "kimi", model: "kimi-for-coding" },
  kimi: { provider: "kimi", model: "kimi-for-coding" },
  ay: { provider: "aliyun", model: "qwen3.6-plus" },
  ali: { provider: "aliyun", model: "qwen3.6-plus" },
  aliyun: { provider: "aliyun", model: "qwen3.6-plus" },
  or: { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  openrouter: { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  ol: { provider: "ollama", model: "" },
  ollama: { provider: "ollama", model: "" }
};
function resolveProviderName(alias) {
  const target = ALIAS_MAP[alias.toLowerCase()];
  return target ? target.provider : alias;
}

// src/proxy/server.ts
function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PROXY_CONFIG.port;
  let controlPort = DEFAULT_PROXY_CONFIG.controlPort;
  let provider;
  let model;
  for (let i = 0;i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === "--port" && next) {
      port = parseInt(next, 10);
      i++;
    } else if (args[i] === "--control-port" && next) {
      controlPort = parseInt(next, 10);
      i++;
    } else if (args[i] === "--provider" && next) {
      provider = next;
      i++;
    } else if (args[i] === "--model" && next) {
      model = next;
      i++;
    }
  }
  return { port, controlPort, provider, model };
}
async function main() {
  const { port, controlPort, provider: rawProvider, model } = parseArgs();
  const authConfig = initializeAuth();
  const authModeLabel = authConfig.authMode === "oauth" ? "oauth (subscription)" : "api-key";
  const switchProviderRaw = rawProvider || process.env.OMC_PROXY_SWITCH_PROVIDER;
  const switchModel = model || process.env.OMC_PROXY_SWITCH_MODEL;
  if (switchProviderRaw && switchModel) {
    const switchProvider = resolveProviderName(switchProviderRaw);
    const switchState = {
      switched: true,
      provider: switchProvider,
      model: switchModel,
      switchedAt: Date.now()
    };
    setDefaultSwitchState(switchState);
    writeSwitchState(switchState);
  } else {
    resetSwitchState();
  }
  const proxy = Bun.serve({
    port,
    idleTimeout: 255,
    fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;
      let sessionId;
      const sessionInfo = parseSessionFromPath(pathname);
      if (sessionInfo) {
        sessionId = sessionInfo.sessionId;
        pathname = sessionInfo.strippedPath;
      }
      if (pathname === "/v1/messages") {
        return handleMessages(req, sessionId);
      }
      if (pathname === "/v1/models" && req.method === "GET") {
        return handleModelsRequest(req, sessionId);
      }
      return handleOtherRequest(req, sessionId);
    },
    error(error) {
      console.error(`[proxy] Server error: ${error.message}`);
      return new Response(JSON.stringify({
        error: { type: "proxy_error", message: error.message }
      }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const control = Bun.serve({
    port: controlPort,
    fetch: handleControl,
    error(error) {
      console.error(`[control] Server error: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  });
  console.error("oh-my-claude Proxy Server");
  console.error(`  Proxy:   http://localhost:${proxy.port}`);
  console.error(`  Control: http://localhost:${control.port}`);
  console.error("");
  console.error("Set in your shell:");
  console.error(`  export ANTHROPIC_BASE_URL=http://localhost:${proxy.port}`);
  console.error("");
  const state = getDefaultSwitchState() ?? readSwitchState();
  console.error(`  Auth:  ${authModeLabel}`);
  console.error(`  Mode: ${state.switched ? `switched \u2192 ${state.provider}/${state.model}` : "passthrough \u2192 Anthropic"}`);
  console.error("  Session isolation: enabled (path-based /s/{id}/...)");
  if (process.env.OMC_PROXY_DEBUG === "1") {
    console.error("  Debug: ON (verbose logging for all endpoints)");
  }
  const isDefaultPorts = port === DEFAULT_PROXY_CONFIG.port && controlPort === DEFAULT_PROXY_CONFIG.controlPort;
  const instanceId = `${controlPort}`;
  let stopHeartbeat;
  if (!isDefaultPorts) {
    registerInstance({
      sessionId: instanceId,
      port,
      controlPort,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      cwd: process.cwd(),
      provider: state.switched ? state.provider : undefined,
      model: state.switched ? state.model : undefined
    });
    stopHeartbeat = startHeartbeat(instanceId);
  }
  const cleanupTimer = setInterval(cleanupStaleSessions, getCleanupIntervalMs());
  const shutdown = () => {
    console.error(`
[proxy] Shutting down...`);
    if (stopHeartbeat)
      stopHeartbeat();
    if (!isDefaultPorts)
      deregisterInstance(instanceId);
    clearInterval(cleanupTimer);
    resetSwitchState();
    proxy.stop();
    control.stop();
    process.exit(0);
  };
  registerShutdown(shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((error) => {
  console.error("Failed to start proxy server:", error);
  process.exit(1);
});
