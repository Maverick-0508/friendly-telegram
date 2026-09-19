// Lipa Na M-Pesa STK push modal and payment status polling.
import { showToast } from './state.js';

export function openMpesaModal(invoiceId, amount, defaultPhone, { onPaid } = {}) {
  let modal = document.getElementById('mpesa-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mpesa-modal';
    modal.className = 'portal-modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="portal-modal-card">
      <button class="portal-modal-close" id="close-mpesa-modal">&times;</button>
      <div class="mpesa-header">
        <div class="mpesa-logo-badge">LIPA NA M-PESA</div>
        <h3>Settle Invoice via M-Pesa</h3>
        <p>An instant STK Push prompt will be sent to your mobile phone.</p>
      </div>

      <div class="mpesa-body" id="mpesa-body-step">
        <div class="mpesa-amount-display">
          <span class="currency">KES</span>
          <span class="figure">KSh ${Math.round(Number(amount)).toLocaleString()}</span>
        </div>
        <div class="form-group">
          <label for="mpesa-phone-input">M-Pesa Mobile Number</label>
          <input type="tel" id="mpesa-phone-input" class="form-control" value="${defaultPhone || ''}" placeholder="e.g. 0712 345 678 or 254712345678">
        </div>
        <button class="btn btn-mpesa-trigger" id="send-stk-btn">
          <i class="fa-solid fa-paper-plane"></i> Send STK PIN Prompt
        </button>
      </div>

      <div class="mpesa-status-view" id="mpesa-status-step" style="display: none;">
        <div class="stk-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>
        <h4>Check Your Phone!</h4>
        <p>A payment request was sent to <strong id="stk-sent-phone"></strong>. Enter your M-Pesa PIN on your handset to authorize the payment.</p>
        <p class="text-muted" style="font-size:0.85rem; margin-top:8px;">
          <i class="fa-solid fa-shield-halved"></i> Waiting for confirmation from Safaricom…
        </p>
      </div>

      <div class="mpesa-success-view" id="mpesa-success-step" style="display: none;">
        <div class="success-icon"><i class="fa-solid fa-circle-check"></i></div>
        <h4>Payment Confirmed!</h4>
        <p>M-Pesa Ref: <strong id="mpesa-receipt-code"></strong></p>
        <div class="modal-success-actions">
          <a href="/receipt/${invoiceId}" class="btn btn-primary btn-sm"><i class="fa-solid fa-receipt"></i> View Official Tax Receipt</a>
          <button class="btn btn-secondary btn-sm" id="finish-mpesa-modal">Close</button>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');

  // Close button
  document.getElementById('close-mpesa-modal').addEventListener('click', () => modal.classList.remove('active'));

  // Send STK Button
  document.getElementById('send-stk-btn').addEventListener('click', async () => {
    const phoneInput = document.getElementById('mpesa-phone-input').value.trim();
    if (!phoneInput) {
      showToast('Please enter your M-Pesa phone number', 'error');
      return;
    }

    document.getElementById('mpesa-body-step').style.display = 'none';
    const statusStep = document.getElementById('mpesa-status-step');
    statusStep.style.display = 'block';
    document.getElementById('stk-sent-phone').textContent = phoneInput;

    const resetForm = () => {
      statusStep.style.display = 'none';
      document.getElementById('mpesa-body-step').style.display = 'block';
    };

    try {
      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneInput,
          amount: Number(amount),
          invoice_id: invoiceId
        })
      });

      const data = await res.json();
      // A prompt for this invoice is already on the customer's phone: resume
      // polling that checkout instead of sending a second prompt.
      const checkoutId = data.checkout_request_id;
      if (!data.success && !(data.error?.code === 'PAYMENT_IN_PROGRESS' && checkoutId)) {
        throw new Error(data.error?.message || 'STK Push failed');
      }

      if (!checkoutId) {
        throw new Error('The payment provider did not return a checkout reference.');
      }

      const result = await pollMpesaStatus(checkoutId);
      if (result.status === 'success') {
        statusStep.style.display = 'none';
        const successStep = document.getElementById('mpesa-success-step');
        successStep.style.display = 'block';
        document.getElementById('mpesa-receipt-code').textContent = result.mpesa_receipt || '—';
        if (typeof window.DashboardOnboarding !== 'undefined') {
          window.DashboardOnboarding.setCompleted('add-payment', true);
        }
        if (result.invoice_status === 'partially_paid') {
          showToast(`M-Pesa confirmed KSh ${Math.round(Number(result.amount_paid || 0)).toLocaleString()}. KSh ${Math.round(Number(result.invoice_balance_due || 0)).toLocaleString()} is still outstanding.`, 'error');
        } else {
          showToast('Payment confirmed by M-Pesa! Your invoice is marked paid.', 'success');
        }
        if (typeof onPaid === 'function') onPaid();
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        resetForm();
        showToast(result.result_desc || 'M-Pesa payment was not completed. Please try again.', 'error');
      } else {
        resetForm();
        showToast('Payment is still pending. If you completed the prompt it will reflect shortly.', 'error');
      }
    } catch (err) {
      resetForm();
      showToast(err.message || 'M-Pesa transaction failed', 'error');
    }
  });

  async function pollMpesaStatus(checkoutId, { attempts = 40, intervalMs = 3000 } = {}) {
    for (let i = 0; i < attempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const res = await fetch(`/api/mpesa/status/${encodeURIComponent(checkoutId)}`);
        const json = await res.json();
        if (json.success && json.data && json.data.status !== 'pending') {
          return json.data;
        }
      } catch {
        // Transient network error; keep polling until attempts are exhausted.
      }
    }
    return { status: 'pending' };
  }

  const finishBtn = document.getElementById('finish-mpesa-modal');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => modal.classList.remove('active'));
  }
}

// Open "My Lawn / Client Access" Modal
