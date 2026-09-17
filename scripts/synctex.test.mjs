import test from "node:test";
import assert from "node:assert/strict";
import { parseSyncTeX, sourceAt } from "../shared/synctex.mjs";

test("SyncTeX records retain pages and lines and convert scaled points", () => {
  const map = parseSyncTeX(
    "Input:1:/temporary/export/main.tex\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\n{1\ng1,9:6553600,13107200\n{2\ng1,22:6553600,19660800",
  );
  assert.ok(Math.abs(map[0].x - 99.6264) < 0.001);
  assert.equal(sourceAt(map, 2, 100, 299).line, 22);
  assert.equal(sourceAt(map, 3, 0, 0), null);
  assert.throws(() => sourceAt(map, 1, NaN, 0));
});

test("SyncTeX can identify a render-only manuscript on Windows paths", () => {
  const map = parseSyncTeX(
    "Input:4:C:\\project\\writeups\\main.render.tex\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\n{1\nh4,17:3276800,6553600:65536,131072,0",
    "main.render.tex",
  );
  assert.equal(map.length, 1);
  assert.equal(map[0].line, 17);
  assert.equal(sourceAt(map, 1, map[0].x, map[0].y).line, 17);
});
