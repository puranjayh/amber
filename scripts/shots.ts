/**
 * Capture every console route for slides and the Devpost gallery.
 *
 *   npm run shots
 *
 * Writes docs/shots/{route}-{1440|390}-{light|dark}.png
 *
 * `?demo=1` preloads PT-4401 × NCT07001001. The worklist is captured without
 * that flag — `/?demo=1` redirects to /hcp.
 *
 * Reuses a running `next dev` (SHOTS_BASE, then ports 3102 / 3100 / 3000).
 * Starts one on SHOTS_PORT only if none is up. Next 16 allows one per repo.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "shots");
const PORT = Number(process.env.SHOTS_PORT ?? 3102);
const CANDIDATE_PORTS = [PORT, 3100, 3000];

const ROUTES: { name: string; path: string }[] = [
  { name: "worklist", path: "/" },
  { name: "hcp", path: "/hcp?demo=1" },
  { name: "doctor", path: "/doctor?demo=1" },
  { name: "elasticity", path: "/elasticity?demo=1" },
  { name: "payer", path: "/payer?demo=1" },
  { name: "eval", path: "/eval" },
  { name: "preflight", path: "/preflight" },
];

const VIEWPORTS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "390", width: 390, height: 844 },
] as const;

const THEMES = ["light", "dark"] as const;

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.ok || res.status === 307 || res.status === 308;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, child: ChildProcess | null, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child?.exitCode != null) {
      throw new Error(`next dev exited ${child.exitCode} before ${url} was ready`);
    }
    if (await probe(url)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server at ${url} did not become ready`);
}

function startDev(): ChildProcess {
  return spawn("npx", ["next", "dev", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BROWSER: "none" },
  });
}

async function resolveBase(): Promise<{ base: string; child: ChildProcess | null }> {
  if (process.env.SHOTS_BASE) {
    const base = process.env.SHOTS_BASE.replace(/\/$/, "");
    if (!(await probe(base))) throw new Error(`SHOTS_BASE ${base} is not responding`);
    return { base, child: null };
  }
  // Next 16 refuses a second `next dev` in the same directory — reuse one if it is up.
  for (const port of CANDIDATE_PORTS) {
    const base = `http://127.0.0.1:${port}`;
    if (await probe(base)) {
      console.log(`reusing ${base}`);
      return { base, child: null };
    }
  }
  const child = startDev();
  const base = `http://127.0.0.1:${PORT}`;
  await waitForServer(base, child);
  return { base, child };
}

async function capture(browser: Browser, base: string): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      for (const route of ROUTES) {
        const dest = path.join(OUT, `${route.name}-${vp.label}-${theme}.png`);
        await page.goto(`${base}${route.path}`, { waitUntil: "networkidle", timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await new Promise((r) => setTimeout(r, 200));
        // Worklist is 200+ rows; the slide is the header + dollar line.
        await page.screenshot({
          path: dest,
          fullPage: route.name !== "worklist",
        });
        console.log(`wrote ${path.relative(ROOT, dest)}`);
      }
      await context.close();
    }
  }
}

async function main(): Promise<void> {
  const { base, child } = await resolveBase();
  try {
    const browser = await chromium.launch();
    try {
      await capture(browser, base);
    } finally {
      await browser.close();
    }
  } finally {
    if (child?.pid) child.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
