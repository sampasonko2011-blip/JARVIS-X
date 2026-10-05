export type BridgeMode = "read" | "write";

export interface BridgeRequest {
  prompt: string;
  mode?: BridgeMode;
  cwd?: string;
  timeoutMs?: number;
}

export interface BridgeResponse {
  ok: boolean;
  text: string;
  provider: string;
  mode: BridgeMode;
  elapsedMs: number;
  error?: string;
}

export interface NativeSessionProvider {
  id: string;
  supports: readonly BridgeMode[];
  execute(request: BridgeRequest): Promise<BridgeResponse>;
}

export interface BridgePolicy {
  maxRounds: number;
  maxPromptChars: number;
  maxOutputChars: number;
  timeoutMs: number;
  allowWrite: boolean;
  allowedExecutables: readonly string[];
}