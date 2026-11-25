import test from "node:test";
import assert from "node:assert/strict";
import { LwwElementSet, HybridLogicalClock, compareHlc } from "../hq/crdt-lww-set.mjs";

test("HLC orders same-wall events by logical counter then actor", () => {
  assert.ok(compareHlc({wall:1,logical:2,actor:"a"},{wall:1,logical:1,actor:"z"}) > 0);
  assert.ok(compareHlc({wall:1,logical:1,actor:"a"},{wall:1,logical:1,actor:"b"}) < 0);
});
test("concurrent add survives a remove that did not observe its tag", () => {
  const left = new LwwElementSet({actor:"ipad"});
  const right = new LwwElementSet({actor:"web"});
  left.add({id:"note-1",text:"offline edit"});
  right.add({id:"note-1",text:"web edit"});
  const leftState = left.export(), rightState = right.export();
  left.merge(rightState); right.merge(leftState);
  assert.deepEqual(left.values(), right.values());
  assert.equal(left.values().length, 1, "one LWW winner is visible per stable element id");
});
test("observed remove tombstones only tags it has seen", () => {
  const a = new LwwElementSet({actor:"a"});
  a.add({id:"x"});
  const b = new LwwElementSet({actor:"b",state:a.export()});
  b.remove({id:"x"});
  a.add({id:"x",revision:2});
  a.merge(b.export());
  assert.deepEqual(a.values(), [{id:"x",revision:2}]);
});
test("undo emits a compensating operation without deleting history", () => {
  const set = new LwwElementSet({actor:"ipad"});
  set.add({id:"task"});
  assert.equal(set.values().length,1);
  const historyBefore = set.export().history.length;
  set.undo();
  assert.equal(set.values().length,0);
  assert.equal(set.export().history.length,historyBefore+1);
});
test("HLC advances beyond a received remote clock", () => {
  const clock = new HybridLogicalClock("local",{wall:()=>100});
  const next = clock.tick({wall:200,logical:4,actor:"remote"});
  assert.deepEqual(next,{wall:200,logical:5,actor:"local"});
});
