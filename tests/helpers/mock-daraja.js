import http from 'node:http';

/**
 * Starts a local HTTP server that emulates the subset of the Safaricom Daraja
 * API used by node-backend/services/mpesa.js (OAuth token + STK push +
 * STK push query).
 *
 * @param {object} [options]
 * @param {boolean} [options.pushShouldFail]  Make STK push return a 400.
 * @param {object} [options.queryResults]     Map CheckoutRequestID -> custom
 *   result ({ resultCode, receipt }). Unlisted checkouts default to a success
 *   result (receipt NLJ7RT61SV).
 */
export async function startMockDaraja({ pushShouldFail = false, queryResults = {} } = {}) {
  const requests = [];
  const queried = [];
  const checkoutCounter = { count: 0 };

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
        checkoutCounter.count += 1;
        res.end(
          JSON.stringify({
            MerchantRequestID: 'mock-merchant-id',
            CheckoutRequestID: 'ws_CO_mock_' + checkoutCounter.count,
            ResponseCode: '0',
            ResponseDescription: 'Success. Request accepted for processing',
            CustomerMessage: 'Success. Request accepted for processing',
          })
        );
        return;
      }

      if (req.url.startsWith('/mpesa/stkpushquery/v1/query')) {
        let checkoutId = '';
        try {
          checkoutId = JSON.parse(body).CheckoutRequestID || '';
        } catch {
          checkoutId = '';
        }
        queried.push(checkoutId);

        const configured = queryResults[checkoutId];
        const resultCode = configured ? String(configured.resultCode) : '0';
        const receipt = configured?.receipt || 'NLJ7RT61SV';

        const payload = {
          ResponseCode: '0',
          ResponseDescription: 'The service request has been accepted',
          MerchantRequestID: 'mock-merchant-id',
          CheckoutRequestID: checkoutId,
          ResultCode: resultCode,
          ResultDesc: resultCode === '0'
            ? 'The service request is processed successfully.'
            : (configured?.resultDesc || 'Request cancelled by user'),
        };

        if (resultCode === '0') {
          payload.CallbackMetadata = {
            Item: [
              { Name: 'Amount', Value: 12000 },
              { Name: 'MpesaReceiptNumber', Value: receipt },
              { Name: 'TransactionDate', Value: 20260101120000 },
              { Name: 'PhoneNumber', Value: 254700000000 },
            ],
          };
        }

        res.end(JSON.stringify(payload));
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
    queried,
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
