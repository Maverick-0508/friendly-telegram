import http from 'node:http';

/**
 * Local stand-in for the Resend and Africa's Talking APIs, used by the
 * automation tests and the load harness. Point RESEND_BASE_URL and
 * AFRICAS_TALKING_BASE_URL at `baseUrl`; notify.js posts to `/emails` and
 * `/version1/messaging` respectively. Every call succeeds on the first attempt
 * so request counts equal send counts (no retry inflation).
 */
export async function startMockNotify() {
  const requests = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'POST' && req.url === '/emails') {
        res.statusCode = 201;
        res.end(JSON.stringify({ id: `mock-email-${requests.length}` }));
        return;
      }

      if (req.method === 'POST' && req.url === '/version1/messaging') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          SMSMessageData: {
            Message: 'Sent to 1/1 Total Cost: KES 0.8000',
            Recipients: [{ statusCode: 101, status: 'Success', cost: 'KES 0.8000', number: 'mock' }],
          },
        }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    emails: () => requests.filter((r) => r.url === '/emails'),
    sms: () => requests.filter((r) => r.url === '/version1/messaging'),
    reset: () => {
      requests.length = 0;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
