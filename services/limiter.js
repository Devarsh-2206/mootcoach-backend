/**
 * Lets only a few heavy jobs run at once; the rest wait their turn.
 *
 * Why: a load test with 30 uploads arriving together read all 30 PDFs at the
 * same moment (one worker thread each) and the server's memory reached about
 * 870 MB, more than a small Render instance has. Waiting a few seconds in a
 * queue is much better than the server running out of memory and restarting,
 * which fails every upload in progress.
 *
 *   const pdfSlots = limiter(2);
 *   await pdfSlots.run(() => parse(buffer));
 *
 * slots.middleware() does the same for a whole route: the request waits for a
 * slot, and the slot is freed when the response ends or the browser leaves.
 * When too many are already waiting, it answers 503 with a "busy" message
 * instead of queueing forever.
 */
function limiter(max, { maxQueue = Infinity, name = 'job' } = {}) {
  let active = 0;
  const queue = [];
  const stats = { name, max, peakActive: 0, peakQueue: 0, rejected: 0 };

  function acquire() {
    if (active < max) { active++; stats.peakActive = Math.max(stats.peakActive, active); return Promise.resolve(); }
    if (queue.length >= maxQueue) { stats.rejected++; const e = new Error('busy'); e.busy = true; return Promise.reject(e); }
    return new Promise(resolve => { queue.push(resolve); stats.peakQueue = Math.max(stats.peakQueue, queue.length); });
  }
  function release() {
    const next = queue.shift();
    if (next) next();            // the slot passes straight to the next in line
    else active = Math.max(0, active - 1);
  }
  async function run(fn) {
    await acquire();
    try { return await fn(); } finally { release(); }
  }
  function middleware(busyMessage) {
    return (req, res, next) => {
      acquire().then(() => {
        let freed = false;
        const free = () => { if (!freed) { freed = true; release(); } };
        res.on('finish', free); res.on('close', free);
        next();
      }, () => res.status(503).json({ success: false, code: 'busy', error: busyMessage }));
    };
  }
  const status = () => ({ ...stats, active, waiting: queue.length });
  return { run, middleware, status };
}

module.exports = { limiter };
