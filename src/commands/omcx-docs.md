# /omcx-docs

Quick documentation generation and updates.

## Instructions

Create or update documentation for code, APIs, or features.

**Use this for:**
- README updates
- JSDoc/TSDoc comments
- API documentation
- Usage examples
- Inline code comments (when needed)

### Documentation Types

| Type | When to Use | Output |
|------|-------------|--------|
| **README** | Project/feature overview | README.md |
| **API Docs** | Function/class documentation | JSDoc/TSDoc in code |
| **Usage** | How to use something | Examples in docs |
| **Inline** | Complex logic explanation | Code comments |

### Workflow

1. **Understand What to Document**
   - What code/feature?
   - Who is the audience?
   - What level of detail?

2. **Gather Context**
   - Read the code
   - Understand the purpose
   - Note important details

3. **Write Documentation**
   - Clear and concise
   - Include examples
   - Follow existing style

4. **Verify**
   - Accuracy of information
   - Examples actually work
   - Consistent formatting

### Documentation Principles

| Principle | Description |
|-----------|-------------|
| **Accurate** | Must reflect actual behavior |
| **Concise** | No fluff, get to the point |
| **Examples** | Show, don't just tell |
| **Maintained** | Update when code changes |

### JSDoc/TSDoc Template

```typescript
/**
 * Brief description of what this does.
 *
 * @param paramName - Description of parameter
 * @returns Description of return value
 *
 * @example
 * ```ts
 * const result = myFunction('input');
 * // result: expected output
 * ```
 */
```

### README Template

```markdown
# Feature Name

Brief description.

## Installation

\`\`\`bash
npm install ...
\`\`\`

## Usage

\`\`\`typescript
import { feature } from 'package';

// Example usage
\`\`\`

## API

### functionName(param)

Description of function.

## License

MIT
```

### Anti-Patterns

- Documenting obvious code (`// increment i` on `i++`)
- Outdated documentation (worse than none)
- Overly verbose explanations
- Duplicating what types already express

### Arguments

`/omcx-docs <target> [type]`

Examples:
- `/omcx-docs src/utils/auth.ts` - Add JSDoc to file
- `/omcx-docs README` - Update project README
- `/omcx-docs api` - Generate API documentation
- `/omcx-docs src/components/Button.tsx usage` - Add usage examples
