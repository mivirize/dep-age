#!/usr/bin/env node

import { scanDeps } from "./index.js";

const STATUS_ICONS: Record<string, string> = {
  fresh: "OK",
  aging: "~~",
  stale: "!!",
  abandoned: "XX",
};

const STATUS_COLORS: Record<string, string> = {
  fresh: "\x1b[32m",
  aging: "\x1b[33m",
  stale: "\x1b[31m",
  abandoned: "\x1b[35m",
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function formatDays(days: number): string {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const showAll = args.includes("--all");
  const cwd = args.find((a) => !a.startsWith("--")) ?? process.cwd();

  try {
    process.stderr.write("Fetching package ages from npm registry...\n");
    const result = await scanDeps(cwd);

    if (jsonMode) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    const filtered = showAll
      ? result.deps
      : result.deps.filter((d) => d.status !== "fresh");

    process.stdout.write(
      `\n${BOLD}dep-age${RESET} scanned ${result.total} packages\n\n`
    );

    if (filtered.length === 0) {
      process.stdout.write("All dependencies are fresh (< 6 months old).\n");
      return;
    }

    const nameWidth = Math.min(
      40,
      Math.max(...filtered.map((d) => d.name.length))
    );

    for (const dep of filtered) {
      const icon = STATUS_ICONS[dep.status];
      const color = STATUS_COLORS[dep.status];
      const tag = dep.devDep ? `${DIM}dev${RESET}` : "   ";
      const name = dep.name.padEnd(nameWidth);
      const age = formatDays(dep.ageInDays).padStart(7);
      const date = dep.lastPublish;
      const ver = `${dep.current} -> ${dep.latest}`;

      process.stdout.write(
        `  ${color}${icon}${RESET} ${name} ${age}  ${DIM}${date}${RESET}  ${tag}  ${DIM}${ver}${RESET}\n`
      );
    }

    process.stdout.write("\n");

    if (result.abandoned > 0) {
      process.stdout.write(
        `${STATUS_COLORS.abandoned}${result.abandoned} abandoned (2y+)${RESET}  `
      );
    }
    if (result.stale > 0) {
      process.stdout.write(
        `${STATUS_COLORS.stale}${result.stale} stale (1-2y)${RESET}  `
      );
    }
    const agingCount = filtered.filter((d) => d.status === "aging").length;
    if (agingCount > 0) {
      process.stdout.write(
        `${STATUS_COLORS.aging}${agingCount} aging (6mo-1y)${RESET}`
      );
    }
    process.stdout.write("\n\n");

    const exitCode =
      result.abandoned > 0 ? 2 : result.stale > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main();
