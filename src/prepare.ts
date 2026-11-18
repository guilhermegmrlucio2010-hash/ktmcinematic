import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fps = 30;
const root = fileURLToPath(new URL("../", import.meta.url));
const seconds = (frames: number) => frames / fps;

type Audio = { file: string; in: number; volume: number };
type Engine = Audio & { at: number; duration: number };
type Cut = {
  file: string;
  in: number;
  at: number;
  dissolveFrames: number;
  speed: [number, number];
  grade: { contrast: number; saturation: number; gamma: number };
};
export type Config = {
  videos: string;
  duration: number;
  music: Audio & { beats: number[] };
  engine: Engine[];
  cuts: Cut[];
};

function range(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(label + " deve estar entre " + min + " e " + max);
  }
}

export function plan(config: Config) {
  range(config.duration, 1, 600, "Duração");
  range(config.music.in, 0, 86400, "Entrada da música");
  range(config.music.volume, 0, 1, "Volume da música");
  if (config.engine.length === 0) throw new Error("Configura pelo menos uma gravação real da mota.");
  const total = Math.round(config.duration * fps);
  for (const engine of config.engine) {
    range(engine.at, 0, seconds(total), "Posição do motor");
    range(engine.duration, 0.1, seconds(total) - engine.at, "Duração do motor");
    range(engine.in, 0, 86400, "Entrada do motor");
    range(engine.volume, 0.01, 1, "Volume do motor");
  }
  const beats = config.music.beats.map((beat) => {
    range(beat, 0, 86400, "Batida");
    return Math.round((beat - config.music.in) * fps);
  }).filter((frame) => frame > 0 && frame < total);
  if (config.cuts.length === 0) throw new Error("Configura pelo menos um plano.");
  const starts = config.cuts.map((cut, index) => {
    range(cut.at, 0, seconds(total - 1), "Posição de " + cut.file);
    range(cut.in, 0, 86400, "Entrada de " + cut.file);
    range(cut.speed[0], 0.25, 4, "Velocidade inicial");
    range(cut.speed[1], 0.25, 4, "Velocidade final");
    range(cut.grade.contrast, 0.5, 1.5, "Contraste");
    range(cut.grade.saturation, 0, 2, "Saturação");
    range(cut.grade.gamma, 0.5, 1.5, "Gamma");
    range(cut.dissolveFrames, 0, 60, "Sobreposição");
    if (!Number.isInteger(cut.dissolveFrames)) throw new Error("Usa quadros inteiros na sobreposição.");
    const frame = Math.round(cut.at * fps);
    if (index === 0) {
      if (cut.at !== 0 || cut.dissolveFrames !== 0) throw new Error("O primeiro plano começa em zero.");
      return 0;
    }
    const nearest = beats.reduce((best, beat) =>
      Math.abs(beat - frame) < Math.abs(best - frame) ? beat : best, Infinity);
    return Math.abs(nearest - frame) <= 8 ? nearest : frame;
  });
  return config.cuts.map((cut, index) => {
    const start = starts[index];
    const next = starts[index + 1] ?? total;
    if (next - start <= cut.dissolveFrames) {
      throw new Error("Revê a ordem ou a sobreposição junto de " + cut.file);
    }
    const frames = next - start + (config.cuts[index + 1]?.dissolveFrames ?? 0);
    const [first, last] = cut.speed;
    const sourceDuration = seconds(frames) / ((1 / first + 1 / last) / 2);
    return { ...cut, start, frames, sourceDuration };
  });
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " falhou (" + (result.status ?? result.signal) + ")");
  return result.stdout;
}

function probe(file: string, kind: "v:0" | "a:0") {
  const info = JSON.parse(run("ffprobe", [
    "-v", "error", "-select_streams", kind, "-show_streams", "-show_format", "-of", "json", file,
  ]));
  const stream = info.streams[0];
  if (!stream) throw new Error("Falta a faixa " + kind + " em " + file);
  const duration = Number(stream.duration ?? info.format.duration);
  if (!(duration > 0)) throw new Error("Não foi possível medir a duração de " + file);
  return { duration, fps: fraction(stream.avg_frame_rate) };
}

function fraction(rate?: string) {
  const [numerator, denominator] = (rate ?? "0/1").split("/").map(Number);
  return numerator / denominator;
}

function ffmpeg(args: string[]) {
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args]);
}

function prepare(configPath: string, output: string, preview: boolean) {
  const config: Config = JSON.parse(readFileSync(configPath, "utf8"));
  const cuts = plan(config);
  const duration = seconds(Math.round(config.duration * fps));
  const base = dirname(configPath);
  const width = preview ? 960 : 3840;
  const height = preview ? 540 : 2160;
  const soundtrack = [{ ...config.music, at: 0, duration }, ...config.engine];
  const audioPaths = soundtrack.map((track) => {
    const file = resolve(base, track.file);
    if (probe(file, "a:0").duration + 0.02 < track.in + track.duration) {
      throw new Error("Áudio demasiado curto: " + file);
    }
    return file;
  });
  const media = cuts.map((cut) => {
    const file = resolve(base, config.videos, cut.file);
    const info = probe(file, "v:0");
    if (info.duration + 0.001 < cut.in + cut.sourceDuration) {
      throw new Error("Vídeo demasiado curto: " + file + " requer " + (cut.in + cut.sourceDuration).toFixed(3) + " s");
    }
    if (Math.min(...cut.speed) < 1 && !(info.fps * Math.min(...cut.speed) >= fps - 0.05)) {
      throw new Error("FPS insuficientes para a câmara lenta em " + file + ". Aumenta a velocidade mínima.");
    }
    return file;
  });

  const assets = join(output, "assets");
  mkdirSync(assets, { recursive: true });
  const clips = cuts.map((cut, index) => {
    const id = "shot-" + (index + 1);
    console.log("A preparar " + cut.file + " em " + seconds(cut.start).toFixed(3) + " s");
    const [first, last] = cut.speed;
    const curvature = (1 / last - 1 / first) / (2 * cut.sourceDuration);
    const grade = cut.grade;
    ffmpeg([
      "-ss", String(cut.in), "-i", media[index], "-an", "-vf", [
        "trim=duration=" + cut.sourceDuration,
        "settb=AVTB",
        // setpts takes ticks, while T is measured in seconds.
        "setpts=((T-STARTT)/" + first + "+(" + curvature + ")*(T-STARTT)*(T-STARTT))/TB",
        "fps=" + fps,
        "tpad=stop_mode=clone:stop_duration=0.15",
        "scale=" + width + ":" + height + ":force_original_aspect_ratio=increase:force_divisible_by=2",
        "crop=" + width + ":" + height, "setsar=1",
        "eq=contrast=" + grade.contrast + ":saturation=" + grade.saturation + ":gamma=" + grade.gamma,
      ].join(","),
      "-frames:v", String(cut.frames), "-c:v", "libx264", "-preset", "fast", "-crf", "17",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(assets, id + ".mp4"),
    ]);
    return '<video id="' + id + '" class="clip" muted playsinline src="assets/' + id +
      '.mp4" data-start="' + seconds(cut.start) + '" data-duration="' + seconds(cut.frames) +
      '" data-track-index="' + (index % 2) + '" style="z-index:' + (index + 1) + '"></video>';
  });

  const filters = soundtrack.map((track, i) => {
    const fade = Math.min(i === 0 ? 0.7 : 0.08, track.duration / 3);
    return "[" + i + ":a]atrim=duration=" + track.duration +
      ",asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=" + track.volume +
      ",afade=t=in:d=" + fade + ",afade=t=out:st=" + (track.duration - fade) + ":d=" + fade +
      ",adelay=" + Math.round(track.at * 1000) + ":all=1[a" + i + "]";
  });
  filters.push(soundtrack.map((_, i) => "[a" + i + "]").join("") + "amix=inputs=" + soundtrack.length +
    ":normalize=0:duration=first,alimiter=limit=0.89:level=0:latency=1,apad,atrim=duration=" + duration + "[mix]");
  ffmpeg([
    ...soundtrack.flatMap((track, i) => ["-ss", String(track.in), "-i", audioPaths[i]]),
    "-filter_complex", filters.join(";"), "-map", "[mix]", "-c:a", "pcm_s16le", join(assets, "mix.wav"),
  ]);

  copyFileSync(join(root, "node_modules", "gsap", "dist", "gsap.min.js"), join(assets, "gsap.min.js"));
  const titleDuration = Math.min(4.2, duration);
  const timeline = cuts.flatMap((cut, index) => cut.dissolveFrames ? [
    "tl.fromTo('#shot-" + (index + 1) + "', {opacity:0}, {opacity:1, ease:'sine.inOut', immediateRender:false, duration:" +
    seconds(cut.dissolveFrames) + "}, " + seconds(cut.start) + ");",
  ] : []).join("\n");
  const template = readFileSync(join(root, "composition.html"), "utf8");
  const slots = { width, height, duration, titleDuration, titleExit: titleDuration * 0.73, clips: clips.join("\n"), timeline };
  writeFileSync(join(output, "index.html"), template.replace(/\{\{(\w+)\}\}/g, (_, key: keyof typeof slots) => String(slots[key])));
  console.log("Composição criada em " + join(output, "index.html"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    prepare(resolve(process.argv[2] ?? "cuts.json"), resolve(process.argv[3] ?? "work/film"), process.argv.includes("--preview"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
