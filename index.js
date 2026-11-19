/**
 * Live Wallpaper — dynamic wallpaper and glass for the DeepSeek Harness Web GUI.
 *
 * Host half: mounts the gallery backend (five online sources, local media
 * import, thumbnail proxy) on one HTTP prefix so the browser half can browse
 * and stream without cross-origin trouble.
 */
import path from 'node:path'
import fs from 'node:fs'
import createBackend from './host/backend.mjs'
import { createActivityHub } from './host/events.mjs'
import { createRouteHandler } from './host/routes.mjs'

/** Plugin name used by the Loader row. */
export const name = 'live-wallpaper'

/** Required service: the browser HTTP carrier. */
export const inject = ['webServer']

/** Route prefix owned by this bundle. */
export const ROUTE_PREFIX = '/plugins/live-wallpaper'

/**
 * Resolve the media directory for this row.
 * @param config - optional row configuration.
 * @returns the absolute data directory.
 */
function dataDirectory(config) {
  if (typeof config?.dataDir === 'string' && config.dataDir.trim() !== '') return path.resolve(config.dataDir)
  const override = process.env.DSH_LIVE_CANVAS_DIR
  if (typeof override === 'string' && override.trim() !== '') return path.resolve(override)
  const home = process.env.DSH_HOME ?? process.cwd()
  return path.join(home, 'live-canvas')
}

/**
 * Mount the gallery backend and its HTTP prefix.
 * @param ctx - Host plugin context.
 * @param config - row configuration.
 */
export function apply(ctx, config) {
  const dataDir = dataDirectory(config)
  const cacheMinutes = Number.isFinite(config?.catalogCacheMinutes) && config.catalogCacheMinutes > 0
    ? config.catalogCacheMinutes
    : 15
  const activity = createActivityHub()
  ctx.effect(() => {
    const offStatus = ctx.on('api-session/status', (sessionId, running) => {
      activity.setRunning(sessionId, running)
    })
    const offDisposed = ctx.on('api-session/removed', (sessionId) => {
      activity.setRunning(sessionId, false)
    })
    return () => {
      offStatus()
      offDisposed()
      activity.dispose()
    }
  })
  ctx.effect(() => {
    let cancelled = false
    let disposeRoute = null
    void (async () => {
      const app = await createBackend({ dataDir, catalogCacheMinutes: cacheMinutes })
      app.mediaDir = path.join(dataDir, 'media')
      // Diagnostics channel: the browser half posts what its selectors actually
      // matched, and this writes it beside the media cache for support.
      app.debugReport = async (payload) => {
        const target = path.join(dataDir, 'debug-report.json')
        await fs.promises.writeFile(target, JSON.stringify(payload ?? {}, null, 2), 'utf8')
        return { path: target }
      }
      if (cancelled) return
      disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createRouteHandler(app, activity),
      })
    })().catch((error) => {
      ctx.logger?.('live-canvas').error?.(`gallery backend failed to start: ${error?.message ?? error}`)
    })
    return () => {
      cancelled = true
      disposeRoute?.()
      disposeRoute = null
    }
  })
}