/**
 * Shared CLI color helpers and output formatters
 *
 * Eliminates 24+ duplicate color definitions across CLI commands.
 */

export interface Colors {
  reset: string;
  bold: string;
  dim: string;
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  blue: string;
  magenta: string;
}

export interface Formatters {
  c: Colors;
  ok: (text: string) => string;
  fail: (text: string) => string;
  warn: (text: string) => string;
  header: (text: string) => string;
  subheader: (text: string) => string;
  dimText: (text: string) => string;
}

/**
 * Create color codes and formatter functions.
 * Respects TTY detection — returns empty strings when output is not a terminal.
 */
export function createFormatters(useColor?: boolean): Formatters {
  const colored = useColor ?? (process.stdout.isTTY !== false);

  const c: Colors = {
    reset: colored ? "\x1b[0m" : "",
    bold: colored ? "\x1b[1m" : "",
    dim: colored ? "\x1b[2m" : "",
    green: colored ? "\x1b[32m" : "",
    red: colored ? "\x1b[31m" : "",
    yellow: colored ? "\x1b[33m" : "",
    cyan: colored ? "\x1b[36m" : "",
    blue: colored ? "\x1b[34m" : "",
    magenta: colored ? "\x1b[35m" : "",
  };

  return {
    c,
    ok: (text: string) => `${c.green}✓${c.reset} ${text}`,
    fail: (text: string) => `${c.red}✗${c.reset} ${text}`,
    warn: (text: string) => `${c.yellow}⚠${c.reset} ${text}`,
    header: (text: string) => `\n${c.bold}${text}${c.reset}`,
    subheader: (text: string) => `${c.bold}${text}${c.reset}`,
    dimText: (text: string) => `${c.dim}${text}${c.reset}`,
  };
}
