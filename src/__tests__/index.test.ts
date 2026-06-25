import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:https', () => {
  const mockGet = vi.fn()
  return { default: { get: mockGet } }
})

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

import { readFileSync } from 'node:fs'
import https from 'node:https'
import { scanDeps } from '../index.js'
import type { IncomingMessage } from 'node:http'
import { EventEmitter } from 'node:events'

function createMockResponse(data: object, statusCode = 200): IncomingMessage {
  const emitter = new EventEmitter() as IncomingMessage
  emitter.statusCode = statusCode
  setTimeout(() => {
    emitter.emit('data', Buffer.from(JSON.stringify(data)))
    emitter.emit('end')
  }, 0)
  return emitter
}

function setupRegistry(packages: Record<string, { latest: string; modified: string }>): void {
  const mockGet = https.get as ReturnType<typeof vi.fn>
  mockGet.mockImplementation((url: string, _opts: object, cb: (res: IncomingMessage) => void) => {
    const name = (url as string).split('/').pop()!
    const pkg = packages[decodeURIComponent(name)]
    if (!pkg) {
      cb(createMockResponse({}, 404))
      return new EventEmitter()
    }
    cb(
      createMockResponse({
        'dist-tags': { latest: pkg.latest },
        time: {
          [pkg.latest]: pkg.modified,
          modified: pkg.modified,
        },
      }),
    )
    return new EventEmitter()
  })
}

describe('scanDeps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies fresh dependencies (< 6 months)', async () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 30)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ dependencies: { express: '^4.18.0' } }),
    )
    setupRegistry({
      express: { latest: '4.21.0', modified: recent.toISOString() },
    })

    const result = await scanDeps('/fake')
    expect(result.deps[0].status).toBe('fresh')
    expect(result.deps[0].ageInDays).toBeLessThan(180)
  })

  it('classifies stale dependencies (1-2 years)', async () => {
    const old = new Date()
    old.setFullYear(old.getFullYear() - 1)
    old.setMonth(old.getMonth() - 3)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ dependencies: { lodash: '^4.17.0' } }),
    )
    setupRegistry({
      lodash: { latest: '4.17.21', modified: old.toISOString() },
    })

    const result = await scanDeps('/fake')
    expect(result.deps[0].status).toBe('stale')
    expect(result.stale).toBe(1)
  })

  it('classifies abandoned dependencies (2+ years)', async () => {
    const ancient = new Date()
    ancient.setFullYear(ancient.getFullYear() - 3)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ dependencies: { 'old-lib': '^1.0.0' } }),
    )
    setupRegistry({
      'old-lib': { latest: '1.0.5', modified: ancient.toISOString() },
    })

    const result = await scanDeps('/fake')
    expect(result.deps[0].status).toBe('abandoned')
    expect(result.abandoned).toBe(1)
  })

  it('separates dev dependencies', async () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 10)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({
        dependencies: { express: '^4.18.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
    )
    setupRegistry({
      express: { latest: '4.21.0', modified: recent.toISOString() },
      vitest: { latest: '3.1.0', modified: recent.toISOString() },
    })

    const result = await scanDeps('/fake')
    const devDep = result.deps.find((d) => d.name === 'vitest')
    expect(devDep?.devDep).toBe(true)
    const prodDep = result.deps.find((d) => d.name === 'express')
    expect(prodDep?.devDep).toBe(false)
  })

  it('sorts by age descending', async () => {
    const old = new Date()
    old.setFullYear(old.getFullYear() - 2)
    const recent = new Date()
    recent.setDate(recent.getDate() - 5)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({
        dependencies: { fresh: '^1.0.0', ancient: '^1.0.0' },
      }),
    )
    setupRegistry({
      fresh: { latest: '1.0.0', modified: recent.toISOString() },
      ancient: { latest: '1.0.0', modified: old.toISOString() },
    })

    const result = await scanDeps('/fake')
    expect(result.deps[0].name).toBe('ancient')
    expect(result.deps[1].name).toBe('fresh')
  })

  it('handles empty dependencies', async () => {
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({}))

    const result = await scanDeps('/fake')
    expect(result.total).toBe(0)
    expect(result.deps).toEqual([])
  })

  it('returns correct totals', async () => {
    const recent = new Date()
    recent.setDate(recent.getDate() - 10)
    ;(readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({
        dependencies: { a: '^1.0.0', b: '^1.0.0' },
        devDependencies: { c: '^1.0.0' },
      }),
    )
    setupRegistry({
      a: { latest: '1.0.0', modified: recent.toISOString() },
      b: { latest: '1.0.0', modified: recent.toISOString() },
      c: { latest: '1.0.0', modified: recent.toISOString() },
    })

    const result = await scanDeps('/fake')
    expect(result.total).toBe(3)
  })
})
