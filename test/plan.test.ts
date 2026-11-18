import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { plan, type Config } from "../src/prepare.ts";

const readConfig = (): Config => JSON.parse(readFileSync(new URL("../cuts.json", import.meta.url), "utf8"));

test("nine sources fill 1800 frames with deliberate overlaps", () => {
  const shots = plan(readConfig());
  assert.equal(shots.length, 9);
  assert.equal(shots.at(-1)!.start + shots.at(-1)!.frames, 1800);
  for (let i = 1; i < shots.length; i++) {
    assert.equal(shots[i - 1].start + shots[i - 1].frames - shots[i].start, shots[i].dissolveFrames);
  }
});

test("beats are relative to the music source and snap nearby cuts only", () => {
  const config = readConfig();
  config.music.in = 2;
  config.music.beats = [9.2, 16.5];
  const shots = plan(config);
  assert.equal(shots[1].start, 216);
  assert.equal(shots[2].start, 420);
});

test("ramp integrates its initial and final rates over the source interval", () => {
  const config = readConfig();
  config.cuts[0].speed = [0.5, 2];
  const [shot] = plan(config);
  assert.ok(Math.abs(shot.sourceDuration * 1.25 - shot.frames / 30) < 1e-9);
});

test("rejects non-ascending cuts and missing engine tracks", () => {
  const config = readConfig();
  config.cuts[1].at = 0;
  assert.throws(() => plan(config), /ordem/);
  config.engine = [];
  assert.throws(() => plan(config), /gravação real/);
});
