import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../src/prepare.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const media = join(root, "work", "smoke-input");
mkdirSync(media, { recursive: true });
for (const [file, source] of [
  ["a.mp4", "testsrc2=size=320x180:rate=60:duration=4"],
  ["b.mp4", "smptebars=size=320x180:rate=60:duration=4"],
]) {
  const encoding = file.endsWith(".mp4") ? ["-c:v", "libx264", "-pix_fmt", "yuv420p"] : [];
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", source, ...encoding, join(media, file)]);
}
const grade = { contrast: 1.04, saturation: 1.05, gamma: 1 };
const config: Config = {
  videos: ".",
  duration: 3,
  cuts: [
    { file: "a.mp4", in: 0, at: 0, dissolveFrames: 0, speed: [0.5, 1.4], grade },
    { file: "b.mp4", in: 0.1, at: 1.5, dissolveFrames: 12, speed: [1, 1], grade },
  ],
};
const configPath = join(media, "cuts.json");
writeFileSync(configPath, JSON.stringify(config));
execFileSync(process.execPath, ["src/prepare.ts", configPath, "work/smoke-film", "--preview"], {
  cwd: root, stdio: "inherit",
});
