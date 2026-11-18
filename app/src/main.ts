import "@fontsource/figtree/500.css";
import "@fontsource/figtree/700.css";
import "@fontsource/fraunces/600.css";
import "./style.css";

const ROUND_MS = 15_000;
const BEST_KEY = "fifteen.best";
const EDGE = 14;
const TIME_MARKS = [10, 5, 3];
const PEEK_MIN_MS = 860;
const PEEK_MAX_MS = 1020;
const HIDE_MIN_MS = 520;
const HIDE_MAX_MS = 760;
const FIRST_HIDE_MS = 380;

type Phase = "ready" | "playing" | "over";
type Cover = "hidden" | "peek";
type PuffSpec = { x: number; y: number; r: number };
type CloudSpec = { speed: number; phase: number; amp: number; puffs: PuffSpec[] };
type Circle = { cx: number; cy: number; r: number; index: number };

const CLOUDS: readonly CloudSpec[] = [
  {
    speed: 0.32,
    phase: 0.4,
    amp: 14,
    puffs: [
      { x: 0.24, y: 0.34, r: 0.2 },
      { x: 0.35, y: 0.28, r: 0.14 },
      { x: 0.16, y: 0.3, r: 0.13 },
      { x: 0.28, y: 0.22, r: 0.12 },
    ],
  },
  {
    speed: 0.28,
    phase: 2.1,
    amp: 12,
    puffs: [
      { x: 0.76, y: 0.32, r: 0.19 },
      { x: 0.64, y: 0.26, r: 0.14 },
      { x: 0.84, y: 0.28, r: 0.13 },
      { x: 0.72, y: 0.2, r: 0.11 },
    ],
  },
  {
    speed: 0.36,
    phase: 4.2,
    amp: 13,
    puffs: [
      { x: 0.48, y: 0.74, r: 0.2 },
      { x: 0.62, y: 0.7, r: 0.14 },
      { x: 0.36, y: 0.68, r: 0.13 },
      { x: 0.52, y: 0.62, r: 0.12 },
    ],
  },
];

const app = must<HTMLDivElement>("#app");
const arena = must<HTMLDivElement>("#arena");
const target = must<HTMLButtonElement>("#target");
const panel = must<HTMLElement>("#panel");
const timeEl = must<HTMLSpanElement>("#time");
const scoreEl = must<HTMLSpanElement>("#score");
const bar = must<HTMLSpanElement>("#bar");
const kicker = must<HTMLParagraphElement>("#panel-kicker");
const title = must<HTMLHeadingElement>("#panel-title");
const copy = must<HTMLParagraphElement>("#panel-copy");
const result = must<HTMLParagraphElement>("#result");
const resultCount = must<HTMLSpanElement>("#result-count");
const resultCaption = must<HTMLSpanElement>("#result-caption");
const bestLine = must<HTMLParagraphElement>("#best-line");
const action = must<HTMLButtonElement>("#action");
const live = must<HTMLParagraphElement>("#live");
const cloudsRoot = must<HTMLDivElement>("#clouds");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const puffEls: HTMLSpanElement[] = [];
let boardW = 0;
let boardH = 0;

for (const cloud of CLOUDS) {
  const wrap = document.createElement("div");
  wrap.className = "cloud";
  for (let i = 0; i < cloud.puffs.length; i += 1) {
    const puff = document.createElement("span");
    puff.className = "puff";
    wrap.append(puff);
    puffEls.push(puff);
  }
  cloudsRoot.append(wrap);
}

let phase: Phase = "ready";
let cover: Cover = "hidden";
let score = 0;
let startedAt = 0;
let coverUntil = 0;
let frame = 0;
let lastX = Number.NaN;
let lastY = Number.NaN;
let anchorIndex = -1;
let anchorOx = 0;
let anchorOy = 0;
let focusAfterKeys = false;
let acceptHits = false;
const announcedMarks = new Set<number>();
const keysDown = new Set<string>();
let circles: Circle[] = [];

window.addEventListener("keydown", (event) => {
  keysDown.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keysDown.delete(event.key);
  focusTargetIfReady();
});

action.addEventListener("click", () => {
  if (phase === "playing") return;
  startRound();
});

target.addEventListener("click", onHit);

arena.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

new ResizeObserver(() => {
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  if (width === boardW && height === boardH) return;
  boardW = width;
  boardH = height;
  if (phase !== "playing") return;
  const now = performance.now();
  circles = layoutClouds(now);
  if (cover === "peek") {
    if (!placePeek()) beginHide(now, 400);
  } else {
    placeHidden();
  }
}).observe(arena);

showReady();

function startRound(): void {
  score = 0;
  scoreEl.textContent = "0";
  announcedMarks.clear();
  setPhase("playing");
  panel.hidden = true;
  cloudsRoot.hidden = false;
  target.hidden = false;
  lastX = Number.NaN;
  lastY = Number.NaN;
  const now = performance.now();
  circles = layoutClouds(now);
  beginHide(now, FIRST_HIDE_MS);
  startedAt = now;
  renderClock(ROUND_MS);
  live.textContent = "Round started. Hit the mark when it peeks out from a cloud.";
  focusAfterKeys = true;
  acceptHits = false;
  queueMicrotask(() => {
    acceptHits = phase === "playing";
  });
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}

function tick(now: number): void {
  const left = ROUND_MS - (now - startedAt);
  if (left <= 0) {
    renderClock(0);
    finishRound();
    return;
  }
  renderClock(left);
  circles = layoutClouds(now);
  followCloud();
  if (now >= coverUntil) {
    if (cover === "hidden") beginPeek(now);
    else beginHide(now);
  }
  frame = requestAnimationFrame(tick);
}

function onHit(event: Event): void {
  if (phase !== "playing" || !acceptHits || cover !== "peek") return;
  if (event instanceof PointerEvent && event.pointerType !== "") {
    if (event.button !== 0) return;
    const board = arena.getBoundingClientRect();
    const x = event.clientX - board.left;
    const y = event.clientY - board.top;
    if (pointInCloud(x, y)) return;
  }
  event.preventDefault();
  score += 1;
  scoreEl.textContent = String(score);
  live.textContent = score === 1 ? "1 tap." : `${score} taps.`;
  const mark = target.getBoundingClientRect();
  const board = arena.getBoundingClientRect();
  spawnPop(
    mark.left - board.left + mark.width / 2,
    mark.top - board.top + mark.height / 2,
  );
  beginHide(performance.now());
}

function finishRound(): void {
  if (phase !== "playing") return;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  setPhase("over");
  target.hidden = true;
  target.disabled = false;
  cloudsRoot.hidden = true;
  delete app.dataset.cover;
  clearPops();
  renderClock(0);

  const best = readBest();
  let note = "";
  if (score > best && score > 0) {
    writeBest(score);
    note = "New best on this device.";
  } else if (score > 0 && score === best) {
    note = "That matches your best on this device.";
  } else if (best > 0) {
    note = `Best on this device: ${tapCount(best)}.`;
  }

  kicker.textContent = "Round over";
  title.textContent = "Time.";
  copy.hidden = true;
  result.hidden = false;
  resultCount.textContent = String(score);
  resultCaption.textContent =
    score === 1 ? "tap in fifteen seconds" : "taps in fifteen seconds";
  bestLine.textContent = note;
  action.textContent = "Play again";
  panel.hidden = false;
  live.textContent = `${tapCount(score)} in fifteen seconds. ${note}`.trim();
  action.focus({ preventScroll: true });
}

function showReady(): void {
  setPhase("ready");
  target.hidden = true;
  target.disabled = false;
  cloudsRoot.hidden = true;
  delete app.dataset.cover;
  result.hidden = true;
  copy.hidden = false;
  kicker.textContent = "A fifteen second round";
  title.textContent = "Hit the mark.";
  copy.textContent =
    "Clouds cover the mark, and you can only score when it peeks out along an edge.";
  const best = readBest();
  bestLine.textContent = best > 0 ? `Best on this device: ${tapCount(best)}.` : "";
  action.textContent = "Start round";
  panel.hidden = false;
  renderClock(ROUND_MS);
  scoreEl.textContent = "0";
}

function beginPeek(now: number): void {
  if (!placePeek()) {
    cover = "hidden";
    app.dataset.cover = cover;
    target.disabled = true;
    coverUntil = now + 240;
    return;
  }
  cover = "peek";
  app.dataset.cover = cover;
  coverUntil = now + randomBetween(PEEK_MIN_MS, PEEK_MAX_MS);
  target.disabled = false;
  target.focus({ preventScroll: true });
}

function beginHide(now: number, wait = randomBetween(HIDE_MIN_MS, HIDE_MAX_MS)): void {
  circles = layoutClouds(now);
  placeHidden();
  cover = "hidden";
  app.dataset.cover = cover;
  target.disabled = true;
  coverUntil = now + wait;
}

function placePeek(): boolean {
  const mark = markSize();
  const markR = mark / 2;
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  const hosts = shuffled(circles);

  for (const strict of [true, false]) {
    for (const host of hosts) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const angle = randomBetween(0, Math.PI * 2);
        const dist = host.r + randomBetween(markR * 0.1, markR * 0.42);
        const cx = host.cx + Math.cos(angle) * dist;
        const cy = host.cy + Math.sin(angle) * dist;
        const x = cx - markR;
        const y = cy - markR;
        if (!insideBoard(x, y, mark, width, height)) continue;
        if (pointInCloud(cx, cy)) continue;
        if (!peekIsClear(cx, cy, markR, host)) continue;
        if (
          strict &&
          !Number.isNaN(lastX) &&
          Math.hypot(x - lastX, y - lastY) < Math.min(width, height) * 0.18
        ) {
          continue;
        }
        anchorTo(host, cx, cy);
        setPos(x, y, true);
        return true;
      }
    }
  }
  return false;
}

function placeHidden(): void {
  const mark = markSize();
  const markR = mark / 2;
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  const hosts = shuffled(circles.filter((circle) => circle.r >= markR + 12));
  const pool = hosts.length > 0 ? hosts : shuffled(circles);

  for (const host of pool) {
    const room = Math.max(0, host.r - markR - 8);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = randomBetween(0, Math.PI * 2);
      const dist = randomBetween(0, room);
      const cx = host.cx + Math.cos(angle) * dist;
      const cy = host.cy + Math.sin(angle) * dist;
      if (Math.hypot(cx - host.cx, cy - host.cy) + markR > host.r - 2) continue;
      const x = cx - markR;
      const y = cy - markR;
      if (!insideBoard(x, y, mark, width, height)) continue;
      anchorTo(host, cx, cy);
      setPos(x, y, true);
      return;
    }
  }

  const host = pool[0] ?? circles[0];
  if (!host) return;
  const cx = Math.min(width - markR - EDGE, Math.max(EDGE + markR, host.cx));
  const cy = Math.min(height - markR - EDGE, Math.max(EDGE + markR, host.cy));
  anchorTo(host, cx, cy);
  setPos(cx - markR, cy - markR, true);
}

function peekIsClear(cx: number, cy: number, markR: number, host: Circle): boolean {
  const base = Math.atan2(cy - host.cy, cx - host.cx);
  for (const turn of [0, -0.55, 0.55]) {
    const angle = base + turn;
    const x = cx + Math.cos(angle) * markR * 0.72;
    const y = cy + Math.sin(angle) * markR * 0.72;
    if (pointInCloud(x, y)) return false;
  }
  return true;
}

function layoutClouds(now: number): Circle[] {
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  const unit = Math.min(width, height);
  const driftScale = reduceMotion.matches ? 0 : 1;
  const next: Circle[] = [];
  let puffIndex = 0;

  const markR = markSize() / 2;
  CLOUDS.forEach((cloud) => {
    const t = now / 1000;
    const amp = cloud.amp * driftScale;
    const ox = Math.sin(t * cloud.speed + cloud.phase) * amp;
    const oy = Math.cos(t * cloud.speed * 0.8 + cloud.phase) * amp * 0.45;
    cloud.puffs.forEach((spec, specIndex) => {
      const base = unit * spec.r;
      const fitted = specIndex === 0 ? Math.max(base, markR + 18) : base;
      const radius = Math.min(fitted, unit * 0.34);
      const cx = width * spec.x + ox;
      const cy = height * spec.y + oy;
      const el = puffEls[puffIndex];
      el.style.width = `${radius * 2}px`;
      el.style.height = `${radius * 2}px`;
      el.style.left = `${cx - radius}px`;
      el.style.top = `${cy - radius}px`;
      next.push({ cx, cy, r: radius, index: puffIndex });
      puffIndex += 1;
    });
  });

  return next;
}

function followCloud(): void {
  const host = circles[anchorIndex];
  if (!host || phase !== "playing") return;
  const mark = markSize();
  const x = host.cx + anchorOx - mark / 2;
  const y = host.cy + anchorOy - mark / 2;
  target.style.setProperty("--x", `${x}px`);
  target.style.setProperty("--y", `${y}px`);
}

function anchorTo(host: Circle, cx: number, cy: number): void {
  anchorIndex = host.index;
  anchorOx = cx - host.cx;
  anchorOy = cy - host.cy;
}

function setPos(x: number, y: number, hop: boolean): void {
  lastX = x;
  lastY = y;
  target.style.setProperty("--x", `${x}px`);
  target.style.setProperty("--y", `${y}px`);
  if (!hop || reduceMotion.matches) return;
  target.classList.remove("hop");
  void target.offsetWidth;
  target.classList.add("hop");
}

function pointInCloud(x: number, y: number): boolean {
  return circles.some((circle) => Math.hypot(x - circle.cx, y - circle.cy) < circle.r - 0.5);
}

function insideBoard(x: number, y: number, mark: number, width: number, height: number): boolean {
  return x >= EDGE && y >= EDGE && x + mark <= width - EDGE && y + mark <= height - EDGE;
}

function markSize(): number {
  return target.offsetWidth || 84;
}

function renderClock(msLeft: number): void {
  const safe = Math.max(0, msLeft);
  const seconds = safe / 1000;
  timeEl.textContent = seconds.toFixed(1);
  const ratio = Math.min(1, safe / ROUND_MS);
  bar.style.transform = `scaleX(${ratio})`;
  const urgent = phase === "playing" && seconds <= 3 && seconds > 0;
  timeEl.classList.toggle("urgent", urgent);
  bar.classList.toggle("urgent", urgent);

  if (phase !== "playing") return;
  for (const mark of TIME_MARKS) {
    if (seconds <= mark && seconds > 0 && !announcedMarks.has(mark)) {
      announcedMarks.add(mark);
      live.textContent = `${mark} seconds left.`;
    }
  }
}

function spawnPop(x: number, y: number): void {
  clearPops();
  const pop = document.createElement("span");
  pop.className = "pop";
  pop.textContent = "+1";
  pop.setAttribute("aria-hidden", "true");
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  arena.append(pop);
  pop.addEventListener("animationend", () => pop.remove(), { once: true });
}

function clearPops(): void {
  arena.querySelectorAll(".pop").forEach((pop) => pop.remove());
}

function focusTargetIfReady(): void {
  if (!focusAfterKeys || phase !== "playing" || cover !== "peek") return;
  if (keysDown.size > 0) return;
  focusAfterKeys = false;
  target.focus({ preventScroll: true });
}

function setPhase(next: Phase): void {
  phase = next;
  app.dataset.phase = next;
}

function tapCount(n: number): string {
  return n === 1 ? "1 tap" : `${n} taps`;
}

function readBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // Private browsing can block storage. The round still ends with a score.
  }
}

function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

function must<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
