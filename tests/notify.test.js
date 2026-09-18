import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, sendSms } from '../node-backend/services/notify.js';

test.before(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.NOTIFY_FROM_EMAIL;
  delete process.env.OWNER_EMAIL;
  delete process.env.AFRICAS_TALKING_USERNAME;
  delete process.env.AFRICAS_TALKING_API_KEY;
  delete process.env.AFRICAS_TALKING_SENDER;
});

test('sendEmail is a safe no-op when email is not configured', async () => {
  const result = await sendEmail({
    to: 'manager@example.com',
    subject: 'Test',
    html: '<p>hi</p>',
  });
  assert.equal(result, null);
});

test('sendSms is a safe no-op when SMS is not configured', async () => {
  const result = await sendSms({
    to: '+254700111222',
    message: 'Test message',
  });
  assert.equal(result, null);
});