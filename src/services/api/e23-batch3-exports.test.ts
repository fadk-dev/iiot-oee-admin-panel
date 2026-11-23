// E32.3 (FAT-284): dipecah dari e23-batch3.test.ts — ekspor JSON-encoded (N-24, FAT-193).
// Setiap stub mengembalikan BENTUK SPEC LIVE (bukan bentuk api_docs lama);
// setiap test meng-assert mapper/transport berperilaku benar terhadap bentuk
// itu. Port segar per tes (3041) — pelajaran FAT-280: reuse port
// menimbulkan galat NETWORK palsu. Kode sumber tidak diubah.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpApiClient } from './httpClient';

const LOGIN_BODY = {
  success: true,
  token: 'stub-token',
  expires_in: 900,
  operator: { id: 'ADM-001', username: 'Alexandria Vance', role: 'ADMIN', line_id: 'ORG-ALL' },
};

type SeenReq = { method: string | undefined; path: string; url: string; body: unknown };

function startStub(
  port: number,
  handler: (req: http.IncomingMessage, url: URL, body: unknown) => { status: number; payload: unknown; raw?: string; contentType?: string } | null,
) {
  const seen: SeenReq[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: unknown;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      seen.push({ method: req.method, path: url.pathname, url: url.pathname + url.search, body });
      if (req.method === 'POST' && url.pathname === '/api/v1/auth/admin/login') {
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify(LOGIN_BODY));
        return;
      }
      const out = handler(req, url, body);
      if (out) {
        if (out.raw !== undefined) {
          res.writeHead(out.status, { 'Content-Type': out.contentType ?? 'text/csv', Connection: 'close' });
          res.end(out.raw);
          return;
        }
        res.writeHead(out.status, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify(out.payload));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Rute stub tidak dikenal: ${url.pathname}` }));
    });
  });
  return { server, seen };
}

async function withStub(
  port: number,
  handler: (req: http.IncomingMessage, url: URL, body: unknown) => { status: number; payload: unknown; raw?: string; contentType?: string } | null,
  run: (seen: SeenReq[]) => Promise<void>,
) {
  const prevApiUrl = process.env.VITE_API_URL;
  process.env.VITE_API_URL = `http://localhost:${port}/api/v1`;
  const { server, seen } = startStub(port, handler);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  try {
    httpApiClient.setNetworkMode('LAN');
    await httpApiClient.login('ADM-001', 'Admin@2026!');
    await run(seen);
  } finally {
    httpApiClient.setSessionActive(false, null);
    await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
    if (prevApiUrl === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = prevApiUrl;
  }
}

const FROM = '2026-11-10T00:00:00.000Z';
const TO = '2026-11-17T00:00:00.000Z';
const CSV = 'a,b\n1,2\n3,4\n';

// ---------------------------------------------------------------------------
// N-24 (FAT-193): ekspor JSON-encoded — body string JSON diuraikan ke CSV.
// ---------------------------------------------------------------------------

test('E23 N-24 (FAT-193): keenam jalur ekspor menguraikan body JSON-encoded menjadi CSV benar', async () => {
  await withStub(3041, (_req, url) => {
    if (url.pathname === '/api/v1/downtime-events/STM32-OEE-01/export') {
      // Jalur ini mengembalikan CSV polos (bukan JSON-encoded) — tetap jalan.
      return { status: 200, payload: null, raw: CSV, contentType: 'text/csv' };
    }
    if (url.pathname.endsWith('/export')) {
      return { status: 200, payload: null, raw: JSON.stringify(CSV), contentType: 'application/json' };
    }
    return null;
  }, async () => {
    const dt = await httpApiClient.exportDowntimeData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(dt.content, CSV);
    assert.equal(dt.rowCount, 2);
    const opGlobal = await httpApiClient.exportOperationalEventsData({ device_id: 'ALL', from: FROM, to: TO, format: 'csv' });
    assert.equal(opGlobal.content, CSV);
    assert.equal(opGlobal.rowCount, 2);
    const opDev = await httpApiClient.exportOperationalEventsData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(opDev.content, CSV);
    assert.equal(opDev.rowCount, 2);
    const audit = await httpApiClient.exportSystemAuditTrailData({ from: FROM, to: TO, format: 'csv' });
    assert.equal(audit.content, CSV);
    assert.equal(audit.rowCount, 2);
    const tel = await httpApiClient.exportTelemetryData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(tel.content, CSV);
    assert.equal(tel.rowCount, 2);
    const telHourly = await httpApiClient.exportTelemetryHourlyData({ device_id: 'STM32-OEE-01', from: FROM, to: TO, format: 'csv' });
    assert.equal(telHourly.content, CSV);
    assert.equal(telHourly.rowCount, 2);
  });
});
