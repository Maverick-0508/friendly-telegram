import { store } from '../services/store.js';
import * as notify from '../services/notify.js';

const VALID_ORDER_STATUSES = new Set([
  'pending_confirmation',
  'incoming',
  'confirmed',
  'scheduled',
  'dispatched',
  'in_progress',
  'completed',
  'cancelled',
]);

function cleanText(value, maxLen = 250) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLen);
}

export async function verifyAdminToken(req, res) {
  return res.status(200).json({
    success: true,
    authorized: true,
    role: 'supervisor',
    message: 'Supervisor credentials verified.',
  });
}

export async function getAdminStats(_req, res, next) {
  try {
    const stats = await store.adminDashboardStats();
    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminWorkOrders(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status).trim() : 'all';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const orders = await store.listAllWorkOrders({ limit, status });
    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminWorkOrder(req, res, next) {
  try {
    const orderId = cleanText(req.params.orderId, 64);
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Order ID is required.', code: 'MISSING_ORDER_ID' },
      });
    }

    const order = await store.workOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { message: 'Work order not found.', code: 'ORDER_NOT_FOUND' },
      });
    }

    let invoice = null;
    if (order.invoice_id) {
      invoice = await store.invoiceById(order.invoice_id);
    }

    return res.status(200).json({
      success: true,
      order,
      invoice,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateAdminWorkOrder(req, res, next) {
  try {
    const orderId = cleanText(req.params.orderId, 64);
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Order ID is required.', code: 'MISSING_ORDER_ID' },
      });
    }

    const order = await store.workOrderById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: { message: 'Work order not found.', code: 'ORDER_NOT_FOUND' },
      });
    }

    const body = req.body || {};

    // Status transition
    if (body.status !== undefined && body.status !== null) {
      const newStatus = String(body.status).trim().toLowerCase();
      if (!VALID_ORDER_STATUSES.has(newStatus)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid order status. Must be one of: ${Array.from(VALID_ORDER_STATUSES).join(', ')}`,
            code: 'INVALID_STATUS',
          },
        });
      }
      order.status = newStatus;
      if (newStatus === 'completed' && !order.completed_at) {
        order.completed_at = new Date().toISOString();
      }
    }

    // Scheduling & Notes
    if (body.scheduled_date !== undefined) order.scheduled_date = cleanText(body.scheduled_date, 60);
    if (body.notes !== undefined) order.supervisor_notes = cleanText(body.notes, 500);

    // Crew assignment
    if (body.crew_name !== undefined) order.crew_name = cleanText(body.crew_name, 80);
    if (body.crew_lead !== undefined) order.crew_lead = cleanText(body.crew_lead, 80);
    if (body.crew_phone !== undefined) order.crew_phone = cleanText(body.crew_phone, 30);
    if (body.crew_vehicle !== undefined) order.crew_vehicle = cleanText(body.crew_vehicle, 60);

    // Live GPS telemetry for tracker
    if (body.crew_lat !== undefined && body.crew_lat !== null) {
      const lat = Number(body.crew_lat);
      if (Number.isFinite(lat)) order.crew_lat = lat;
    }
    if (body.crew_lng !== undefined && body.crew_lng !== null) {
      const lng = Number(body.crew_lng);
      if (Number.isFinite(lng)) order.crew_lng = lng;
    }

    // Live checklist
    if (Array.isArray(body.checklist)) {
      order.checklist = body.checklist.map((item) => ({
        task: cleanText(item?.task || item?.title || 'Service item', 120),
        status: ['pending', 'in_progress', 'completed'].includes(item?.status) ? item.status : 'pending',
        completed_at: item?.completed_at || (item?.status === 'completed' ? new Date().toISOString() : null),
      }));
    }

    order.updated_at = new Date().toISOString();
    await store.upsertWorkOrder(order);

    return res.status(200).json({
      success: true,
      message: 'Work order updated successfully.',
      order,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminInvoices(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status).trim() : 'all';
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

    const invoices = await store.listAllInvoices({ limit, status });
    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminPayments(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const payments = await store.listAllPayments({ limit });
    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminQuotes(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const quotes = await store.listAllQuotes({ limit });
    return res.status(200).json({
      success: true,
      count: quotes.length,
      quotes,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getAdminLeads(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const leads = await store.listAllLeads({ limit });
    return res.status(200).json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (err) {
    return next(err);
  }
}
