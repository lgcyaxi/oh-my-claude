#!/usr/bin/env node
import { createRequire } from "node:module";
var __defProp = Object.defineProperty;
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
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/statusline/statusline.ts
import { readFileSync as readFileSync17, existsSync as existsSync18, appendFileSync as appendFileSync2, mkdirSync as mkdirSync11 } from "node:fs";
import { join as join19 } from "node:path";
import { platform as platform3, homedir as homedir19 } from "node:os";

// src/statusline/config.ts
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync
} from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

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

// node_modules/zod/v3/helpers/util.js
var util;
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
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
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
var getParsedType = (data) => {
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

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
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
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};

class ZodError extends Error {
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
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

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
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
// node_modules/zod/v3/helpers/parseUtil.js
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
};
var EMPTY_PATH = [];
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
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

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
};
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
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
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

class ZodString extends ZodType {
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
}
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}

class ZodNumber extends ZodType {
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
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodBigInt extends ZodType {
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
}
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};

class ZodBoolean extends ZodType {
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
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodDate extends ZodType {
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
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};

class ZodSymbol extends ZodType {
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
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};

class ZodUndefined extends ZodType {
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
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};

class ZodNull extends ZodType {
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
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};

class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};

class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};

class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};

class ZodVoid extends ZodType {
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
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};

class ZodArray extends ZodType {
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
}
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

class ZodObject extends ZodType {
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
}
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

class ZodUnion extends ZodType {
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
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
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
};

class ZodDiscriminatedUnion extends ZodType {
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

class ZodIntersection extends ZodType {
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
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};

class ZodTuple extends ZodType {
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
}
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

class ZodRecord extends ZodType {
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
}

class ZodMap extends ZodType {
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
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};

class ZodSet extends ZodType {
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
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};

class ZodFunction extends ZodType {
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
}

class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};

class ZodLiteral extends ZodType {
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
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}

class ZodEnum extends ZodType {
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
}
ZodEnum.create = createZodEnum;

class ZodNativeEnum extends ZodType {
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
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};

class ZodPromise extends ZodType {
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
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};

class ZodEffects extends ZodType {
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
}
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
class ZodOptional extends ZodType {
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
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};

class ZodNullable extends ZodType {
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
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};

class ZodDefault extends ZodType {
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
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};

class ZodCatch extends ZodType {
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
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};

class ZodNaN extends ZodType {
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
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");

class ZodBranded extends ZodType {
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
}

class ZodPipeline extends ZodType {
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
}

class ZodReadonly extends ZodType {
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
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
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
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
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
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;
// src/statusline/segments/types.ts
var ALL_SEGMENT_IDS = [
  "model",
  "git",
  "directory",
  "context",
  "session",
  "output-style",
  "memory",
  "mode",
  "proxy",
  "usage",
  "preferences",
  "opencode"
];
var PRESETS = {
  minimal: ["git", "directory"],
  standard: [
    "model",
    "git",
    "directory",
    "context",
    "session",
    "mode",
    "proxy",
    "usage"
  ],
  full: [
    "model",
    "git",
    "directory",
    "context",
    "session",
    "output-style",
    "memory",
    "mode",
    "proxy",
    "usage",
    "preferences",
    "opencode"
  ]
};
var DEFAULT_SEGMENT_ROWS = {
  proxy: 1,
  session: 1,
  model: 1,
  mode: 1,
  git: 2,
  directory: 2,
  context: 2,
  memory: 2,
  preferences: 2,
  "output-style": 2,
  opencode: 3,
  usage: 3
};
var DEFAULT_SEGMENT_POSITIONS = {
  proxy: 1,
  session: 2,
  model: 3,
  mode: 4,
  git: 1,
  directory: 2,
  context: 3,
  memory: 4,
  preferences: 5,
  "output-style": 6,
  opencode: 1,
  usage: 2
};

// src/statusline/config.ts
var SegmentConfigSchema = exports_external.object({
  enabled: exports_external.boolean(),
  position: exports_external.number().int().min(1).max(20),
  row: exports_external.number().int().min(1).max(5).default(1)
});
var StyleConfigSchema = exports_external.object({
  separator: exports_external.string().default(" "),
  brackets: exports_external.boolean().default(true),
  colors: exports_external.boolean().default(true)
});
var StatusLineConfigSchema = exports_external.object({
  enabled: exports_external.boolean().default(true),
  preset: exports_external.enum(["minimal", "standard", "full"]).default("standard"),
  segments: exports_external.object({
    proxy: SegmentConfigSchema.default({
      enabled: true,
      position: 1,
      row: 1
    }),
    session: SegmentConfigSchema.default({
      enabled: true,
      position: 2,
      row: 1
    }),
    model: SegmentConfigSchema.default({
      enabled: true,
      position: 3,
      row: 1
    }),
    mode: SegmentConfigSchema.default({
      enabled: true,
      position: 4,
      row: 1
    }),
    git: SegmentConfigSchema.default({
      enabled: true,
      position: 1,
      row: 2
    }),
    directory: SegmentConfigSchema.default({
      enabled: true,
      position: 2,
      row: 2
    }),
    context: SegmentConfigSchema.default({
      enabled: true,
      position: 3,
      row: 2
    }),
    memory: SegmentConfigSchema.default({
      enabled: false,
      position: 4,
      row: 2
    }),
    preferences: SegmentConfigSchema.default({
      enabled: false,
      position: 5,
      row: 2
    }),
    "output-style": SegmentConfigSchema.default({
      enabled: false,
      position: 6,
      row: 2
    }),
    codex: SegmentConfigSchema.default({
      enabled: false,
      position: 1,
      row: 3
    }),
    opencode: SegmentConfigSchema.default({
      enabled: false,
      position: 2,
      row: 3
    }),
    usage: SegmentConfigSchema.default({
      enabled: false,
      position: 3,
      row: 3
    })
  }).default({}),
  style: StyleConfigSchema.default({})
});
var CONFIG_DIR = join(homedir(), ".config", "oh-my-claude");
var CONFIG_PATH = join(CONFIG_DIR, "statusline.json");
function getDefaultConfig(preset = "standard") {
  const enabledSegments = PRESETS[preset];
  const segments = {};
  for (const id of ALL_SEGMENT_IDS) {
    segments[id] = {
      enabled: enabledSegments.includes(id),
      position: DEFAULT_SEGMENT_POSITIONS[id],
      row: DEFAULT_SEGMENT_ROWS[id]
    };
  }
  return {
    enabled: true,
    preset,
    segments,
    style: {
      separator: " ",
      brackets: true,
      colors: true
    }
  };
}
function loadConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return getDefaultConfig("standard");
    }
    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content);
    const rawSegmentKeys = new Set(parsed.segments ? Object.keys(parsed.segments) : []);
    const hasRowField = parsed.segments ? Object.values(parsed.segments).some((s) => typeof s?.row === "number") : false;
    const validated = StatusLineConfigSchema.parse(parsed);
    return applyPresetToConfig(validated, rawSegmentKeys, hasRowField);
  } catch {
    return getDefaultConfig("standard");
  }
}
function applyPresetToConfig(config, rawSegmentKeys, hasRowField) {
  const presetSegments = PRESETS[config.preset] ?? PRESETS.standard;
  let modified = false;
  if (!hasRowField && rawSegmentKeys.size > 0) {
    for (const id of ALL_SEGMENT_IDS) {
      const wasEnabled = rawSegmentKeys.has(id) ? config.segments[id]?.enabled ?? presetSegments.includes(id) : presetSegments.includes(id);
      config.segments[id] = {
        enabled: wasEnabled,
        position: DEFAULT_SEGMENT_POSITIONS[id],
        row: DEFAULT_SEGMENT_ROWS[id]
      };
    }
    modified = true;
  } else {
    for (const id of ALL_SEGMENT_IDS) {
      if (!rawSegmentKeys.has(id)) {
        config.segments[id] = {
          enabled: presetSegments.includes(id),
          position: DEFAULT_SEGMENT_POSITIONS[id],
          row: DEFAULT_SEGMENT_ROWS[id]
        };
        modified = true;
      }
    }
  }
  if (modified) {
    saveConfig(config);
  }
  return config;
}
function ensureConfigDir() {
  try {
    if (existsSync(CONFIG_DIR)) {
      const stat = statSync(CONFIG_DIR);
      if (!stat.isDirectory()) {
        console.error(`[statusline] Config path exists but is not a directory: ${CONFIG_DIR}`);
        return false;
      }
      return true;
    }
    mkdirSync(CONFIG_DIR, { recursive: true });
    if (!existsSync(CONFIG_DIR)) {
      console.error(`[statusline] Failed to create config directory: ${CONFIG_DIR}`);
      return false;
    }
    return true;
  } catch (error) {
    const isWindows = platform() === "win32";
    console.error(`[statusline] Failed to create config directory: ${CONFIG_DIR}
` + `Error: ${error}
` + (isWindows ? `On Windows, please ensure you have write permissions to: ${homedir()}\\.config\\` : `Please ensure you have write permissions to: ~/.config/`));
    return false;
  }
}
function saveConfig(config) {
  try {
    if (!ensureConfigDir()) {
      return;
    }
    const content = JSON.stringify(config, null, 2);
    writeFileSync(CONFIG_PATH, content, "utf-8");
    if (!existsSync(CONFIG_PATH)) {
      console.error(`[statusline] Config file was not created at: ${CONFIG_PATH}`);
    }
  } catch (error) {
    console.error(`[statusline] Failed to save config to ${CONFIG_PATH}:`, error);
  }
}

// src/statusline/segments/index.ts
import { appendFileSync, existsSync as existsSync16, mkdirSync as mkdirSync9 } from "node:fs";
import { join as join17 } from "node:path";
import { homedir as homedir17 } from "node:os";

// src/shared/utils.ts
function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/statusline/segments/git.ts
import { execSync } from "node:child_process";
var GIT_INDICATORS = {
  dirty: "*",
  staged: "+",
  ahead: "↑",
  behind: "↓",
  clean: ""
};
async function collectGitData(cwd) {
  try {
    const branch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      timeout: 500,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (!branch) {
      return null;
    }
    let status = "";
    try {
      status = execSync("git status --porcelain", {
        cwd,
        encoding: "utf-8",
        timeout: 500,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch {}
    let aheadBehind = "";
    try {
      const tracking = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
        cwd,
        encoding: "utf-8",
        timeout: 500,
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      const [aheadStr, behindStr] = tracking.split(/\s+/);
      const ahead = Number(aheadStr) || 0;
      const behind = Number(behindStr) || 0;
      if (ahead > 0)
        aheadBehind += `${GIT_INDICATORS.ahead}${ahead}`;
      if (behind > 0)
        aheadBehind += `${GIT_INDICATORS.behind}${behind}`;
    } catch {}
    const lines = status.split(`
`).filter((l) => l.trim());
    const hasStaged = lines.some((l) => /^[MADRC]/.test(l));
    const hasUnstaged = lines.some((l) => /^.[MADRC?]/.test(l));
    let indicator = "";
    if (hasStaged)
      indicator += GIT_INDICATORS.staged;
    if (hasUnstaged)
      indicator += GIT_INDICATORS.dirty;
    let color = "good";
    if (hasUnstaged)
      color = "warning";
    if (lines.length > 10)
      color = "critical";
    const primary = `${branch}${indicator}${aheadBehind}`;
    return {
      primary,
      metadata: {
        branch,
        dirty: String(hasUnstaged),
        staged: String(hasStaged)
      },
      color
    };
  } catch {
    return null;
  }
}
function formatGitSegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var gitSegment = {
  id: "git",
  collect: async (context) => collectGitData(context.cwd),
  format: formatGitSegment
};

// src/statusline/segments/directory.ts
import { basename } from "node:path";
async function collectDirectoryData(context) {
  const { cwd } = context;
  if (!cwd) {
    return null;
  }
  const projectName = basename(cwd);
  return {
    primary: projectName,
    metadata: {
      full: cwd,
      project: projectName
    },
    color: "neutral"
  };
}
function formatDirectorySegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var directorySegment = {
  id: "directory",
  collect: collectDirectoryData,
  format: formatDirectorySegment
};

// src/statusline/segments/session.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { homedir as homedir3 } from "node:os";

// src/proxy/auth/claude-usage.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2, platform as platform2 } from "node:os";
import { execSync as execSync2 } from "node:child_process";
var rateLimitedUntil = 0;
function getClaudeOAuthToken() {
  if (platform2() === "darwin") {
    try {
      const user = process.env.USER || "user";
      const output = execSync2(`security find-generic-password -a "${user}" -w -s "Claude Code-credentials"`, {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
      if (output) {
        const creds = JSON.parse(output);
        if (creds.claudeAiOauth?.accessToken) {
          return creds.claudeAiOauth.accessToken;
        }
      }
    } catch {}
  }
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  const credPaths = [
    ...configDir ? [join2(configDir, ".credentials.json")] : [],
    join2(homedir2(), ".claude", ".credentials.json")
  ];
  for (const credPath of credPaths) {
    try {
      if (existsSync2(credPath)) {
        const content = readFileSync2(credPath, "utf-8");
        const creds = JSON.parse(content);
        if (creds.claudeAiOauth?.accessToken) {
          return creds.claudeAiOauth.accessToken;
        }
      }
    } catch {}
  }
  return null;
}
async function fetchClaudeUsage(timeoutMs = 3000) {
  if (Date.now() < rateLimitedUntil)
    return null;
  const token = getClaudeOAuthToken();
  if (!token)
    return null;
  try {
    const resp = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/1.0"
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("retry-after") || "60", 10);
      rateLimitedUntil = Date.now() + retryAfter * 1000;
      return null;
    }
    if (!resp.ok)
      return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// src/statusline/segments/session.ts
var USAGE_CACHE_FILE = join3(homedir3(), ".claude", "oh-my-claude", "cache", "api_usage.json");
function readUsageCache() {
  try {
    if (!existsSync3(USAGE_CACHE_FILE)) {
      return null;
    }
    const content = readFileSync3(USAGE_CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function formatUtilization(utilization) {
  const percent = Math.round(utilization * 100);
  return `${percent}%`;
}
var CACHE_STALE_MS = 300000;
async function collectSessionData(_context) {
  let usageData = readUsageCache();
  const isStale = !usageData || Date.now() - usageData.timestamp > CACHE_STALE_MS;
  if (isStale) {
    try {
      const fresh = await fetchClaudeUsage(2000);
      if (fresh?.five_hour) {
        usageData = {
          timestamp: Date.now(),
          five_hour: fresh.five_hour,
          seven_day: fresh.seven_day
        };
        try {
          const cacheDir = join3(homedir3(), ".claude", "oh-my-claude", "cache");
          mkdirSync2(cacheDir, { recursive: true });
          writeFileSync2(USAGE_CACHE_FILE, JSON.stringify(usageData), "utf-8");
        } catch {}
      }
    } catch {}
  }
  if (usageData?.five_hour) {
    const fiveHour = usageData.five_hour.utilization;
    const sevenDay = usageData.seven_day?.utilization || 0;
    let color = "good";
    if (fiveHour > 50 || sevenDay > 50)
      color = "warning";
    if (fiveHour > 80 || sevenDay > 80)
      color = "critical";
    const resetTime = usageData.five_hour.resets_at;
    let resetDisplay = "";
    if (resetTime) {
      try {
        const dt = new Date(resetTime);
        const h = dt.getHours();
        const m = dt.getMinutes();
        resetDisplay = ` R${h}:${m < 10 ? "0" + m : m}`;
      } catch {}
    }
    return {
      primary: formatUtilization(fiveHour / 100),
      secondary: `7d:${formatUtilization(sevenDay / 100)}${resetDisplay}`,
      metadata: {
        fiveHour: String(fiveHour),
        sevenDay: String(sevenDay)
      },
      color
    };
  }
  return {
    primary: "?",
    metadata: {},
    color: "neutral"
  };
}
function formatSessionSegment(data, _config, style) {
  let display = data.primary;
  if (data.secondary) {
    display = `${data.primary} ${data.secondary}`;
  }
  const colored = applyColor(display, data.color, style);
  return wrapBrackets(colored, style);
}
var sessionSegment = {
  id: "session",
  collect: collectSessionData,
  format: formatSessionSegment
};

// src/proxy/state/switch.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, mkdirSync as mkdirSync4 } from "node:fs";
import { join as join4, dirname as dirname2 } from "node:path";
import { homedir as homedir4 } from "node:os";

// src/proxy/state/types.ts
var DEFAULT_PROXY_CONFIG = {
  port: 18910,
  controlPort: 18911,
  enabled: false
};
var DEFAULT_SWITCH_STATE = {
  switched: false
};

// src/shared/fs/file-lock.ts
import {
  openSync,
  closeSync,
  unlinkSync,
  existsSync as existsSync4,
  mkdirSync as mkdirSync3,
  writeFileSync as writeFileSync3,
  renameSync,
  readFileSync as readFileSync4,
  statSync as statSync2,
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
      if (!existsSync4(dir)) {
        mkdirSync3(dir, { recursive: true });
      }
      return openSync(lockPath, "wx");
    } catch (err) {
      const code = err?.code;
      if (code !== "EEXIST") {
        return null;
      }
      try {
        const stat = statSync2(lockPath);
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
  if (!existsSync4(dir)) {
    mkdirSync3(dir, { recursive: true });
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
  writeFileSync3(tmp, text, "utf-8");
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

class JsonCorruptError extends Error {
  path;
  backupPath;
  cause;
  name = "JsonCorruptError";
  constructor(message, path, backupPath, cause) {
    super(message);
    this.path = path;
    this.backupPath = backupPath;
    this.cause = cause;
  }
}
function backupCorruptFile(path) {
  const backupPath = `${path}.corrupt-${Date.now()}.bak`;
  try {
    copyFileSync(path, backupPath);
  } catch {}
  return backupPath;
}
function loadJsonOrBackup(path, schema, opts = {}) {
  if (!existsSync4(path))
    return null;
  let raw;
  try {
    raw = readFileSync4(path, "utf-8");
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Failed to read JSON file at ${path}: ${err.message}`, path, backupPath, err);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Failed to parse JSON at ${path}: ${err.message}`, path, backupPath, err);
  }
  try {
    return schema.parse(parsed);
  } catch (err) {
    const backupPath = backupCorruptFile(path);
    opts.onCorrupt?.(backupPath, err);
    throw new JsonCorruptError(`Schema validation failed for ${path}: ${err.message}`, path, backupPath, err);
  }
}

// src/proxy/state/switch.ts
function getSwitchStatePath() {
  return join4(homedir4(), ".claude", "oh-my-claude", "proxy-switch.json");
}
function readSwitchState() {
  const statePath = getSwitchStatePath();
  try {
    if (!existsSync5(statePath)) {
      return { ...DEFAULT_SWITCH_STATE };
    }
    const content = readFileSync5(statePath, "utf-8");
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

// src/statusline/segments/model.ts
function getControlPort() {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed))
      return parsed;
  }
  return DEFAULT_PROXY_CONFIG.controlPort;
}
function extractSessionId() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl)
    return;
  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return;
  }
}
async function fetchStatusFromControlApi(sessionId) {
  try {
    const controlPort = getControlPort();
    const url = `http://localhost:${controlPort}/status?session=${sessionId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok)
      return null;
    return await resp.json();
  } catch {
    return null;
  }
}
var MODEL_DISPLAY = {
  "claude-opus-4-6-20251101": "Opus 4.6",
  "claude-sonnet-4-6-20251101": "Sonnet 4.6",
  "claude-haiku-4-6-20251101": "Haiku 4.6",
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-sonnet-4-5-20251101": "Sonnet 4.5",
  "claude-haiku-4-5-20251101": "Haiku 4.5",
  "opus-4.6": "Opus 4.6",
  "sonnet-4.6": "Sonnet 4.6",
  "haiku-4.6": "Haiku 4.6",
  "opus-4.5": "Opus 4.5",
  "sonnet-4.5": "Sonnet 4.5",
  "haiku-4.5": "Haiku 4.5",
  "claude-3-opus": "Opus 3",
  "claude-3-sonnet": "Sonnet 3",
  "claude-3-haiku": "Haiku 3",
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-6": "Haiku 4.6"
};
var EXTERNAL_MODEL_DISPLAY = {
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "glm-5.1": "GLM-5.1",
  "glm-5-turbo": "GLM-5 Turbo",
  "glm-5": "GLM-5",
  "GLM-5": "GLM-5",
  "glm-4.7": "GLM-4.7",
  "glm-4.5-air": "GLM-4.5 Air",
  "minimax-m2.7": "MiniMax-M2.7",
  "MiniMax-M2.7": "MiniMax-M2.7",
  "minimax-m2.5": "MiniMax-M2.5",
  "MiniMax-M2.5": "MiniMax-M2.5",
  "kimi-for-coding": "Kimi K2.5",
  "kimi-k2.5": "Kimi K2.5",
  kimi2p5: "Kimi K2.5",
  "k2.5": "Kimi K2.5",
  "K2.5": "Kimi K2.5",
  "qwen3.6-plus": "Qwen 3.6+",
  "qwen3.5-plus": "Qwen 3.5+",
  "qwen3.5": "Qwen 3.5+",
  "qwen3-max-2026-01-23": "Qwen 3 Max",
  "qwen3-coder-next": "Qwen Coder Next",
  "qwen3-coder-plus": "Qwen Coder+",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "o3-mini": "o3-mini",
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 120B",
  "openrouter/nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 120B"
};
function getModelDisplay(modelId, isExternal = false) {
  if (isExternal) {
    if (EXTERNAL_MODEL_DISPLAY[modelId]) {
      return EXTERNAL_MODEL_DISPLAY[modelId];
    }
    const lower2 = modelId.toLowerCase();
    for (const [key, value] of Object.entries(EXTERNAL_MODEL_DISPLAY)) {
      if (key.toLowerCase() === lower2) {
        return value;
      }
    }
    return modelId;
  }
  if (MODEL_DISPLAY[modelId]) {
    return MODEL_DISPLAY[modelId];
  }
  const lower = modelId.toLowerCase();
  if (lower.includes("opus"))
    return "Opus";
  if (lower.includes("sonnet"))
    return "Sonnet";
  if (lower.includes("haiku"))
    return "Haiku";
  return modelId.length > 12 ? modelId.slice(0, 10) + ".." : modelId;
}
function getModelColor(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.includes("opus"))
    return "critical";
  if (lower.includes("sonnet"))
    return "warning";
  if (lower.includes("haiku"))
    return "good";
  return "neutral";
}
async function collectModelData(context) {
  let switchState = null;
  const sessionId = extractSessionId();
  const hasProxySession = !!(sessionId || process.env.OMC_PROXY_CONTROL_PORT);
  try {
    if (sessionId) {
      switchState = await fetchStatusFromControlApi(sessionId);
    }
    if (!switchState && hasProxySession) {
      switchState = readSwitchState();
    }
  } catch {}
  if (switchState?.switched && switchState.provider && switchState.model) {
    const display2 = `→${getModelDisplay(switchState.model, true)}`;
    return {
      primary: display2,
      metadata: {
        modelId: switchState.model,
        displayName: switchState.model.startsWith(`${switchState.provider}/`) ? switchState.model : `${switchState.provider}/${switchState.model}`,
        proxySwitched: "true"
      },
      color: "warning"
    };
  }
  const { claudeCodeInput } = context;
  if (!claudeCodeInput?.model?.id) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral"
    };
  }
  const modelId = claudeCodeInput.model.id;
  const display = getModelDisplay(modelId, false);
  const color = getModelColor(modelId);
  return {
    primary: display,
    metadata: {
      modelId,
      displayName: display
    },
    color
  };
}
function formatModelSegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var modelSegment = {
  id: "model",
  collect: collectModelData,
  format: formatModelSegment
};

// src/statusline/segments/context.ts
import { existsSync as existsSync6, readFileSync as readFileSync6 } from "node:fs";
var CONTEXT_WINDOWS = {
  "claude-opus-4-7": 1e6,
  "claude-sonnet-4-7": 200000,
  "claude-haiku-4-7": 200000,
  "claude-opus-4-6": 1e6,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-6": 200000,
  "claude-opus-4-5": 200000,
  "claude-sonnet-4-5": 200000,
  "claude-haiku-4-5": 200000,
  "claude-3-opus": 200000,
  "claude-3-sonnet": 200000,
  "claude-3-haiku": 200000,
  "deepseek-v4-pro": 1e6,
  "deepseek-v4-flash": 1e6,
  deepseek: 1e6,
  "glm-5.1": 200000,
  "glm-5-turbo": 128000,
  "glm-5": 200000,
  "glm-4.6": 200000,
  "glm-4.5-air": 128000,
  "glm-4.5": 128000,
  "glm-4": 128000,
  minimax: 204800,
  kimi: 256000,
  "qwen3.6": 1e6,
  "qwen3.5": 1e6,
  "qwen3-coder": 128000,
  "qwen3-max": 128000,
  "gpt-5.3-codex": 200000,
  "gpt-5": 128000,
  "o3-mini": 200000,
  default: 200000
};
function normalizeUsage(raw) {
  const input = raw.input_tokens ?? raw.prompt_tokens ?? 0;
  const output = raw.output_tokens ?? raw.completion_tokens ?? 0;
  const cacheRead = raw.cache_read_input_tokens ?? raw.cached_tokens ?? 0;
  const cacheCreate = raw.cache_creation_input_tokens ?? 0;
  const total = input + output + cacheRead + cacheCreate;
  const finalTotal = total > 0 ? total : raw.total_tokens ?? 0;
  return { input, output, cacheRead, cacheCreate, total: finalTotal };
}
function parseTranscriptTail(transcriptPath) {
  try {
    if (!existsSync6(transcriptPath)) {
      return null;
    }
    const content = readFileSync6(transcriptPath, "utf-8");
    const lines = content.trim().split(`
`).filter(Boolean);
    for (let i = lines.length - 1;i >= 0; i--) {
      try {
        const line = lines[i];
        if (!line)
          continue;
        const entry = JSON.parse(line);
        if (entry.summary !== undefined) {
          continue;
        }
        if (entry.type === "assistant" && entry.message?.usage) {
          return {
            usage: entry.message.usage,
            model: entry.message.model
          };
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}
function parseContextSuffix(modelId) {
  const match = modelId.match(/\[(\d+(?:\.\d+)?)(k|m)\]/i);
  if (!match?.[1] || !match[2])
    return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return unit === "m" ? value * 1e6 : value * 1000;
}
function getContextLimit(modelId) {
  const fromSuffix = parseContextSuffix(modelId);
  if (fromSuffix)
    return fromSuffix;
  const lower = modelId.toLowerCase();
  for (const [pattern, limit] of Object.entries(CONTEXT_WINDOWS)) {
    if (pattern !== "default" && lower.includes(pattern)) {
      return limit;
    }
  }
  return CONTEXT_WINDOWS.default ?? 200000;
}
function formatTokens(count) {
  if (count >= 1e6) {
    return `${(count / 1e6).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 1000)}k`;
  }
  return String(count);
}
function getControlPort2() {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed))
      return parsed;
  }
  return DEFAULT_PROXY_CONFIG.controlPort;
}
function extractSessionId2() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl)
    return;
  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return;
  }
}
async function fetchStatusFromControlApi2(sessionId) {
  try {
    const controlPort = getControlPort2();
    const url = `http://localhost:${controlPort}/status?session=${sessionId}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok)
      return null;
    return await resp.json();
  } catch {
    return null;
  }
}
async function resolveSwitchedModelId() {
  try {
    const sessionId = extractSessionId2();
    const hasProxySession = !!(sessionId || process.env.OMC_PROXY_CONTROL_PORT);
    let switchState = null;
    if (sessionId) {
      switchState = await fetchStatusFromControlApi2(sessionId);
    }
    if (!switchState && hasProxySession) {
      switchState = readSwitchState();
    }
    if (switchState?.switched && switchState.model) {
      return switchState.model;
    }
  } catch {}
  return null;
}
async function collectContextData(context) {
  const { claudeCodeInput } = context;
  if (!claudeCodeInput?.transcript_path) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral"
    };
  }
  const tail = parseTranscriptTail(claudeCodeInput.transcript_path);
  if (!tail) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral"
    };
  }
  const usage = normalizeUsage(tail.usage);
  if (usage.total === 0) {
    return {
      primary: "0",
      metadata: { total: "0" },
      color: "good"
    };
  }
  const claudeModelId = claudeCodeInput.model?.id;
  const transcriptModelId = tail.model;
  const switchedModelId = transcriptModelId ? null : await resolveSwitchedModelId();
  const modelId = transcriptModelId ?? switchedModelId ?? claudeModelId ?? "default";
  const modelSource = transcriptModelId ? "transcript" : switchedModelId ? "switch-state" : claudeModelId ? "stdin" : "default";
  const contextLimit = getContextLimit(modelId);
  const percentage = Math.round(usage.total / contextLimit * 100);
  let color = "good";
  if (percentage > 50)
    color = "warning";
  if (percentage > 80)
    color = "critical";
  const primary = `${percentage}%`;
  const secondary = `${formatTokens(usage.total)}/${formatTokens(contextLimit)}`;
  return {
    primary,
    secondary,
    metadata: {
      inputTokens: String(usage.input),
      outputTokens: String(usage.output),
      cacheReadTokens: String(usage.cacheRead),
      cacheCreateTokens: String(usage.cacheCreate),
      totalTokens: String(usage.total),
      contextLimit: String(contextLimit),
      percentage: String(percentage),
      modelId,
      modelSource,
      claudeModelId: claudeModelId ?? ""
    },
    color
  };
}
function formatContextSegment(data, _config, style) {
  let display = data.primary;
  if (data.secondary) {
    display = `${data.primary} ${data.secondary}`;
  }
  const colored = applyColor(display, data.color, style);
  return wrapBrackets(colored, style);
}
var contextSegment = {
  id: "context",
  collect: collectContextData,
  format: formatContextSegment
};

// src/statusline/segments/output-style.ts
var STYLE_ABBREV = {
  normal: "normal",
  concise: "concise",
  explanatory: "explain",
  formal: "formal",
  "engineer-professional": "eng-pro",
  agent: "agent",
  "concise-coder": "coder",
  teaching: "teach",
  review: "review",
  "code-focused": "code",
  documentation: "docs",
  plan: "plan"
};
function getStyleAbbrev(styleName) {
  const lower = styleName.toLowerCase();
  if (STYLE_ABBREV[lower]) {
    return STYLE_ABBREV[lower];
  }
  for (const [key, abbrev] of Object.entries(STYLE_ABBREV)) {
    if (lower.includes(key)) {
      return abbrev;
    }
  }
  return styleName.length > 8 ? styleName.slice(0, 6) + ".." : styleName;
}
async function collectOutputStyleData(context) {
  const { claudeCodeInput } = context;
  if (!claudeCodeInput?.output_style?.name) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral"
    };
  }
  const styleName = claudeCodeInput.output_style.name;
  const display = getStyleAbbrev(styleName);
  let color = "neutral";
  const lower = styleName.toLowerCase();
  if (lower.includes("plan")) {
    color = "warning";
  } else if (lower.includes("concise") || lower.includes("code") || lower.includes("agent")) {
    color = "good";
  }
  return {
    primary: display,
    metadata: {
      styleName
    },
    color
  };
}
function formatOutputStyleSegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var outputStyleSegment = {
  id: "output-style",
  collect: collectOutputStyleData,
  format: formatOutputStyleSegment
};

// src/statusline/segments/memory.ts
import { existsSync as existsSync8, readFileSync as readFileSync8 } from "node:fs";
import { join as join8 } from "node:path";
import { homedir as homedir8 } from "node:os";

// src/memory/store.ts
import {
  existsSync as existsSync7,
  readFileSync as readFileSync7,
  writeFileSync as writeFileSync4,
  readdirSync,
  unlinkSync as unlinkSync2,
  mkdirSync as mkdirSync5,
  statSync as statSync3
} from "node:fs";
import { join as join5, dirname as dirname3 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { cwd } from "node:process";
function findProjectRoot(fromDir) {
  let dir = fromDir ?? cwd();
  const root = dirname3(dir);
  while (dir !== root) {
    if (existsSync7(join5(dir, ".git"))) {
      return dir;
    }
    const parent = dirname3(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  if (existsSync7(join5(dir, ".git"))) {
    return dir;
  }
  return null;
}
function getMemoryDir() {
  return join5(homedir5(), ".claude", "oh-my-claude", "memory");
}
function getProjectMemoryDir(projectRoot) {
  const root = projectRoot ?? findProjectRoot();
  if (!root)
    return null;
  return join5(root, ".claude", "mem");
}
function getTypeDir(baseDir, type) {
  const subdir = type === "session" ? "sessions" : "notes";
  return join5(baseDir, subdir);
}
function getMemoryStats(projectRoot) {
  const projectDir = getProjectMemoryDir(projectRoot);
  const stats = {
    total: 0,
    byType: { session: 0, note: 0 },
    byScope: { project: 0, global: 0 },
    totalSizeBytes: 0,
    storagePath: getMemoryDir(),
    projectPath: projectDir ?? undefined
  };
  const globalDir = getMemoryDir();
  for (const type of ["session", "note"]) {
    const dir = getTypeDir(globalDir, type);
    if (!existsSync7(dir))
      continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    stats.byType[type] += files.length;
    stats.byScope.global += files.length;
    stats.total += files.length;
    for (const file of files) {
      try {
        const st = statSync3(join5(dir, file));
        stats.totalSizeBytes += st.size;
      } catch {}
    }
  }
  if (projectDir && existsSync7(projectDir)) {
    for (const type of ["session", "note"]) {
      const dir = getTypeDir(projectDir, type);
      if (!existsSync7(dir))
        continue;
      const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      stats.byType[type] += files.length;
      stats.byScope.project += files.length;
      stats.total += files.length;
      for (const file of files) {
        try {
          const st = statSync3(join5(dir, file));
          stats.totalSizeBytes += st.size;
        } catch {}
      }
    }
  }
  return stats;
}
// src/memory/ai-ops-shared.ts
var BOILERPLATE_TAGS = new Set([
  "auto-capture",
  "session-end",
  "context-threshold"
]);
// src/memory/timeline.ts
var NOISE_TAGS = new Set([
  "auto-capture",
  "session-end",
  "context-threshold",
  "auto-extract",
  "completion"
]);
// src/memory/hooks/paths.ts
import { join as join6 } from "node:path";
import { homedir as homedir6 } from "node:os";
var STATE_DIR = join6(homedir6(), ".claude", "oh-my-claude", "state");
// src/memory/hooks/session.ts
import { join as join7 } from "node:path";
import { homedir as homedir7 } from "node:os";
var STATE_DIR2 = join7(homedir7(), ".claude", "oh-my-claude", "state");
var corruptStatePaths = new Set;
// src/statusline/segments/memory.ts
function findProjectRoot2(cwd2) {
  let dir = cwd2;
  while (true) {
    if (existsSync8(join8(dir, ".git"))) {
      return dir;
    }
    const parent = join8(dir, "..");
    if (parent === dir)
      break;
    dir = parent;
  }
  return null;
}
function readTokenStats() {
  try {
    const statsPath = join8(homedir8(), ".claude", "oh-my-claude", "memory", "token-stats.json");
    if (!existsSync8(statsPath))
      return null;
    const raw = readFileSync8(statsPath, "utf-8");
    const data = JSON.parse(raw);
    if (typeof data.embeddingCalls === "number" && typeof data.searchQueries === "number") {
      return {
        embeddingCalls: data.embeddingCalls,
        searchQueries: data.searchQueries
      };
    }
    return null;
  } catch {
    return null;
  }
}
var MEMORY_PROVIDER_SHORT = {
  zhipu: "ZP",
  minimax: "MM",
  "minimax-cn": "MM",
  deepseek: "DS",
  kimi: "Kimi",
  aliyun: "Qwen",
  anthropic: "Claude",
  openai: "OAI"
};
async function fetchMemoryModelLabel() {
  try {
    const controlPort = process.env.OMC_CONTROL_PORT || process.env.OMC_PROXY_CONTROL_PORT || "18911";
    const resp = await fetch(`http://localhost:${controlPort}/internal/memory-config`, { signal: AbortSignal.timeout(300) });
    if (!resp.ok)
      return null;
    const data = await resp.json();
    const provider = data.resolvedProvider ?? data.provider;
    if (!provider)
      return null;
    return MEMORY_PROVIDER_SHORT[provider] ?? provider;
  } catch {
    return null;
  }
}
async function collectMemoryData(context) {
  try {
    const projectRoot = findProjectRoot2(context.cwd) ?? undefined;
    const stats = getMemoryStats(projectRoot);
    const { project, global: glob } = stats.byScope;
    let display;
    if (project > 0 && glob > 0) {
      display = `mem:${project}P/${glob}G`;
    } else if (project > 0) {
      display = `mem:${project}P`;
    } else if (glob > 0) {
      display = `mem:${glob}G`;
    } else {
      display = "mem:0";
    }
    const tokenStats = readTokenStats();
    if (tokenStats && (tokenStats.embeddingCalls > 0 || tokenStats.searchQueries > 0)) {
      display += ` tk:${tokenStats.embeddingCalls}/${tokenStats.searchQueries}`;
    }
    const memModelLabel = await fetchMemoryModelLabel();
    if (memModelLabel) {
      display += ` →${memModelLabel}`;
    }
    return {
      primary: display,
      metadata: {
        total: String(stats.total),
        project: String(project),
        global: String(glob),
        notes: String(stats.byType.note),
        sessions: String(stats.byType.session)
      },
      color: stats.total > 0 ? "good" : "neutral"
    };
  } catch {
    return null;
  }
}
function formatMemorySegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var memorySegment = {
  id: "memory",
  collect: collectMemoryData,
  format: formatMemorySegment
};

// src/statusline/segments/mode.ts
import { readFileSync as readFileSync9, existsSync as existsSync9 } from "node:fs";
import { join as join9 } from "node:path";
import { homedir as homedir9 } from "node:os";
function extractSessionId3() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl)
    return;
  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return;
  }
}
function readModeState(sessionId) {
  try {
    const modePath = join9(homedir9(), ".claude", "oh-my-claude", "sessions", sessionId, "mode.json");
    if (!existsSync9(modePath))
      return null;
    const content = readFileSync9(modePath, "utf-8");
    const state = JSON.parse(content);
    return {
      ulw: !!state.ulw
    };
  } catch {
    return null;
  }
}
async function collectModeData(_context) {
  try {
    const sessionId = extractSessionId3();
    if (!sessionId)
      return null;
    const state = readModeState(sessionId);
    if (!state)
      return null;
    const { ulw } = state;
    if (!ulw)
      return null;
    return {
      primary: "⚡ ULW",
      metadata: {},
      color: "critical"
    };
  } catch {
    return null;
  }
}
function formatModeSegment(data, _config, style) {
  return applyColor(data.primary, data.color, style);
}
var modeSegment = {
  id: "mode",
  collect: collectModeData,
  format: formatModeSegment
};

// src/statusline/segments/proxy.ts
function getControlPort4() {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed))
      return parsed;
  }
  return DEFAULT_PROXY_CONFIG.controlPort;
}
var PROVIDER_DISPLAY = {
  deepseek: "DeepSeek",
  zhipu: "ZhiPu",
  zai: "Z.AI",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax CN",
  kimi: "Kimi",
  openai: "OpenAI",
  aliyun: "Aliyun"
};
function extractSessionId4() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl)
    return;
  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return;
  }
}
async function fetchStatusFromControlApi3(sessionId) {
  try {
    const controlPort = getControlPort4();
    const url = sessionId ? `http://localhost:${controlPort}/status?session=${sessionId}` : `http://localhost:${controlPort}/status`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok)
      return null;
    return await resp.json();
  } catch {
    return null;
  }
}
function isAutoSpawnedProxy() {
  try {
    const { existsSync: existsSync10, readFileSync: readFileSync10, readdirSync: readdirSync2 } = __require("node:fs");
    const { join: join10 } = __require("node:path");
    const { homedir: homedir10 } = __require("node:os");
    const sessionsDir = join10(homedir10(), ".claude", "oh-my-claude", "sessions");
    if (!existsSync10(sessionsDir))
      return false;
    for (const entry of readdirSync2(sessionsDir)) {
      const autoProxyFile = join10(sessionsDir, entry, "auto-proxy.json");
      if (existsSync10(autoProxyFile)) {
        const data = JSON.parse(readFileSync10(autoProxyFile, "utf-8"));
        if (data.autoSpawned && data.pid) {
          try {
            process.kill(data.pid, 0);
            return true;
          } catch {}
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}
async function collectProxyData(_context) {
  try {
    const sessionId = extractSessionId4();
    const hasProxySession = !!(sessionId || process.env.OMC_PROXY_CONTROL_PORT);
    let state = null;
    if (sessionId) {
      state = await fetchStatusFromControlApi3(sessionId);
    }
    if (!state && hasProxySession) {
      state = readSwitchState();
    }
    const isSwitched = state?.switched ?? false;
    if (!isSwitched && !sessionId) {
      if (isAutoSpawnedProxy()) {
        return {
          primary: "proxy:mem",
          metadata: { mode: "memory-only" },
          color: "neutral"
        };
      }
      return null;
    }
    if (sessionId) {
      if (isSwitched && state?.provider) {
        const providerLabel = PROVIDER_DISPLAY[state.provider] ?? state.provider;
        return {
          primary: `s:${sessionId.slice(0, 8)} →${providerLabel}`,
          metadata: {},
          color: "warning"
        };
      }
      return {
        primary: `s:${sessionId.slice(0, 8)} ⇄ proxy`,
        metadata: { wrapped: "true" },
        color: "good"
      };
    }
    return null;
  } catch {
    return null;
  }
}
function formatProxySegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var proxySegment = {
  id: "proxy",
  collect: collectProxyData,
  format: formatProxySegment
};

// src/statusline/segments/usage/types.ts
var FETCH_TIMEOUT_MS = 2000;

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
    const symbol = info.currency === "CNY" ? "¥" : "$";
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

// src/shared/auth/minimax.ts
import { existsSync as existsSync10, readFileSync as readFileSync10 } from "node:fs";
import { join as join10 } from "node:path";
import { homedir as homedir10 } from "node:os";
var CREDS_PATH = join10(homedir10(), ".claude", "oh-my-claude", "minimax-creds.json");
function hasMiniMaxCredential() {
  return existsSync10(CREDS_PATH);
}
function getMiniMaxCredential() {
  if (!existsSync10(CREDS_PATH)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync10(CREDS_PATH, "utf-8"));
    if (creds.cookie && creds.groupId) {
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}

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

// src/shared/auth/kimi.ts
import { existsSync as existsSync11, readFileSync as readFileSync11 } from "node:fs";
import { join as join11 } from "node:path";
import { homedir as homedir11 } from "node:os";
var CREDS_PATH2 = join11(homedir11(), ".claude", "oh-my-claude", "kimi-creds.json");
function hasKimiCredential() {
  return existsSync11(CREDS_PATH2);
}
function getKimiCredential() {
  if (!existsSync11(CREDS_PATH2)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync11(CREDS_PATH2, "utf-8"));
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

// src/shared/auth/aliyun.ts
import { existsSync as existsSync12, readFileSync as readFileSync12 } from "node:fs";
import { join as join12 } from "node:path";
import { homedir as homedir12 } from "node:os";
var CREDS_PATH3 = join12(homedir12(), ".claude", "oh-my-claude", "aliyun-creds.json");
function hasAliyunCredential() {
  return existsSync12(CREDS_PATH3);
}
function getAliyunCredential() {
  if (!existsSync12(CREDS_PATH3)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync12(CREDS_PATH3, "utf-8"));
    if (creds.cookie) {
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}

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

// src/statusline/segments/usage/provider-registry.ts
var PROVIDER_ABBREV = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  kimi: "KM",
  aliyun: "AY"
};
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

// src/statusline/segments/usage/cache.ts
import { existsSync as existsSync13, readFileSync as readFileSync13, writeFileSync as writeFileSync5, mkdirSync as mkdirSync6 } from "node:fs";
import { join as join13 } from "node:path";
import { homedir as homedir13 } from "node:os";
var CACHE_DIR = join13(homedir13(), ".config", "oh-my-claude");
var CACHE_PATH = join13(CACHE_DIR, "usage-cache.json");
var CACHE_TTL_MS = 60000;
var BUILD_HASH = "";
function readCache() {
  try {
    if (!existsSync13(CACHE_PATH))
      return {};
    const content = readFileSync13(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(content);
    const isNewFormat = typeof parsed === "object" && parsed !== null && "data" in parsed;
    const cachedVersion = isNewFormat ? parsed.version : undefined;
    const cacheData = isNewFormat ? parsed.data ?? {} : parsed;
    if (cachedVersion !== BUILD_HASH) {
      writeCache({});
      return {};
    }
    return cacheData;
  } catch {
    return {};
  }
}
function writeCache(cache) {
  try {
    if (!existsSync13(CACHE_DIR)) {
      mkdirSync6(CACHE_DIR, { recursive: true });
    }
    const payload = { version: BUILD_HASH, data: cache };
    writeFileSync5(CACHE_PATH, JSON.stringify(payload), "utf-8");
  } catch {}
}
function isCacheValid(entry) {
  if (!entry)
    return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

// src/statusline/segments/usage/orchestrator.ts
async function withTimeout(fn, ms) {
  try {
    const controller = new AbortController;
    const timer = setTimeout(() => controller.abort(), ms);
    const result = await fn();
    clearTimeout(timer);
    return result;
  } catch {
    return null;
  }
}
async function fetchAllProviders(registry, cache, timeoutMs) {
  const configured = registry.filter((def) => def.isConfigured());
  const parts = new Array(configured.length).fill(null);
  const updatedCache = { ...cache };
  let cacheModified = false;
  const fetchJobs = [];
  for (let i = 0;i < configured.length; i++) {
    const def = configured[i];
    const cached = cache[def.key];
    if (isCacheValid(cached)) {
      parts[i] = {
        abbrev: def.abbrev,
        display: cached.display,
        color: cached.color
      };
    } else {
      fetchJobs.push({ index: i, def });
    }
  }
  if (fetchJobs.length > 0) {
    const results = await Promise.allSettled(fetchJobs.map(({ def }) => withTimeout(() => def.fetch(), timeoutMs)));
    for (let j = 0;j < fetchJobs.length; j++) {
      const { index, def } = fetchJobs[j];
      const outcome = results[j];
      if (outcome.status === "fulfilled" && outcome.value) {
        const result = outcome.value;
        updatedCache[def.key] = result;
        cacheModified = true;
        parts[index] = {
          abbrev: def.abbrev,
          display: result.display,
          color: result.color
        };
      }
    }
  }
  const validParts = parts.filter((p) => p !== null);
  return { parts: validParts, cacheModified, updatedCache };
}

// src/statusline/segments/usage/history.ts
import { existsSync as existsSync14, readFileSync as readFileSync14, writeFileSync as writeFileSync6, mkdirSync as mkdirSync7 } from "node:fs";
import { join as join14 } from "node:path";
import { homedir as homedir14 } from "node:os";
var HISTORY_DIR = join14(homedir14(), ".config", "oh-my-claude");
var HISTORY_PATH = join14(HISTORY_DIR, "usage-history.json");
var MAX_AGE_MS = 48 * 60 * 60 * 1000;
var PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
var TREND_WINDOW_MS = 4 * 60 * 60 * 1000;
function extractNumericValue(display) {
  if (display.includes("/"))
    return null;
  const cleaned = display.replace(/^[¥$€£]/, "").replace(/(req|c|%)$/, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
function recordSnapshots(parts) {
  try {
    const history = readHistory();
    const now = Date.now();
    for (const part of parts) {
      const v = extractNumericValue(part.display);
      history.snapshots.push({ t: now, p: part.abbrev, v });
    }
    if (now - history.lastPruned > PRUNE_INTERVAL_MS) {
      const cutoff = now - MAX_AGE_MS;
      history.snapshots = history.snapshots.filter((s) => s.t > cutoff);
      history.lastPruned = now;
    }
    writeHistory(history);
  } catch {}
}
function readHistory() {
  try {
    if (!existsSync14(HISTORY_PATH))
      return { snapshots: [], lastPruned: 0 };
    const content = readFileSync14(HISTORY_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return { snapshots: [], lastPruned: 0 };
  }
}
function writeHistory(h) {
  try {
    if (!existsSync14(HISTORY_DIR)) {
      mkdirSync7(HISTORY_DIR, { recursive: true });
    }
    writeFileSync6(HISTORY_PATH, JSON.stringify(h), "utf-8");
  } catch {}
}

// src/statusline/segments/usage/index.ts
var PROVIDER_TIMEOUT_MS = 3000;
async function collectUsageData(_context) {
  try {
    const registry = buildProviderRegistry();
    const cache = readCache();
    const { parts, cacheModified, updatedCache } = await fetchAllProviders(registry, cache, PROVIDER_TIMEOUT_MS);
    if (cacheModified) {
      writeCache(updatedCache);
    }
    if (parts.length > 0) {
      recordSnapshots(parts);
    }
    if (parts.length === 0) {
      return null;
    }
    const primary = parts.map((p) => p.display ? `${p.abbrev}:${p.display}` : p.abbrev).join(" | ");
    let overallColor = "good";
    for (const p of parts) {
      if (p.color === "critical") {
        overallColor = "critical";
        break;
      }
      if (p.color === "warning") {
        overallColor = "warning";
      }
    }
    const metadata = {};
    for (const p of parts) {
      metadata[`${p.abbrev}_display`] = p.display;
      metadata[`${p.abbrev}_color`] = p.color;
    }
    return {
      primary,
      metadata,
      color: overallColor
    };
  } catch {
    return null;
  }
}
function formatUsageSegment(data, _config, style) {
  if (!style.colors) {
    return data.primary;
  }
  const coloredParts = [];
  const rawParts = data.primary.split(" | ");
  for (const part of rawParts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) {
      const partColor2 = data.metadata[`${part}_color`];
      if (partColor2 && partColor2 in SEMANTIC_COLORS) {
        const colorCode = SEMANTIC_COLORS[partColor2];
        coloredParts.push(`${colorCode}${part}${SEMANTIC_COLORS.reset}`);
      } else {
        coloredParts.push(`${SEMANTIC_COLORS.neutral}${part}${SEMANTIC_COLORS.reset}`);
      }
      continue;
    }
    const abbrev = part.slice(0, colonIdx);
    const value = part.slice(colonIdx + 1);
    const partColor = data.metadata[`${abbrev}_color`];
    const styledAbbrev = `\x1B[1;37m${abbrev}\x1B[0m`;
    if (partColor && partColor in SEMANTIC_COLORS) {
      const colorCode = SEMANTIC_COLORS[partColor];
      coloredParts.push(`${styledAbbrev}:${colorCode}${value}${SEMANTIC_COLORS.reset}`);
    } else {
      coloredParts.push(`${styledAbbrev}:${SEMANTIC_COLORS.neutral}${value}${SEMANTIC_COLORS.reset}`);
    }
  }
  return coloredParts.join(" | ");
}
var usageSegment = {
  id: "usage",
  collect: collectUsageData,
  format: formatUsageSegment
};

// src/shared/preferences/store.ts
import {
  existsSync as existsSync15,
  mkdirSync as mkdirSync8
} from "node:fs";
import { join as join15, dirname as dirname4 } from "node:path";
import { homedir as homedir15 } from "node:os";
import { cwd as cwd2 } from "node:process";
var PREFERENCES_FILENAME = "preferences.json";
function findProjectRoot3(fromDir) {
  let dir = fromDir ?? cwd2();
  const root = dirname4(dir);
  while (dir !== root) {
    if (existsSync15(join15(dir, ".git"))) {
      return dir;
    }
    const parent = dirname4(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  if (existsSync15(join15(dir, ".git"))) {
    return dir;
  }
  return null;
}
function getGlobalPreferencesDir() {
  return join15(homedir15(), ".claude", "oh-my-claude");
}
function getGlobalPreferencesPath() {
  return join15(getGlobalPreferencesDir(), PREFERENCES_FILENAME);
}
function getProjectPreferencesDir(projectRoot) {
  const root = projectRoot ?? findProjectRoot3();
  if (!root)
    return null;
  return join15(root, ".claude");
}
function getProjectPreferencesPath(projectRoot) {
  const dir = getProjectPreferencesDir(projectRoot);
  if (!dir)
    return null;
  return join15(dir, PREFERENCES_FILENAME);
}
function generatePreferenceId(title, date) {
  const d = date ?? new Date;
  const input = `${title}${d.toISOString()}`;
  let hash = 0;
  for (let i = 0;i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(6, "0").slice(0, 6);
  return `pref-${hex}`;
}
function nowISO2() {
  return new Date().toISOString();
}
var PreferenceJsonSchema = {
  parse(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("preferences.json must be a JSON object");
    }
    const raw = input;
    const store = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        console.error(`[omc preferences] dropping malformed entry "${key}" (expected object)`);
        continue;
      }
      const pref = value;
      if (typeof pref.id !== "string" || typeof pref.title !== "string" || typeof pref.content !== "string" || typeof pref.scope !== "string") {
        console.error(`[omc preferences] dropping malformed entry "${key}" (missing required fields)`);
        continue;
      }
      store[key] = pref;
    }
    return store;
  }
};
function getLockPath(path) {
  return path + ".lock";
}
function readJsonStore(path) {
  try {
    const loaded = loadJsonOrBackup(path, PreferenceJsonSchema, {
      onCorrupt: (backupPath) => {
        console.error(`[omc preferences] ${path} was corrupt; backed up to ${backupPath}. ` + `Starting with empty store for this scope.`);
      }
    });
    return loaded ?? {};
  } catch (err) {
    if (err instanceof JsonCorruptError) {
      return {};
    }
    throw err;
  }
}
function writeJsonStore(path, store) {
  const dir = dirname4(path);
  mkdirSync8(dir, { recursive: true });
  atomicWriteJson(path, store, {
    indent: 2,
    trailingNewline: false,
    mode: 384
  });
}

class PreferenceStore {
  projectRoot;
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  getPathForScope(scope) {
    if (scope === "project") {
      const path = getProjectPreferencesPath(this.projectRoot);
      if (!path)
        throw new Error("No project directory found. Use scope: 'global' or initialize a git repo.");
      return path;
    }
    return getGlobalPreferencesPath();
  }
  getAllStores() {
    const stores = [];
    const globalPath = getGlobalPreferencesPath();
    stores.push({ scope: "global", path: globalPath, store: readJsonStore(globalPath) });
    const projectPath = getProjectPreferencesPath(this.projectRoot);
    if (projectPath) {
      stores.push({ scope: "project", path: projectPath, store: readJsonStore(projectPath) });
    }
    return stores;
  }
  create(input) {
    try {
      const scope = input.scope ?? "global";
      const path = this.getPathForScope(scope);
      return withFileLockSync(getLockPath(path), () => {
        const store = readJsonStore(path);
        const now = nowISO2();
        const baseId = generatePreferenceId(input.title);
        let id = baseId;
        let counter = 1;
        while (store[id]) {
          id = `${baseId}-${counter}`;
          counter++;
        }
        const preference = {
          id,
          title: input.title,
          content: input.content,
          scope,
          autoInject: input.autoInject ?? true,
          trigger: input.trigger ?? {},
          tags: input.tags ?? [],
          createdAt: now,
          updatedAt: now
        };
        store[id] = preference;
        writeJsonStore(path, store);
        return { success: true, data: preference };
      });
    } catch (error) {
      return { success: false, error: `Failed to create preference: ${error}` };
    }
  }
  get(id) {
    try {
      for (const { store } of this.getAllStores()) {
        if (store[id]) {
          return { success: true, data: store[id] };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to read preference: ${error}` };
    }
  }
  resolve(idOrPrefix) {
    const exact = this.get(idOrPrefix);
    if (exact.success)
      return exact;
    const candidates = [];
    for (const { store } of this.getAllStores()) {
      for (const [key, pref] of Object.entries(store)) {
        if (key.startsWith(idOrPrefix))
          candidates.push(pref);
      }
    }
    if (candidates.length === 1)
      return { success: true, data: candidates[0] };
    if (candidates.length === 0)
      return { success: false, error: `No preference matching "${idOrPrefix}"` };
    const ids = candidates.map((p) => p.id).join(", ");
    return { success: false, error: `Ambiguous: ${candidates.length} preferences match "${idOrPrefix}" (${ids}). Be more specific.` };
  }
  update(id, updates) {
    try {
      for (const { path } of this.getAllStores()) {
        const lockPath = getLockPath(path);
        const result = withFileLockSync(lockPath, () => {
          const store = readJsonStore(path);
          if (!store[id])
            return null;
          const existing = store[id];
          const updated = {
            ...existing,
            ...updates,
            updatedAt: nowISO2()
          };
          store[id] = updated;
          writeJsonStore(path, store);
          return updated;
        });
        if (result) {
          return { success: true, data: result };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to update preference: ${error}` };
    }
  }
  delete(id) {
    try {
      for (const { path } of this.getAllStores()) {
        const lockPath = getLockPath(path);
        const found = withFileLockSync(lockPath, () => {
          const store = readJsonStore(path);
          if (!store[id])
            return false;
          delete store[id];
          writeJsonStore(path, store);
          return true;
        });
        if (found) {
          return { success: true };
        }
      }
      return { success: false, error: `Preference "${id}" not found` };
    } catch (error) {
      return { success: false, error: `Failed to delete preference: ${error}` };
    }
  }
  list(options) {
    const allPrefs = [];
    for (const { scope, store } of this.getAllStores()) {
      if (options?.scope && options.scope !== scope)
        continue;
      for (const pref of Object.values(store)) {
        if (options?.autoInject !== undefined && pref.autoInject !== options.autoInject)
          continue;
        if (options?.tags && options.tags.length > 0) {
          const hasMatchingTag = options.tags.some((t) => pref.tags.includes(t));
          if (!hasMatchingTag)
            continue;
        }
        allPrefs.push(pref);
      }
    }
    allPrefs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (options?.limit && options.limit > 0) {
      return allPrefs.slice(0, options.limit);
    }
    return allPrefs;
  }
  match(context) {
    const matches = [];
    const allPrefs = this.list({ autoInject: true });
    const promptLower = context.prompt?.toLowerCase() ?? "";
    const contextKeywords = (context.keywords ?? []).map((k) => k.toLowerCase());
    for (const pref of allPrefs) {
      const trigger = pref.trigger;
      if (trigger.always) {
        matches.push({
          preference: pref,
          score: 1,
          matchedBy: "always"
        });
        continue;
      }
      if (trigger.keywords && trigger.keywords.length > 0) {
        const matched = trigger.keywords.filter((kw) => {
          const kwLower = kw.toLowerCase();
          return promptLower.includes(kwLower) || contextKeywords.includes(kwLower);
        });
        if (matched.length > 0) {
          const score = matched.length / trigger.keywords.length;
          matches.push({
            preference: pref,
            score: Math.min(score, 1),
            matchedBy: "keyword",
            matchedTerms: matched
          });
          continue;
        }
      }
      if (trigger.categories && trigger.categories.length > 0 && context.category) {
        const catLower = context.category.toLowerCase();
        const matched = trigger.categories.filter((c) => c.toLowerCase() === catLower);
        if (matched.length > 0) {
          matches.push({
            preference: pref,
            score: matched.length / trigger.categories.length,
            matchedBy: "category",
            matchedTerms: matched
          });
          continue;
        }
      }
      if (pref.tags.length > 0 && (promptLower || contextKeywords.length > 0)) {
        const matched = pref.tags.filter((tag) => {
          const tagLower = tag.toLowerCase();
          return promptLower.includes(tagLower) || contextKeywords.includes(tagLower);
        });
        if (matched.length > 0) {
          const score = matched.length / pref.tags.length * 0.6;
          matches.push({
            preference: pref,
            score: Math.min(score, 0.6),
            matchedBy: "tag",
            matchedTerms: matched
          });
        }
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
  stats() {
    const globalPath = getGlobalPreferencesPath();
    const projectPath = getProjectPreferencesPath(this.projectRoot);
    const globalStore = readJsonStore(globalPath);
    const projectStore = projectPath ? readJsonStore(projectPath) : {};
    const globalCount = Object.keys(globalStore).length;
    const projectCount = Object.keys(projectStore).length;
    const allPrefs = [...Object.values(globalStore), ...Object.values(projectStore)];
    const autoInjectCount = allPrefs.filter((p) => p.autoInject).length;
    return {
      total: globalCount + projectCount,
      byScope: {
        global: globalCount,
        project: projectCount
      },
      autoInjectCount,
      globalPath,
      projectPath: projectPath ?? undefined,
      sqliteAvailable: false
    };
  }
}

// src/statusline/segments/preferences.ts
var CACHE_TTL_MS2 = 1e4;
var cachedStats = null;
function getPreferenceStats(context) {
  const now = Date.now();
  if (cachedStats && now - cachedStats.timestamp < CACHE_TTL_MS2) {
    return cachedStats;
  }
  try {
    const store = new PreferenceStore(context.cwd);
    const stats = store.stats();
    cachedStats = {
      globalCount: stats.byScope.global,
      projectCount: stats.byScope.project,
      autoInjectCount: stats.autoInjectCount,
      timestamp: now
    };
    return cachedStats;
  } catch {
    return {
      globalCount: 0,
      projectCount: 0,
      autoInjectCount: 0,
      timestamp: now
    };
  }
}
function countToColor(count) {
  if (count <= 0)
    return;
  if (count <= 2)
    return "good";
  if (count <= 5)
    return "warning";
  return "critical";
}
async function collectPreferencesData(context) {
  try {
    const stats = getPreferenceStats(context);
    const total = stats.autoInjectCount;
    if (total === 0)
      return null;
    const parts = [];
    if (stats.globalCount > 0)
      parts.push(`${stats.globalCount}g`);
    if (stats.projectCount > 0)
      parts.push(`${stats.projectCount}p`);
    const breakdown = parts.join("/");
    return {
      primary: `pref:${breakdown}`,
      metadata: {
        count: String(total)
      },
      color: countToColor(total)
    };
  } catch {
    return null;
  }
}
function formatPreferencesSegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var preferencesSegment = {
  id: "preferences",
  collect: collectPreferencesData,
  format: formatPreferencesSegment
};

// src/statusline/segments/opencode.ts
import { readFileSync as readFileSync15 } from "node:fs";
import { join as join16 } from "node:path";
import { homedir as homedir16 } from "node:os";
var STATUS_SIGNAL_PATH = join16(homedir16(), ".claude", "oh-my-claude", "run", "opencode-status.json");
var STALE_THRESHOLDS = {
  starting: 30000,
  thinking: 30000,
  streaming: 30000,
  complete: 5000,
  error: 30000,
  idle: 0
};
function readStatusSignal() {
  try {
    const raw = readFileSync15(STATUS_SIGNAL_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function collectOpenCodeData(_context) {
  const signal = readStatusSignal();
  if (!signal || signal.state === "idle") {
    return null;
  }
  const age = Date.now() - (signal.updatedAt ?? 0);
  const threshold = STALE_THRESHOLDS[signal.state] ?? 30000;
  if (age > threshold) {
    return null;
  }
  let icon;
  let color;
  switch (signal.state) {
    case "starting":
    case "thinking":
    case "streaming":
      icon = "⟳";
      color = "warning";
      break;
    case "complete":
      icon = "✓";
      color = "good";
      break;
    case "error":
      icon = "✗";
      color = "critical";
      break;
    default:
      return null;
  }
  const label = signal.tool ? `OpenCode: ${signal.tool}` : "OpenCode";
  return {
    primary: `${icon} ${label}`,
    metadata: {
      state: signal.state,
      model: signal.model ?? ""
    },
    color
  };
}
function formatOpenCodeSegment(data, _config, style) {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}
var opencodeSegment = {
  id: "opencode",
  collect: collectOpenCodeData,
  format: formatOpenCodeSegment
};

// src/statusline/segments/index.ts
var DEBUG_STATUSLINE = process.env.DEBUG_STATUSLINE === "1";
function logSegmentError(segmentId, error) {
  try {
    const logDir = join17(homedir17(), ".config", "oh-my-claude", "logs");
    if (!existsSync16(logDir)) {
      mkdirSync9(logDir, { recursive: true });
    }
    const logPath = join17(logDir, "statusline-debug.log");
    const timestamp = new Date().toISOString();
    const errorMsg = toErrorMessage(error);
    const logLine = `[${timestamp}] Segment "${segmentId}" failed: ${errorMsg}
`;
    appendFileSync(logPath, logLine);
  } catch {}
}
var segmentRegistry = new Map;
function registerSegment(segment) {
  segmentRegistry.set(segment.id, segment);
}
function getEnabledSegments(config) {
  const enabledIds = Object.entries(config.segments).filter(([_, segConfig]) => segConfig.enabled).sort(([, a], [, b]) => a.row !== b.row ? a.row - b.row : a.position - b.position).map(([id]) => id);
  return enabledIds.map((id) => segmentRegistry.get(id)).filter((seg) => seg !== undefined);
}
async function renderSegments(config, context) {
  if (!config.enabled) {
    return "";
  }
  const segments = getEnabledSegments(config);
  const lineParts = new Map;
  const results = await Promise.allSettled(segments.map((segment) => segment.collect(context).then((data) => ({ segment, data }))));
  for (const result of results) {
    if (result.status !== "fulfilled") {
      if (DEBUG_STATUSLINE) {
        logSegmentError("unknown", result.reason);
      }
      continue;
    }
    const { segment, data } = result.value;
    if (!data)
      continue;
    try {
      const formatted = segment.format(data, config.segments[segment.id], config.style);
      if (formatted) {
        const rowNum = config.segments[segment.id]?.row ?? 1;
        if (!lineParts.has(rowNum))
          lineParts.set(rowNum, []);
        lineParts.get(rowNum).push(formatted);
      }
    } catch (error) {
      if (DEBUG_STATUSLINE) {
        logSegmentError(segment.id, error);
      }
    }
  }
  const sortedLines = [...lineParts.entries()].filter(([_, parts]) => parts.length > 0).sort(([a], [b]) => a - b);
  return sortedLines.map(([_, parts]) => parts.join(config.style.separator)).join(`
`);
}
var SEMANTIC_COLORS = {
  good: "\x1B[32m",
  warning: "\x1B[33m",
  critical: "\x1B[31m",
  neutral: "\x1B[36m",
  reset: "\x1B[0m"
};
function wrapBrackets(text, style) {
  return style.brackets ? `[${text}]` : text;
}
function applyColor(text, color, style) {
  if (!style.colors || !color || color === "reset") {
    return text;
  }
  return `${SEMANTIC_COLORS[color]}${text}${SEMANTIC_COLORS.reset}`;
}
registerSegment(modelSegment);
registerSegment(gitSegment);
registerSegment(directorySegment);
registerSegment(contextSegment);
registerSegment(sessionSegment);
registerSegment(outputStyleSegment);
registerSegment(memorySegment);
registerSegment(modeSegment);
registerSegment(proxySegment);
registerSegment(usageSegment);
registerSegment(preferencesSegment);
registerSegment(opencodeSegment);

// src/statusline/session.ts
import { join as join18 } from "node:path";
import { homedir as homedir18 } from "node:os";
import {
  existsSync as existsSync17,
  mkdirSync as mkdirSync10,
  readdirSync as readdirSync2,
  statSync as statSync4,
  rmSync,
  readFileSync as readFileSync16,
  writeFileSync as writeFileSync7
} from "node:fs";
import { spawnSync } from "node:child_process";
var SESSIONS_DIR = join18(homedir18(), ".claude", "oh-my-claude", "sessions");
var PPID_FILE = join18(homedir18(), ".claude", "oh-my-claude", "current-ppid.txt");
var _sessionId = null;
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function getProcessInfo(pid) {
  if (process.platform === "win32") {
    try {
      const result = spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object @{Name='Name';Expression={$_.ProcessName}}, @{Name='ParentId';Expression={$_.ParentProcessId}} | ConvertTo-Json`
      ], {
        encoding: "utf-8",
        timeout: 5000
      });
      if (result.status !== 0 || !result.stdout) {
        return null;
      }
      const data = JSON.parse(result.stdout.trim());
      if (!data || !data.Name || !data.ParentId) {
        return null;
      }
      return { comm: data.Name, ppid: data.ParentId };
    } catch {
      return null;
    }
  }
  try {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "comm=,ppid="], {
      encoding: "utf-8",
      timeout: 1000
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }
    const output = result.stdout.trim();
    const parts = output.split(/\s+/);
    if (parts.length < 2)
      return null;
    const ppidStr = parts[parts.length - 1] ?? "";
    const comm = parts.slice(0, -1).join(" ");
    const ppid = parseInt(ppidStr, 10);
    if (isNaN(ppid))
      return null;
    return { comm, ppid };
  } catch {
    return null;
  }
}
function findClaudeCodePID() {
  let currentPid = process.ppid;
  const maxDepth = 10;
  for (let i = 0;i < maxDepth; i++) {
    const info = getProcessInfo(currentPid);
    if (!info)
      break;
    const commLower = info.comm.toLowerCase();
    const isClaude = process.platform === "win32" ? commLower === "claude" || commLower === "claude.exe" : commLower === "claude" || commLower.endsWith("/claude");
    if (isClaude) {
      return currentPid;
    }
    const minPid = process.platform === "win32" ? 0 : 1;
    if (info.ppid <= minPid)
      break;
    currentPid = info.ppid;
  }
  return null;
}
function getClaudeCodePPID() {
  const claudePid = findClaudeCodePID();
  if (claudePid !== null) {
    return claudePid;
  }
  try {
    if (existsSync17(PPID_FILE)) {
      const content = readFileSync16(PPID_FILE, "utf-8").trim();
      const parts = content.split(":");
      const pidStr = parts[0] ?? "";
      const timestampStr = parts[1] ?? "";
      const savedPpid = parseInt(pidStr, 10);
      const savedTimestamp = parseInt(timestampStr, 10);
      if (!isNaN(savedPpid) && savedPpid > 0 && isProcessRunning(savedPpid) && Date.now() - savedTimestamp < 30 * 60 * 1000) {
        return savedPpid;
      }
    }
  } catch {}
  return process.ppid;
}
function getSessionId() {
  if (!_sessionId) {
    const ppid = getClaudeCodePPID();
    _sessionId = `pid-${ppid}`;
    cleanupStaleSessions();
  }
  return _sessionId;
}
function ensureSessionDir(sessionId) {
  const id = sessionId ?? getSessionId();
  const sessionDir = join18(SESSIONS_DIR, id);
  if (!existsSync17(sessionDir)) {
    mkdirSync10(sessionDir, { recursive: true });
  }
  return sessionDir;
}
function cleanupStaleSessions(maxAgeMs = 60 * 60 * 1000) {
  if (!existsSync17(SESSIONS_DIR)) {
    return 0;
  }
  const now = Date.now();
  let cleaned = 0;
  try {
    const entries = readdirSync2(SESSIONS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionDir = join18(SESSIONS_DIR, entry.name);
        const dirName = entry.name;
        if (dirName.startsWith("pid-")) {
          const pidStr = dirName.substring(4);
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && pid > 0 && !isProcessRunning(pid)) {
            rmSync(sessionDir, { recursive: true, force: true });
            cleaned++;
            continue;
          }
        }
        const statusPath = join18(sessionDir, "status.json");
        let isStale = false;
        if (existsSync17(statusPath)) {
          const stat = statSync4(statusPath);
          isStale = now - stat.mtimeMs > maxAgeMs;
        } else {
          const stat = statSync4(sessionDir);
          isStale = now - stat.mtimeMs > maxAgeMs;
        }
        if (isStale) {
          rmSync(sessionDir, { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  } catch {}
  return cleaned;
}

// src/statusline/statusline.ts
function loadApiEnvFile() {
  try {
    const envFile = join19(homedir19(), ".zshrc.api");
    if (!existsSync18(envFile))
      return;
    const content = readFileSync17(envFile, "utf-8");
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
loadApiEnvFile();
var DEBUG_STATUSLINE2 = process.env.DEBUG_STATUSLINE === "1";
function debugLog(message) {
  if (!DEBUG_STATUSLINE2)
    return;
  try {
    const logDir = join19(homedir19(), ".config", "oh-my-claude", "logs");
    if (!existsSync18(logDir)) {
      mkdirSync11(logDir, { recursive: true });
    }
    const logPath = join19(logDir, "statusline-debug.log");
    const timestamp = new Date().toISOString();
    appendFileSync2(logPath, `[${timestamp}] ${message}
`);
  } catch {}
}
var TIMEOUT_MS = 8000;
var colors = {
  reset: "\x1B[0m",
  ready: "\x1B[32m"
};
function parseClaudeCodeInput(input) {
  try {
    if (!input || !input.trim()) {
      return;
    }
    const parsed = JSON.parse(input);
    return {
      model: parsed.model,
      output_style: parsed.output_style,
      transcript_path: parsed.transcript_path,
      cost: parsed.cost,
      workspace: parsed.workspace,
      oauth: parsed.oauth
    };
  } catch {
    return;
  }
}
function isWrappedMode() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl)
    return false;
  try {
    const url = new URL(baseUrl);
    return /^\/s\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
function getBrandPrefix() {
  if (process.env.OMC_DEBUG === "1") {
    return "\x1B[1;35momc[debug]\x1B[0m";
  }
  if (isWrappedMode()) {
    return "\x1B[1;35momc\x1B[36m⇄\x1B[0m";
  }
  return "\x1B[1;35momc\x1B[0m";
}
function formatReadyStatus() {
  return `${getBrandPrefix()} ${colors.ready}●${colors.reset} ready`;
}
async function main() {
  const timeoutId = setTimeout(() => {
    console.log(formatReadyStatus());
    process.exit(0);
  }, TIMEOUT_MS);
  try {
    let stdinInput = "";
    try {
      const fd = process.stdin.fd;
      debugLog(`Reading stdin from fd=${fd}, platform=${platform3()}`);
      if (process.stdin.isTTY) {
        debugLog("stdin is TTY - no piped input available");
      } else {
        stdinInput = readFileSync17(fd, "utf-8");
        debugLog(`Read ${stdinInput.length} chars from stdin`);
        if (stdinInput.length > 0) {
          debugLog(`stdin preview: ${stdinInput.slice(0, 200)}...`);
        }
      }
    } catch (error) {
      debugLog(`Failed to read stdin: ${error}`);
    }
    const config = loadConfig();
    if (!config.enabled) {
      console.log("");
      return;
    }
    const claudeCodeInput = parseClaudeCodeInput(stdinInput);
    debugLog(`claudeCodeInput parsed: model=${claudeCodeInput?.model?.id ?? "none"}, style=${claudeCodeInput?.output_style?.name ?? "none"}, transcript=${claudeCodeInput?.transcript_path ?? "none"}`);
    const sessionId = getSessionId();
    const sessionDir = ensureSessionDir(sessionId);
    const context = {
      cwd: process.cwd(),
      sessionDir,
      claudeCodeInput
    };
    const segmentOutput = await renderSegments(config, context);
    if (segmentOutput) {
      const brandPrefix = getBrandPrefix();
      const lines = segmentOutput.split(`
`);
      const branded = lines.map((line, i) => i === 0 ? `${brandPrefix} ${line}` : `    ${line}`).join(`
`);
      console.log(branded);
    } else {
      console.log(formatReadyStatus());
    }
  } catch {
    console.log(formatReadyStatus());
  } finally {
    clearTimeout(timeoutId);
  }
}
main();
