/**
 * Live "an agent is working" broadcast for the wallpaper client.
 *
 * The browser half pauses animated wallpapers while a task runs, so it needs a
 * real signal instead of guessing from the DOM. The Host half watches
 * `api-session/status` and fans the aggregate state out over Server-Sent
 * Events, one connection per open page.
 */

/**
 * Create the activity hub.
 * @returns the hub with subscription and update entry points.
 */
export function createActivityHub() {
  const running = new Set()
  const subscribers = new Set()

  const publish = () => {
    const payload = `event: status\ndata: ${JSON.stringify({ running: running.size > 0, count: running.size })}\n\n`
    for (const res of subscribers) {
      try {
        res.write(payload)
      } catch {
        subscribers.delete(res)
      }
    }
  }

  const heartbeat = setInterval(() => {
    for (const res of subscribers) {
      try {
        res.write(': ping\n\n')
      } catch {
        subscribers.delete(res)
      }
    }
  }, 25_000)
  heartbeat.unref?.()

  return {
    /**
     * Record one session's running state.
     * @param sessionId - the session whose agent changed state.
     * @param isRunning - whether that agent now runs.
     */
    setRunning(sessionId, isRunning) {
      const id = String(sessionId)
      if (isRunning) running.add(id)
      else running.delete(id)
      publish()
    },
    /**
     * Answer one SSE request and keep it open until the client leaves.
     * @param res - the HTTP response owning the stream.
     */
    subscribe(res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      res.write(`event: status\ndata: ${JSON.stringify({ running: running.size > 0, count: running.size })}\n\n`)
      subscribers.add(res)
      res.on('close', () => {
        subscribers.delete(res)
      })
    },
    /**
     * Release the heartbeat and every open stream.
     */
    dispose() {
      clearInterval(heartbeat)
      for (const res of subscribers) {
        try {
          res.end()
        } catch {
          /* the socket is already gone */
        }
      }
      subscribers.clear()
    },
  }
}