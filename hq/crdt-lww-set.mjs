/**
 * Deterministic observed-remove LWW element set with a hybrid logical clock.
 * Concurrent unseen adds survive removes; observed tags are tombstoned.
 */
export function compareHlc(a, b) {
  return (a.wall - b.wall) || (a.logical - b.logical) || String(a.actor).localeCompare(String(b.actor));
}
export class HybridLogicalClock {
  constructor(actor, { wall = () => Date.now() } = {}) {
    if (!actor || typeof actor !== "string") throw new TypeError("CLOCK_ACTOR_REQUIRED");
    this.actor = actor; this.wall = wall; this.lastWall = 0; this.logical = 0;
  }
  tick(remote) {
    const physical = Math.max(0, Number(this.wall()) || 0);
    const remoteWall = Number(remote?.wall) || 0;
    const nextWall = Math.max(physical, this.lastWall, remoteWall);
    if (nextWall === this.lastWall && nextWall === remoteWall) this.logical = Math.max(this.logical, Number(remote?.logical) || 0) + 1;
    else if (nextWall === this.lastWall) this.logical += 1;
    else if (nextWall === remoteWall) this.logical = (Number(remote?.logical) || 0) + 1;
    else this.logical = 0;
    this.lastWall = nextWall;
    return { wall: nextWall, logical: this.logical, actor: this.actor };
  }
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const elementKey = (value) => value && typeof value === "object" && !Array.isArray(value) && value.id !== undefined ? String(value.id) : JSON.stringify(value);
const opKey = (op) => `${op.clock.wall}:${op.clock.logical}:${op.clock.actor}:${op.kind}:${op.tag}`;
export class LwwElementSet {
  constructor({ actor, state } = {}) {
    this.clock = new HybridLogicalClock(actor);
    this.adds = new Map();
    this.removed = new Set();
    this.history = [];
    if (state) this.merge(state);
  }
  add(value) {
    const clock = this.clock.tick();
    const tag = `${clock.actor}:${clock.wall}:${clock.logical}`;
    const op = { kind: "add", tag, key: elementKey(value), value: clone(value), clock };
    this.adds.set(tag, op); this.history.push(clone(op)); return clone(op);
  }
  remove(value) {
    const matching = [...this.adds.values()].filter((op) => !this.removed.has(op.tag) && (op.key ?? elementKey(op.value)) === elementKey(value));
    const clock = this.clock.tick();
    const op = { kind: "remove", tags: matching.map((item) => item.tag).sort(), value: clone(value), clock };
    for (const tag of op.tags) this.removed.add(tag);
    this.history.push(clone(op)); return clone(op);
  }
  merge(state) {
    for (const op of state.adds ?? []) {
      const existing = this.adds.get(op.tag);
      if (!existing || compareHlc(existing.clock, op.clock) < 0) this.adds.set(op.tag, clone(op));
      if (op.clock) this.clock.tick(op.clock);
    }
    for (const tag of state.removed ?? []) this.removed.add(tag);
    this.history = [...new Map([...this.history, ...(state.history ?? [])].map((op) => [opKey(op), clone(op)])).values()]
      .sort((a, b) => compareHlc(a.clock, b.clock) || opKey(a).localeCompare(opKey(b)));
    return this.values();
  }
  values() {
    const visible = [...this.adds.values()].filter((op) => !this.removed.has(op.tag));
    const winners = new Map();
    for (const op of visible) {
      const key = op.key ?? elementKey(op.value), old = winners.get(key);
      if (!old || compareHlc(old.clock, op.clock) < 0) winners.set(key, op);
    }
    return [...winners.values()].sort((a, b) => JSON.stringify(a.value).localeCompare(JSON.stringify(b.value))).map((op) => clone(op.value));
  }
  undo() {
    const last = [...this.history].reverse().find((op) => op.clock.actor === this.clock.actor);
    if (!last) return null;
    if (last.kind === "add") return this.remove(last.value);
    // Undoing a remove creates a new add; old tombstones remain immutable.
    return this.add(last.value);
  }
  export() {
    return { adds: [...this.adds.values()].map(clone), removed: [...this.removed].sort(), history: this.history.map(clone) };
  }
}
