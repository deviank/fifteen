import "@fontsource/figtree/500.css";
import "@fontsource/figtree/700.css";
import "@fontsource/fraunces/600.css";
import "./style.css";

const ROUND_MS = 15_000;
const BEST_KEY = "fifteen.best";
const EDGE = 14;
const TIME_MARKS = [10, 5, 3];

type Phase = "ready" | "playing" | "over";

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

let phase: Phase = "ready";
let score = 0;
let startedAt = 0;
let frame = 0;
let lastX = Number.NaN;
let lastY = Number.NaN;
let focusAfterKeys = false;
let acceptHits = false;
const announcedMarks = new Set<number>();
const keysDown = new Set<string>();

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

showReady();

function startRound(): void {
  score = 0;
  scoreEl.textContent = "0";
  announcedMarks.clear();
  setPhase("playing");
  panel.hidden = true;
  target.hidden = false;
  lastX = Number.NaN;
  lastY = Number.NaN;
  placeTarget();
  startedAt = performance.now();
  renderClock(ROUND_MS);
  live.textContent = "Round started. Fifteen seconds.";
  focusAfterKeys = true;
  acceptHits = false;
  queueMicrotask(() => {
    acceptHits = phase === "playing";
  });
  focusTargetIfReady();
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
  frame = requestAnimationFrame(tick);
}

function onHit(event: Event): void {
  if (phase !== "playing" || !acceptHits) return;
  if (event instanceof PointerEvent && event.button !== 0) return;
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
  placeTarget();
}

function finishRound(): void {
  if (phase !== "playing") return;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  setPhase("over");
  target.hidden = true;
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
  result.hidden = true;
  copy.hidden = false;
  kicker.textContent = "A fifteen second round";
  title.textContent = "Hit the mark.";
  copy.textContent =
    "The mark jumps as soon as you tap it. Only a hit scores. You get fifteen seconds.";
  const best = readBest();
  bestLine.textContent = best > 0 ? `Best on this device: ${tapCount(best)}.` : "";
  action.textContent = "Start round";
  panel.hidden = false;
  renderClock(ROUND_MS);
  scoreEl.textContent = "0";
}

function placeTarget(): void {
  const width = arena.clientWidth;
  const height = arena.clientHeight;
  const tw = target.offsetWidth;
  const th = target.offsetHeight;
  const maxX = Math.max(EDGE, width - tw - EDGE);
  const maxY = Math.max(EDGE, height - th - EDGE);
  const minJump = Math.min(width, height) * 0.28;
  let x = EDGE;
  let y = EDGE;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    x = randomBetween(EDGE, maxX);
    y = randomBetween(EDGE, maxY);
    if (Number.isNaN(lastX) || Math.hypot(x - lastX, y - lastY) >= minJump) break;
  }

  lastX = x;
  lastY = y;
  target.style.setProperty("--x", `${x}px`);
  target.style.setProperty("--y", `${y}px`);
  target.classList.remove("hop");
  void target.offsetWidth;
  target.classList.add("hop");
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
  if (!focusAfterKeys || phase !== "playing") return;
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

function must<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
