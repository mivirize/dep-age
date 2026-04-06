# dep-age

Show the age of every dependency in your package.json. Spot abandoned packages instantly.

[![npm version](https://img.shields.io/npm/v/dep-age)](https://www.npmjs.com/package/dep-age)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Why

Outdated dependencies are a security and maintenance risk. `dep-age` checks how long ago each dependency was last published to npm, so you can spot abandoned packages before they become a problem.

- **fresh** (< 6 months) - actively maintained
- **aging** (6-12 months) - worth watching
- **stale** (1-2 years) - consider alternatives
- **abandoned** (2+ years) - replace immediately

## Install

```bash
npm install -g dep-age
```

Or use directly:

```bash
npx dep-age
```

## Usage

```bash
# Scan current directory
dep-age

# Scan a specific project
dep-age /path/to/project

# Show all deps (including fresh)
dep-age --all

# JSON output (for CI/scripts)
dep-age --json
```

### Example output

```
dep-age scanned 12 packages

  XX left-pad                  3y 2mo  2023-01-15  dev  ^1.0.0 -> 1.0.0
  !! request                   1y 8mo  2024-08-01       ^2.88.0 -> 2.88.2
  ~~ moment                       9mo  2025-07-01       ^2.30.0 -> 2.30.1
  OK express                      2mo  2026-02-15       ^4.18.0 -> 4.21.0

1 abandoned (2y+)  1 stale (1-2y)  1 aging (6mo-1y)
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All dependencies are fresh or aging |
| 1 | At least one stale dependency |
| 2 | At least one abandoned dependency |

Use in CI to fail builds when dependencies go stale:

```yaml
- run: npx dep-age
```

## API

```typescript
import { scanDeps } from "dep-age";

const result = await scanDeps(process.cwd());

for (const dep of result.deps) {
  console.log(`${dep.name}: ${dep.status} (${dep.ageInDays} days)`);
}
```

### `scanDeps(cwd: string): Promise<ScanResult>`

Returns:

```typescript
interface ScanResult {
  scannedAt: string;
  total: number;
  stale: number;
  abandoned: number;
  deps: readonly DepInfo[];
}

interface DepInfo {
  name: string;
  current: string;
  latest: string;
  lastPublish: string;
  ageInDays: number;
  status: "fresh" | "aging" | "stale" | "abandoned";
  devDep: boolean;
}
```

## Zero dependencies

`dep-age` uses only Node.js built-in modules. No external dependencies.

## License

MIT
