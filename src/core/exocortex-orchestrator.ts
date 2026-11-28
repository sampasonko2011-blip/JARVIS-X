export type LockInView = "VOICE" | "PERCEPTION" | "AI_BUILDER" | "MEMORY" | "CHAT" | "HQ_GRID";
export type LockInAmbience = "NORMAL" | "FOCUS_40HZ" | "SUNSET";
export type LockInState = "IDLE" | "PLANNING" | "CRITIQUING" | "RUNNING" | "STOPPED" | "COMPLETED" | "FAILED";

export interface LockInStep {
  id: string;
  label: string;
  view: LockInView;
  /** Describes a proposed critical operation; this orchestrator never executes it. */
  requiresL3?: boolean;
}
export interface LockInPlan {
  mission: string;
  steps: LockInStep[];
  rationale?: string;
}
export interface LockInCritique {
  approved: boolean;
  findings: string[];
}
export interface LockInUI {
  setAmbience(mode: LockInAmbience): void;
  openIsolatedView(view: LockInView): void;
  logStep(message: string): void;
}
export interface ExocortexAdapters {
  plan(mission: string, options: { signal: AbortSignal }): Promise<LockInPlan>;
  critique(plan: LockInPlan, options: { signal: AbortSignal }): Promise<LockInCritique>;
}
export interface LockInResult {
  status: "LOCK_IN_READY" | "ABORTED" | "REJECTED_BY_SABOTEUR";
  plan?: LockInPlan;
  findings?: string[];
}

function assertMission(mission: string): void {
  if (typeof mission !== "string" || !mission.trim() || mission.length > 2_000) {
    throw new TypeError("LOCK_IN_MISSION_INVALID");
  }
}
function validatePlan(plan: LockInPlan): void {
  if (!plan || typeof plan.mission !== "string" || !Array.isArray(plan.steps) || plan.steps.length > 24) {
    throw new Error("LOCK_IN_PLAN_INVALID");
  }
  const ids = new Set<string>();
  const views = new Set<LockInView>(["VOICE", "PERCEPTION", "AI_BUILDER", "MEMORY", "CHAT", "HQ_GRID"]);
  for (const step of plan.steps) {
    if (!step || typeof step.id !== "string" || !step.id || ids.has(step.id) ||
        typeof step.label !== "string" || !step.label || !views.has(step.view)) {
      throw new Error("LOCK_IN_STEP_INVALID");
    }
    ids.add(step.id);
  }
}

/**
 * Coordinates a reviewed workspace sequence only. It does not run arbitrary code,
 * mutate external accounts, or apply L3 operations. Those require a separate gate.
 */
export class ExocortexOrchestrator {
  private stateValue: LockInState = "IDLE";
  private activeController: AbortController | null = null;
  private activeUI: LockInUI | null = null;
  private runToken = 0;

  constructor(private readonly adapters: ExocortexAdapters) {}

  get state(): LockInState { return this.stateValue; }
  get isActive(): boolean { return this.activeController !== null; }

  async startLockIn(mission: string, ui: LockInUI): Promise<LockInResult> {
    assertMission(mission);
    if (this.activeController) throw new Error("LOCK_IN_ALREADY_ACTIVE");
    const controller = new AbortController();
    const token = ++this.runToken;
    this.activeController = controller;
    this.activeUI = ui;
    const signal = controller.signal;

    try {
      this.stateValue = "PLANNING";
      ui.setAmbience("FOCUS_40HZ");
      ui.logStep("LOCK IN: préparation de mission.");
      const plan = await this.adapters.plan(mission.trim(), { signal });
      if (signal.aborted) return { status: "ABORTED" };
      validatePlan(plan);

      this.stateValue = "CRITIQUING";
      ui.logStep("LOCK IN: revue indépendante du plan.");
      const critique = await this.adapters.critique(structuredClone(plan), { signal });
      if (signal.aborted) return { status: "ABORTED" };
      if (!critique || typeof critique.approved !== "boolean" || !Array.isArray(critique.findings)) {
        throw new Error("LOCK_IN_CRITIQUE_INVALID");
      }
      if (!critique.approved) {
        ui.logStep("LOCK IN bloqué par la revue critique.");
        return { status: "REJECTED_BY_SABOTEUR", findings: critique.findings.map(String) };
      }

      this.stateValue = "RUNNING";
      for (const step of plan.steps) {
        if (signal.aborted) return { status: "ABORTED" };
        ui.openIsolatedView(step.view);
        ui.logStep("Étape préparée: " + step.label + (step.requiresL3 ? " · approbation L3 requise" : ""));
      }
      this.stateValue = "COMPLETED";
      return { status: "LOCK_IN_READY", plan: structuredClone(plan) };
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return { status: "ABORTED" };
      this.stateValue = "FAILED";
      throw error;
    } finally {
      if (this.activeController === controller && this.runToken === token) {
        this.activeController = null;
        this.activeUI = null;
        try { ui.setAmbience("NORMAL"); } finally {
          if (this.stateValue !== "STOPPED") ui.logStep("LOCK IN terminé · ambiance NORMAL · contrôle rendu.");
        }
      }
    }
  }

  /** Synchronous emergency stop: aborts work and restores NORMAL before returning. */
  stopLockIn(): void {
    const controller = this.activeController;
    const ui = this.activeUI;
    if (!controller) {
      if (this.stateValue !== "IDLE") this.stateValue = "STOPPED";
      return;
    }
    this.stateValue = "STOPPED";
    this.activeController = null;
    this.activeUI = null;
    this.runToken += 1;
    controller.abort();
    try { ui?.setAmbience("NORMAL"); } finally {
      ui?.logStep("STOP: contrôle rendu immédiatement · ambiance NORMAL.");
    }
  }
}
