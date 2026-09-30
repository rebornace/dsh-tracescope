/**
 * Bounded-concurrency + batched thumbnail loader.
 *
 * Cards coalesce into short batches so many visible frames become one or a few
 * Figma `/images` calls (via `/page-thumbnails`), instead of one render per card.
 * A client memory cache avoids repeat work when scrolling / rescan hits the
 * same nodes again.
 */

const MAX_CONCURRENCY = 2
const MAX_TRIES = 3
/** Collect node ids for this long before flushing a batch. */
const BATCH_WINDOW_MS = 80

type Task<T> = () => Promise<T>

let active = 0
const pending: Array<() => void> = []

function pump(): void {
  while (active < MAX_CONCURRENCY) {
    const next = pending.shift()
    if (!next) return
    active += 1
    next()
  }
}

function release(): void {
  active -= 1
  pump()
}

function enqueue<T>(task: Task<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push(() => {
      task().then(
        (value) => {
          release()
          resolve(value)
        },
        (err) => {
          release()
          reject(err)
        },
      )
    })
    pump()
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Run a thumbnail task through the concurrency-limited queue, retrying transient
 * failures with a short backoff. The task should already throw on a bad response.
 */
export async function queueThumbnail<T>(task: Task<T>): Promise<T> {
  let lastError: unknown
  for (let tryIndex = 0; tryIndex < MAX_TRIES; tryIndex += 1) {
    try {
      return await enqueue(task)
    } catch (err) {
      lastError = err
      if (tryIndex < MAX_TRIES - 1) {
        await sleep(400 * 2 ** tryIndex + Math.floor(Math.random() * 200))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function cacheKey(figmaUrl: string, figmaToken: string, nodeId: string): string {
  return `${figmaToken.slice(0, 12)}|${figmaUrl}|${nodeId.replace(/-/g, ':')}`
}

const urlCache = new Map<string, string>()

type Waiter = {
  nodeId: string
  resolve: (url: string | undefined) => void
  reject: (err: unknown) => void
  cacheKey: string
}

type BatchBucket = {
  figmaUrl: string
  figmaToken: string
  waiters: Waiter[]
  timer: ReturnType<typeof setTimeout> | null
}

let openBucket: BatchBucket | null = null

async function postThumbnails(
  figmaUrl: string,
  figmaToken: string,
  nodeIds: string[],
): Promise<Record<string, string>> {
  const r = await fetch('/tracescope/v1/page-thumbnails', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ figmaUrl, figmaToken, nodeIds }),
  })
  const text = await r.text()
  const data = text ? JSON.parse(text) : {}
  if (!r.ok) throw new Error(data.error || '缩略图批量请求失败')
  return (data.urls as Record<string, string>) || {}
}

function flushBucket(bucket: BatchBucket): void {
  if (openBucket === bucket) openBucket = null
  if (bucket.timer) {
    clearTimeout(bucket.timer)
    bucket.timer = null
  }
  const waiters = bucket.waiters.splice(0)
  if (!waiters.length) return

  const nodeIds = [...new Set(waiters.map((w) => w.nodeId.replace(/-/g, ':')))]

  void queueThumbnail(() => postThumbnails(bucket.figmaUrl, bucket.figmaToken, nodeIds))
    .then((urls) => {
      for (const w of waiters) {
        const normalized = w.nodeId.replace(/-/g, ':')
        const url = urls[normalized] || urls[w.nodeId]
        if (url) urlCache.set(w.cacheKey, url)
        w.resolve(url)
      }
    })
    .catch((err) => {
      for (const w of waiters) w.reject(err)
    })
}

/**
 * Request one design-page thumbnail. Coalesces nearby requests into a batch and
 * serves repeats from the in-tab cache.
 */
export function requestPageThumbnail(opts: {
  figmaUrl: string
  figmaToken: string
  nodeId: string
}): Promise<string | undefined> {
  const key = cacheKey(opts.figmaUrl, opts.figmaToken, opts.nodeId)
  const cached = urlCache.get(key)
  if (cached) return Promise.resolve(cached)

  return new Promise<string | undefined>((resolve, reject) => {
    if (
      openBucket &&
      (openBucket.figmaUrl !== opts.figmaUrl || openBucket.figmaToken !== opts.figmaToken)
    ) {
      flushBucket(openBucket)
    }
    if (!openBucket) {
      openBucket = {
        figmaUrl: opts.figmaUrl,
        figmaToken: opts.figmaToken,
        waiters: [],
        timer: null,
      }
    }
    openBucket.waiters.push({
      nodeId: opts.nodeId,
      resolve,
      reject,
      cacheKey: key,
    })
    if (!openBucket.timer) {
      const bucket = openBucket
      openBucket.timer = setTimeout(() => flushBucket(bucket), BATCH_WINDOW_MS)
    }
  })
}
