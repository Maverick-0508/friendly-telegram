import http from 'node:http';

/**
 * Starts a local HTTP server that emulates the subset of the Safaricom Daraja
 * API used by node-backend/services/mpesa.js (OAuth token + STK push).
 */
export async function startMockDaraja({ pushShouldFail = false } = {}) {
  const requests = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.setHeader('Content-Type', 'application/json');

      if (req.url.startsWith('/oauth/v1/generate')) {
        res.end(JSON.stringify({ access_token: 'mock-access-token', expires_in: '3599' }));
        return;
      }

      if (req.url.startsWith('/mpesa/stkpush/v1/processrequest')) {
        if (pushShouldFail) {
          res.statusCode = 400;
          res.end(JSON.stringify({ errorMessage: 'Bad Request', ResponseCode: '1' }));
          return;
        }
        res.end(
          JSON.stringify({
            MerchantRequestID: 'mock-merchant-id',
            CheckoutRequestID: 'ws_CO_mock_' + requests.length,
            ResponseCode: '0',
            ResponseDescription: 'Success. Request accepted for processing',
            CustomerMessage: 'Success. Request accepted for processing',
          })
        );
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
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Build a Safaricom STK callback payload for a checkout request. */
export function buildCallbackPayload({
  checkoutRequestId,
  resultCode = 0,
  resultDesc = 'The service request is processed successfully.',
  receipt = 'NLJ7RT61SV',
  amount = 100,
  phone = '254708374149',
} = {}) {
  const payload = {
    Body: {
      stkCallback: {
        MerchantRequestID: 'mock-merchant-id',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: resultDesc,
      },
    },
  };

  if (resultCode === 0) {
    payload.Body.stkCallback.CallbackMetadata = {
      Item: [
        { Name: 'Amount', Value: amount },
        { Name: 'MpesaReceiptNumber', Value: receipt },
        { Name: 'TransactionDate', Value: 20260101120000 },
        { Name: 'PhoneNumber', Value: phone },
      ],
    };
  }

  return payload;
}
