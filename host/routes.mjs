/**
 * HTTP surface of the Live Wallpaper Host half.
 *
 * One prefix route serves three things, so the bundle registers a single
 * composition-level path:
 *   - POST <prefix>/api   — JSON dispatch onto the gallery backend API
 *   - GET  <prefix>/media/<localId> — imported local media with Range support
 *   - GET  <prefix>/thumb?u=<url>   — same-origin thumbnail proxy
 */
import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const LOCAL_ID = /^[\da-f]{64}\.(mp4|webm|gif|png|jpe?g|webp)$/

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Parse one `Range: bytes=a-b` header against the file size. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (match === null) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null
  let start
  let end
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null
  return { start, end }
}

/**
 * Build the request handler for the bundle's HTTP prefix.
 * @param app - Host-facing backend API plus its media directory.
 * @returns the route handler.
 */
export function createRouteHandler(app, activity) {
  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const rest = url.pathname.replace(/^\/plugins\/live-wallpaper/, '')
    try {
      if (rest === '/events' && req.method === 'GET') {
        activity.subscribe(res)
        return
      }
      if (rest === '/api' && req.method === 'POST') {
        const chunks = []
        for await (const chunk of req) {
          chunks.push(chunk)
          if (chunks.reduce((n, c) => n + c.length, 0) > 4 * 1024 * 1024) {
            json(res, 413, { ok: false, error: '请求体过大' })
            return
          }
        }
        let body
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        } catch {
          json(res, 400, { ok: false, error: '请求格式无效' })
          return
        }
        const method = String(body?.method ?? '')
        if (typeof app[method] !== 'function' || method.startsWith('_')) {
          json(res, 404, { ok: false, error: '未知接口：' + method })
          return
        }
        try {
          const value = await app[method](body?.params ?? {})
          json(res, 200, { ok: true, value })
        } catch (error) {
          json(res, 200, { ok: false, error: error?.message ?? String(error) })
        }
        return
      }

      if (rest.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
        const localId = decodeURIComponent(rest.slice('/media/'.length))
        if (!LOCAL_ID.test(localId)) {
          json(res, 400, { ok: false, error: '媒体编号无效' })
          return
        }
        const file = path.join(app.mediaDir, localId)
        let stat
        try {
          stat = fs.statSync(file)
        } catch {
          json(res, 404, { ok: false, error: '媒体文件不存在' })
          return
        }
        const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
        const range = parseRange(req.headers.range, stat.size)
        if (range !== null) {
          res.writeHead(206, {
            'content-type': type,
            'content-length': String(range.end - range.start + 1),
            'content-range': `bytes ${range.start}-${range.end}/${stat.size}`,
            'accept-ranges': 'bytes',
            'cache-control': 'private, max-age=86400',
          })
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          fs.createReadStream(file, { start: range.start, end: range.end }).pipe(res)
          return
        }
        res.writeHead(200, {
          'content-type': type,
          'content-length': String(stat.size),
          'accept-ranges': 'bytes',
          'cache-control': 'private, max-age=86400',
        })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        fs.createReadStream(file).pipe(res)
        return
      }

      if (rest === '/thumb' && req.method === 'GET') {
        const target = url.searchParams.get('u')
        if (target === null) {
          json(res, 400, { ok: false, error: '缺少缩略图地址' })
          return
        }
        const dataUrl = await app.thumbnail({ url: target })
        const comma = dataUrl.indexOf(',')
        const meta = dataUrl.slice(5, comma)
        const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64')
        res.writeHead(200, {
          'content-type': meta.split(';')[0],
          'content-length': String(buffer.length),
          'cache-control': 'public, max-age=86400',
        })
        res.end(buffer)
        return
      }

      json(res, 404, { ok: false, error: '未知路径' })
    } catch (error) {
      if (!res.headersSent) json(res, 500, { ok: false, error: error?.message ?? String(error) })
      else res.end()
    }
  }
}