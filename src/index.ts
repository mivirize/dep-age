import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import https from 'node:https'

export interface DepInfo {
  name: string
  current: string
  latest: string
  lastPublish: string
  ageInDays: number
  status: 'fresh' | 'aging' | 'stale' | 'abandoned'
  devDep: boolean
}

export interface ScanResult {
  scannedAt: string
  total: number
  stale: number
  abandoned: number
  deps: readonly DepInfo[]
}

const STATUS_THRESHOLDS = {
  fresh: 180,
  aging: 365,
  stale: 730,
} as const

function fetchRegistryInfo(
  name: string,
): Promise<{ latest: string; time: Record<string, string> }> {
  const encodedName = name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1).replace('/', '%2f'))}`
    : encodeURIComponent(name)

  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${encodedName}`
    https
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`npm registry returned ${res.statusCode} for ${name}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            const latest = data['dist-tags']?.latest ?? 'unknown'
            const time = data.time ?? {}
            resolve({ latest, time })
          } catch {
            reject(new Error(`Failed to parse registry response for ${name}`))
          }
        })
      })
      .on('error', reject)
  })
}

function classifyAge(days: number): DepInfo['status'] {
  if (days < STATUS_THRESHOLDS.fresh) return 'fresh'
  if (days < STATUS_THRESHOLDS.aging) return 'aging'
  if (days < STATUS_THRESHOLDS.stale) return 'stale'
  return 'abandoned'
}

export async function scanDeps(cwd: string): Promise<ScanResult> {
  const pkgPath = resolve(cwd, 'package.json')
  const raw = readFileSync(pkgPath, 'utf-8')
  const pkg = JSON.parse(raw)

  const allDeps: Array<{ name: string; version: string; devDep: boolean }> = []

  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    allDeps.push({ name, version: version as string, devDep: false })
  }
  for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
    allDeps.push({ name, version: version as string, devDep: true })
  }

  const now = Date.now()
  const results: DepInfo[] = []

  const CONCURRENCY = 6
  for (let i = 0; i < allDeps.length; i += CONCURRENCY) {
    const batch = allDeps.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      batch.map(async (dep) => {
        const info = await fetchRegistryInfo(dep.name)
        const latestTime = info.time[info.latest] ?? info.time.modified
        const publishDate = latestTime ? new Date(latestTime) : new Date()
        const ageInDays = Math.floor((now - publishDate.getTime()) / (1000 * 60 * 60 * 24))
        return {
          name: dep.name,
          current: dep.version,
          latest: info.latest,
          lastPublish: publishDate.toISOString().split('T')[0],
          ageInDays,
          status: classifyAge(ageInDays),
          devDep: dep.devDep,
        } satisfies DepInfo
      }),
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  const sorted = [...results].sort((a, b) => b.ageInDays - a.ageInDays)

  return {
    scannedAt: new Date().toISOString(),
    total: sorted.length,
    stale: sorted.filter((d) => d.status === 'stale').length,
    abandoned: sorted.filter((d) => d.status === 'abandoned').length,
    deps: sorted,
  }
}
