import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let _isWSL2: boolean | undefined;
let _windowsHome: string | null | undefined;

export function isWSL2(): boolean {
  if (_isWSL2 !== undefined) return _isWSL2;
  try {
    if (process.platform !== "linux") {
      _isWSL2 = false;
      return false;
    }
    if (!existsSync("/proc/version")) {
      _isWSL2 = false;
      return false;
    }
    const version = readFileSync("/proc/version", "utf-8").toLowerCase();
    _isWSL2 = version.includes("microsoft") || version.includes("wsl");
    return _isWSL2;
  } catch {
    _isWSL2 = false;
    return false;
  }
}

export function getWindowsHomePath(): string | null {
  if (_windowsHome !== undefined) return _windowsHome;
  try {
    const raw = execSync('cmd.exe /c "echo %USERPROFILE%"', {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const match = raw.match(/^([A-Z]):\\(.+)$/i);
    if (!match) {
      _windowsHome = null;
      return null;
    }
    const drive = match[1]!.toLowerCase();
    const rest = match[2]!.replace(/\\/g, "/");
    _windowsHome = `/mnt/${drive}/${rest}`;
    return _windowsHome;
  } catch {
    _windowsHome = null;
    return null;
  }
}
