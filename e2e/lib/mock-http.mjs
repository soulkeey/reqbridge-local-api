import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.vsix': 'application/octet-stream',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Ephemeral 127.0.0.1:0 HTTP test oracle tracking inFlight / maxInFlight and request history.
 * @param {{
 *   routes?: Array<{
 *     method?: string;
 *     path: string | RegExp;
 *     status?: number;
 *     headers?: Record<string, string>;
 *     body?: any;
 *     delayMs?: number;
 *     handler?: (ctx: { req: http.IncomingMessage; res: http.ServerResponse; url: URL; body: string; parsedBody: any }) => Promise<void> | void;
 *   }>;
 *   staticDir?: string;
 *   defaultHandler?: (ctx: { req: http.IncomingMessage; res: http.ServerResponse; url: URL; body: string; parsedBody: any }) => Promise<void> | void;
 * }} [options]
 */
export async function createMockHttpServer(options = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const requests = [];
  let routes = [...(options.routes || [])];
  let defaultHandler = options.defaultHandler || null;

  const server = http.createServer(async (req, res) => {
    inFlight += 1;
    if (inFlight > maxInFlight) maxInFlight = inFlight;
    let decremented = false;
    const dec = () => {
      if (!decremented) {
        decremented = true;
        inFlight = Math.max(0, inFlight - 1);
      }
    };
    res.on('close', dec);
    res.on('finish', dec);

    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const body = await readBody(req);
      let parsedBody = null;
      if (body) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = null;
        }
      }

      requests.push({
        method: req.method || 'GET',
        pathname: url.pathname,
        search: url.search,
        url: req.url || '/',
        headers: { ...req.headers },
        body,
        parsedBody,
        timestamp: Date.now(),
      });

      const methodUpper = (req.method || 'GET').toUpperCase();
      const matched = routes.find((r) => {
        if (r.method && r.method.toUpperCase() !== methodUpper) return false;
        if (typeof r.path === 'string') return url.pathname === r.path;
        if (r.path instanceof RegExp) return r.path.test(url.pathname);
        return false;
      });

      if (matched) {
        if (matched.delayMs && matched.delayMs > 0) {
          await new Promise((r) => setTimeout(r, matched.delayMs));
        }
        if (res.writableEnded || res.destroyed) return;
        if (matched.handler) {
          await matched.handler({ req, res, url, body, parsedBody });
          return;
        }
        const status = matched.status ?? 200;
        if (matched.body !== undefined && typeof matched.body !== 'string' && !Buffer.isBuffer(matched.body)) {
          sendJson(res, status, matched.body, matched.headers);
          return;
        }
        const raw = matched.body ?? '';
        res.writeHead(status, {
          'content-type': 'text/plain; charset=utf-8',
          ...(matched.headers || {}),
        });
        res.end(raw);
        return;
      }

      if (defaultHandler) {
        await defaultHandler({ req, res, url, body, parsedBody });
        return;
      }

      if (options.staticDir) {
        const relPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
        const resolved = path.resolve(options.staticDir, relPath);
        const base = path.resolve(options.staticDir);
        if (!resolved.startsWith(base + path.sep) && resolved !== base) {
          res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
          return;
        }
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          res.writeHead(200, {
            'content-type': MIME_TYPES[ext] || 'application/octet-stream',
          });
          fs.createReadStream(resolved).pipe(res);
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      // Default echo endpoint for generic tests
      sendJson(res, 200, {
        ok: true,
        method: methodUpper,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers: req.headers,
        body: parsedBody ?? body,
      });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
      } else if (!res.writableEnded) {
        res.end();
      }
    } finally {
      dec();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    port,
    baseUrl,
    stats() {
      return {
        inFlight,
        maxInFlight,
        requests: [...requests],
      };
    },
    resetStats() {
      maxInFlight = inFlight;
      requests.length = 0;
    },
    setRoutes(nextRoutes) {
      routes = [...nextRoutes];
    },
    setDefaultHandler(fn) {
      defaultHandler = fn;
    },
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
      });
    },
  };
}
