import { spawn } from "node:child_process";
import { delimiter, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { BridgeMode, BridgePolicy, BridgeRequest, BridgeResponse, NativeSessionProvider } from "./types.js";

const DEFAULT_POLICY: BridgePolicy = {
  maxRounds: 3,
  maxPromptChars: 64 * 1024,
  maxOutputChars: 2 * 1024 * 1024,
  timeoutMs: 10 * 60 * 1000,
  allowWrite: false,
  allowedExecutables: ["claude"],
};

function resolveClaude(): string | null {
  if (process.platform !== "win32") return "claude";
  for (const raw of (process.env.PATH ?? "").split(delimiter)) {
    const dir = raw.replace(/"/g, "");
    if (!dir || !isAbsolute(dir)) continue;
    const candidate = join(dir, "claude.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function sanitize(value: string): string {
  return String(value)
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, "")
    .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[private key block redacted]");
}

export class FrenemySessionProvider implements NativeSessionProvider {
  readonly id = "claude:native-session";
  readonly supports = ["read", "write"] as const;

  constructor(private readonly policy: BridgePolicy = DEFAULT_POLICY) {}

  async execute(request: BridgeRequest): Promise<BridgeResponse> {
    const mode: BridgeMode = request.mode ?? "read";
    const started = performance.now();

    if (!request.prompt.trim()) return this.fail(mode, started, "Prompt is empty.");
    if (request.prompt.length > this.policy.maxPromptChars) return this.fail(mode, started, "Prompt exceeds bridge policy limit.");
    if (mode === "write" && !this.policy.allowWrite) return this.fail(mode, started, "Write mode is disabled by JARVIS-X bridge policy.");

    const command = resolveClaude();
    if (!command || !this.policy.allowedExecutables.includes(command === "claude" ? "claude" : command)) {
      return this.fail(mode, started, "Claude executable is not allowed or not resolvable.");
    }

    const args = ["-p", "--output-format", "json"];
    if (mode === "write") {
      args.push("--permission-mode", "acceptEdits", "--setting-sources", "user");
    }

    const cwd = request.cwd ?? process.cwd();
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = request.timeoutMs ?? this.policy.timeoutMs;

      const finish = (result: BridgeResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(this.fail(mode, started, `Claude timed out after ${Math.round(timeout / 1000)}s.`));
      }, timeout);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (stdout.length > this.policy.maxOutputChars) {
          child.kill("SIGKILL");
          finish(this.fail(mode, started, "Claude output exceeded JARVIS-X bridge cap."));
        }
      });
      child.stderr.on("data", (chunk: string) => {
        if (stderr.length < this.policy.maxOutputChars) stderr += chunk;
      });
      child.on("error", (error: Error) => finish(this.fail(mode, started, `Failed to launch Claude: ${error.message}`)));
      child.on("close", (code: number | null) => {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error) finish(this.fail(mode, started, parsed.result || `Claude exited with error code ${code}.`));
          else {
            const text = sanitize(parsed.result ?? "");
            if (text.length > this.policy.maxOutputChars) finish(this.fail(mode, started, "Sanitized Claude output exceeded JARVIS-X bridge cap."));
            else finish({ ok: true, text, provider: this.id, mode, elapsedMs: performance.now() - started });
          }
        } catch {
          finish(this.fail(mode, started, `Claude returned no usable JSON. ${stderr || stdout}`.trim()));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.write(request.prompt);
      child.stdin.end();
    });
  }

  private fail(mode: BridgeMode, started: number, error: string): BridgeResponse {
    return { ok: false, text: "", provider: this.id, mode, elapsedMs: performance.now() - started, error };
  }
}
