// In-memory ERP database for Lawn Craft Client Hub & Dispatch
const clients = new Map();
const workOrders = new Map();
const invoices = new Map();
const quotes = new Map();

// Helper to normalize phone / email
function normalizeIdentifier(raw) {
  if (!raw) return '';
  const str = String(raw).trim().toLowerCase();
  // If it's an email
  if (str.includes('@')) return str;
  // If phone, strip non-digits
  const digits = str.replace(/\D/g, '');
  // Standardize 2547XXXXXXXX or 07XXXXXXXX
  if (digits.startsWith('254') && digits.length === 12) {
    return '0' + digits.slice(3);
  }
  return digits;
}

// Seed initial ERP data
function seedInitialData() {
  // Client 1: Sarah Wanjiru (Active crew on-site & unpaid bill demo)
  const sarah = {
    id: 'cl_sarah_001',
    name: 'Sarah Wanjiru',
    phone: '0712345678',
    email: 'sarah.wanjiru@example.com',
    address: '42 Karen Country Club Lane, Karen, Nairobi',
    property_size: 8500,
    grass_type: 'Kikuyu Grass (Fine Cut)',
    service_plan: 'Bi-Weekly Precision Care',
    customer_since: 'March 2024',
    loyalty: {
      points_balance: 340,
      tier: 'Gold',
      rate_per_point: 0.50,
      dollar_value: 170.00,
      referral_code: 'LAWN-SARAH-42',
      next_tier: 'Platinum',
      points_to_next_tier: 160
    }
  };

  // Client 2: David Kimani (Platinum VIP with upcoming scheduled visit)
  const david = {
    id: 'cl_david_002',
    name: 'David Kimani',
    phone: '0722334455',
    email: 'david.kimani@runda.co.ke',
    address: '18 Runda Mimosa Ridge, Runda, Nairobi',
    property_size: 14000,
    grass_type: 'Bermuda Tifway 419',
    service_plan: 'Weekly Estate Management',
    customer_since: 'January 2023',
    loyalty: {
      points_balance: 780,
      tier: 'Platinum',
      rate_per_point: 0.50,
      dollar_value: 390.00,
      referral_code: 'LAWN-DAVID-18',
      next_tier: 'Diamond VIP',
      points_to_next_tier: 220
    }
  };

  // Client 3: Elena Gomez (Bronze client with fresh quote)
  const elena = {
    id: 'cl_elena_003',
    name: 'Elena Gomez',
    phone: '0733445566',
    email: 'elena.gomez@gmail.com',
    address: '7 Wood Avenue, Kilimani, Nairobi',
    property_size: 4200,
    grass_type: 'Paspalum Notatum',
    service_plan: 'Monthly Seasonal Care',
    customer_since: 'July 2025',
    loyalty: {
      points_balance: 140,
      tier: 'Bronze',
      rate_per_point: 0.50,
      dollar_value: 70.00,
      referral_code: 'LAWN-ELENA-07',
      next_tier: 'Silver',
      points_to_next_tier: 110
    }
  };

  clients.set('0712345678', sarah);
  clients.set('sarah.wanjiru@example.com', sarah);
  clients.set(sarah.id, sarah);

  clients.set('0722334455', david);
  clients.set('david.kimani@runda.co.ke', david);
  clients.set(david.id, david);

  clients.set('0733445566', elena);
  clients.set('elena.gomez@gmail.com', elena);
  clients.set(elena.id, elena);

  // Work Orders for Sarah
  const wo1 = {
    id: 'wo_902',
    client_id: sarah.id,
    client_name: sarah.name,
    title: 'Bi-Weekly Precision Mowing & Perimeter Trimming',
    service_type: 'Precision Lawn Mowing',
    status: 'in_progress', // triggers Crew On-Site pulsing badge
    scheduled_date: 'Today, 10:30 AM',
    total_price: 45.00,
    crew_name: 'Alpha Crew (Lead: Jackson M.)',
    crew_lead: 'Jackson Mwangi',
    crew_phone: '+254 700 889911',
    crew_vehicle: 'Toyota Hilux - Reg: KDG 892A',
    crew_members: ['Jackson M. (Lead Specialist)', 'David K. (Mower Operator)', 'Peter O. (Edging & Blower)'],
    crew_lat: -1.3195,
    crew_lng: 36.7082,
    property_lat: -1.3198,
    property_lng: 36.7085,
    eta_minutes: 6,
    started_at: '10:32 AM',
    notes: 'Front gate code #4210 provided. Guard briefed on team arrival.',
    checklist: [
      { task: 'Perimeter Boundary & Obstacle Check', status: 'completed', time: '10:35 AM' },
      { task: 'Border Edging & Concrete Trimming', status: 'completed', time: '10:48 AM' },
      { task: 'Rotary Precision Cut (Height: 2.5 inches)', status: 'in_progress', time: 'Active' },
      { task: 'Cuttings Vacuuming & Bagging', status: 'pending', time: 'Scheduled' },
      { task: 'Blower Cleanup for Pathways & Driveway', status: 'pending', time: 'Scheduled' }
    ]
  };

  const wo2 = {
    id: 'wo_889',
    client_id: sarah.id,
    client_name: sarah.name,
    title: 'Seasonal Deep Core Aeration & Bio-Fertilization',
    service_type: 'Soil & Turf Nutrition',
    status: 'scheduled',
    scheduled_date: 'Sep 15, 2026, 09:00 AM',
    total_price: 85.00,
    crew_name: 'Eco-Care Special Ops Team',
    crew_lead: 'Martin Njoroge',
    crew_phone: '+254 700 889922',
    checklist: [
      { task: 'Turf Moisture Testing', status: 'pending' },
      { task: 'Hollow Tine Mechanical Aeration', status: 'pending' },
      { task: 'Organic Slow-Release Fertilizer Application', status: 'pending' }
    ]
  };

  const wo3 = {
    id: 'wo_840',
    client_id: sarah.id,
    client_name: sarah.name,
    title: 'End-of-Month Hedge Trimming & Mulch Replenishment',
    service_type: 'Hedge & Shrub Care',
    status: 'completed',
    scheduled_date: 'Aug 22, 2026',
    total_price: 65.00,
    completed_at: '2026-08-22 12:45 PM',
    crew_name: 'Alpha Crew'
  };

  workOrders.set(wo1.id, wo1);
  workOrders.set(wo2.id, wo2);
  workOrders.set(wo3.id, wo3);

  // Invoices for Sarah
  const inv1 = {
    id: 'inv_1042',
    invoice_number: 'INV-2026-1042',
    client_id: sarah.id,
    client_name: sarah.name,
    client_phone: sarah.phone,
    client_email: sarah.email,
    client_address: sarah.address,
    service_title: 'Bi-Weekly Precision Care & Hedge Trim',
    total_amount: 95.00,
    balance_due: 95.00,
    status: 'unpaid',
    issue_date: '2026-09-01',
    due_date: '2026-09-10',
    subtotal: 81.90,
    tax_vat: 13.10,
    pin_number: 'P051239841K',
    items: [
      { description: 'Precision Lawn Mowing (8,500 sq ft)', quantity: 1, unit_price: 65.00, amount: 65.00 },
      { description: 'Perimeter Hedge Shaping & Green Waste Removal', quantity: 1, unit_price: 30.00, amount: 30.00 }
    ]
  };

  const inv2 = {
    id: 'inv_1018',
    invoice_number: 'INV-2026-1018',
    client_id: sarah.id,
    client_name: sarah.name,
    client_phone: sarah.phone,
    client_email: sarah.email,
    client_address: sarah.address,
    service_title: 'Turf Conditioning & Weed Treatment',
    total_amount: 120.00,
    balance_due: 0.00,
    status: 'paid',
    issue_date: '2026-08-15',
    due_date: '2026-08-25',
    paid_at: '2026-08-23 14:10 EAT',
    payment_method: 'Lipa Na M-Pesa (Till 789210)',
    mpesa_receipt: 'QKJ82910TX',
    subtotal: 103.45,
    tax_vat: 16.55,
    pin_number: 'P051239841K',
    items: [
      { description: 'Turf Aeration & Organic Treatment', quantity: 1, unit_price: 120.00, amount: 120.00 }
    ]
  };

  invoices.set(inv1.id, inv1);
  invoices.set(inv2.id, inv2);

  // Quotes for Sarah
  const qt1 = {
    id: 'qt_501',
    quote_number: 'QT-2026-0501',
    client_id: sarah.id,
    title: 'Automated Smart Sprinkler Zone Optimization',
    status: 'approved',
    total_amount: 180.00,
    items: [
      { description: 'Rain Bird Rotor Head Replacement (4 Units)', amount: 100.00 },
      { description: 'Smart Rain Sensor Controller Setup', amount: 80.00 }
    ],
    created_at: '2026-08-15'
  };
  quotes.set(qt1.id, qt1);

  // Work order for David
  const woDavid = {
    id: 'wo_915',
    client_id: david.id,
    client_name: david.name,
    title: 'Weekly Estate Mowing & Green Waste Removal',
    service_type: 'Estate Maintenance',
    status: 'scheduled',
    scheduled_date: 'Tomorrow, 08:30 AM',
    total_price: 90.00,
    crew_name: 'Delta Precision Team (Lead: Samuel W.)',
    crew_lead: 'Samuel Wambua',
    crew_phone: '+254 711 223344',
    crew_vehicle: 'Isuzu D-Max - Reg: KDJ 402B',
    crew_members: ['Samuel W.', 'Ken N.', 'Boniface M.'],
    checklist: [
      { task: 'Perimeter Trimming', status: 'pending' },
      { task: 'Wide-Deck Mowing (14,000 sq ft)', status: 'pending' },
      { task: 'Blow & Detail', status: 'pending' }
    ]
  };
  workOrders.set(woDavid.id, woDavid);
}

// Run seed immediately
seedInitialData();

// Lookup Client by Phone or Email
export async function lookupClient(req, res) {
  try {
    const rawIdentifier = req.body?.identifier || req.query?.identifier || '';
    const normalized = normalizeIdentifier(rawIdentifier);

    if (!normalized) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number or email is required.', code: 'IDENTIFIER_REQUIRED' }
      });
    }

    let client = clients.get(normalized) || clients.get(rawIdentifier.trim().toLowerCase());

    // If client not directly found by key, search in values
    if (!client) {
      for (const c of clients.values()) {
        if (
          normalizeIdentifier(c.phone) === normalized ||
          (c.email && c.email.toLowerCase() === rawIdentifier.trim().toLowerCase())
        ) {
          client = c;
          break;
        }
      }
    }

    // If still not found, create an active personalized record so any user phone can test
    if (!client) {
      const isEmail = rawIdentifier.includes('@');
      const generatedName = isEmail 
        ? rawIdentifier.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : 'Valued Client';
      const cleanPhone = isEmail ? '07' + Math.floor(10000000 + Math.random() * 90000000) : rawIdentifier;
      const cleanEmail = isEmail ? rawIdentifier.trim().toLowerCase() : `client.${cleanPhone.slice(-4)}@lawncraft.co.ke`;

      client = {
        id: 'cl_dyn_' + Date.now().toString(36),
        name: generatedName,
        phone: cleanPhone,
        email: cleanEmail,
        address: 'Nairobi Resident Property',
        property_size: 5000,
        grass_type: 'Kikuyu Turf',
        service_plan: 'On-Demand Care',
        customer_since: 'New Client',
        loyalty: {
          points_balance: 50,
          tier: 'Bronze',
          rate_per_point: 0.50,
          dollar_value: 25.00,
          referral_code: 'LAWN-' + (cleanPhone.slice(-4) || 'GIFT'),
          next_tier: 'Silver',
          points_to_next_tier: 200
        }
      };
      // Save for subsequent calls in current session
      clients.set(normalized, client);
      clients.set(client.phone, client);
      if (client.email) clients.set(client.email, client);
    }

    // Gather client work orders (match by client ID or normalized phone/email)
    const clientWorkOrders = Array.from(workOrders.values())
      .filter(w => (
        (client.id && w.client_id === client.id) ||
        (w.client_phone && normalizeIdentifier(w.client_phone) === normalized) ||
        (w.client_email && client.email && w.client_email.toLowerCase() === client.email.toLowerCase())
      ))
      .sort((a, b) => (a.status === 'in_progress' ? -1 : 1));

    // Gather client invoices (match by client ID or normalized phone/email)
    const clientInvoices = Array.from(invoices.values())
      .filter(i => (
        (client.id && i.client_id === client.id) ||
        (i.client_phone && normalizeIdentifier(i.client_phone) === normalized) ||
        (i.client_email && client.email && i.client_email.toLowerCase() === client.email.toLowerCase())
      ))
      .sort((a, b) => (a.status === 'unpaid' ? -1 : 1));

    // Gather client quotes (match by client ID or normalized phone/email)
    const clientQuotes = Array.from(quotes.values())
      .filter(q => (
        (client.id && q.client_id === client.id) ||
        (q.phone && normalizeIdentifier(q.phone) === normalized) ||
        (q.email && client.email && q.email.toLowerCase() === client.email.toLowerCase())
      ));

    return res.status(200).json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        address: client.address,
        property_size: client.property_size,
        grass_type: client.grass_type,
        service_plan: client.service_plan,
        customer_since: client.customer_since
      },
      loyalty: client.loyalty,
      work_orders: clientWorkOrders,
      invoices: clientInvoices,
      quotes: clientQuotes
    });
  } catch (err) {
    console.error('[lookupClient Error]', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve client profile.', code: 'LOOKUP_FAILED' }
    });
  }
}

// 1-Click Work Order Booking (Seamless Add-on or Anonymous Booking)
export async function createWorkOrder(req, res) {
  try {
    const payload = req.body || {};
    const serviceType = payload.service_type || payload.title || 'Lawn Care Service';
    const clientName = payload.client_name || payload.name || 'Valued Client';
    const clientPhone = payload.phone || payload.client_phone || '0700000000';
    const clientEmail = payload.email || payload.client_email || '';
    const address = payload.address || 'Client Address on File';
    const propertySize = Number(payload.property_size) || 5000;
    const price = Number(payload.price || payload.total_price || 65);
    let clientId = payload.client_id || null;

    const normPhone = normalizeIdentifier(clientPhone);

    // If no client_id was supplied, look up or create client automatically
    if (!clientId && normPhone) {
      let matchedClient = clients.get(normPhone);
      if (!matchedClient && clientEmail) {
        matchedClient = clients.get(clientEmail.toLowerCase().trim());
      }

      if (matchedClient) {
        clientId = matchedClient.id;
      } else {
        const isEmail = clientEmail.includes('@');
        const newClient = {
          id: 'cl_dyn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name: clientName,
          phone: clientPhone,
          email: clientEmail || `client.${normPhone.slice(-4)}@lawncraft.co.ke`,
          address: address,
          property_size: propertySize,
          grass_type: 'Kikuyu Turf',
          service_plan: 'On-Demand Care',
          customer_since: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          loyalty: {
            points_balance: 75, // initial bonus + order reward
            tier: 'Bronze',
            rate_per_point: 0.50,
            dollar_value: 37.50,
            referral_code: 'LAWN-' + (normPhone.slice(-4) || 'GIFT'),
            next_tier: 'Silver',
            points_to_next_tier: 175
          }
        };
        clients.set(normPhone, newClient);
        clients.set(newClient.id, newClient);
        if (newClient.email) clients.set(newClient.email.toLowerCase(), newClient);
        clientId = newClient.id;
      }
    }

    const newOrderId = 'wo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const invoiceId = 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    
    const workOrder = {
      id: newOrderId,
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      title: `${serviceType} - ${clientName}`,
      service_type: serviceType,
      status: payload.status || 'incoming', // 'incoming' feeds supervisor dispatch queue
      scheduled_date: payload.scheduled_date || 'Scheduled for Next Available Slot (within 48 hrs)',
      total_price: price,
      property_size: propertySize,
      address,
      invoice_id: invoiceId,
      notes: payload.notes || 'Booked directly via Lawn Craft Client Portal',
      created_at: new Date().toISOString(),
      crew_name: 'Pending Supervisor Dispatch',
      checklist: [
        { task: 'Site Inspection & Safety Sweep', status: 'pending' },
        { task: serviceType, status: 'pending' },
        { task: 'Site Cleanup & Customer Signoff', status: 'pending' }
      ]
    };

    workOrders.set(workOrder.id, workOrder);

    // Auto-generate invoice for client convenience and immediate payment
    const subtotal = Math.round((price / 1.16) * 100) / 100;
    const taxVat = Math.round((price - subtotal) * 100) / 100;
    const invoiceRecord = {
      id: invoiceId,
      invoice_number: 'INV-2026-' + Math.floor(1000 + Math.random() * 9000),
      client_id: clientId,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      client_address: address,
      service_title: serviceType,
      total_amount: price,
      balance_due: price,
      status: 'unpaid',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      subtotal,
      tax_vat: taxVat,
      pin_number: 'P051239841K',
      items: [
        { description: `${serviceType} (${propertySize.toLocaleString()} sq ft)`, quantity: 1, unit_price: price, amount: price }
      ]
    };
    invoices.set(invoiceId, invoiceRecord);

    // If existing client, reward loyalty points (+25 pts)
    if (clientId && clients.has(clientId)) {
      const client = clients.get(clientId);
      if (client.loyalty) {
        client.loyalty.points_balance += 25;
        client.loyalty.dollar_value = client.loyalty.points_balance * client.loyalty.rate_per_point;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Work order scheduled successfully and added to dispatch queue.',
      data: workOrder,
      invoice: invoiceRecord
    });
  } catch (err) {
    console.error('[createWorkOrder Error]', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to create work order.', code: 'CREATE_WORK_ORDER_FAILED' }
    });
  }
}

// Get Single Work Order (for live GPS tracker)
export async function getWorkOrder(req, res) {
  try {
    const { orderId } = req.params;
    const order = workOrders.get(orderId);

    if (!order) {
      // Fallback demo order for tracker preview
      return res.status(200).json({
        success: true,
        data: {
          id: orderId,
          title: 'Precision Mowing & Edge Detailing',
          service_type: 'Precision Lawn Mowing',
          status: 'in_progress',
          scheduled_date: 'Today, 10:30 AM',
          total_price: 45.00,
          crew_name: 'Alpha Crew (Lead: Jackson M.)',
          crew_lead: 'Jackson Mwangi',
          crew_phone: '+254 700 889911',
          crew_vehicle: 'Toyota Hilux - Reg: KDG 892A',
          crew_members: ['Jackson M. (Lead Specialist)', 'David K.', 'Peter O.'],
          crew_lat: -1.3195,
          crew_lng: 36.7082,
          property_lat: -1.3198,
          property_lng: 36.7085,
          eta_minutes: 5,
          notes: 'Team is active on-site.',
          checklist: [
            { task: 'Perimeter Boundary Inspection', status: 'completed', time: '10:35 AM' },
            { task: 'Border Edging & Trimming', status: 'completed', time: '10:48 AM' },
            { task: 'Rotary Precision Cut', status: 'in_progress', time: 'Active Now' },
            { task: 'Clippings Vacuuming', status: 'pending', time: 'Scheduled' },
            { task: 'Site Cleanup & Leaf Blowing', status: 'pending', time: 'Scheduled' }
          ]
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch work order.', code: 'WORK_ORDER_FETCH_FAILED' }
    });
  }
}

// Lipa Na M-Pesa STK Push
export async function stkPushMpesa(req, res) {
  try {
    const { phone, amount, invoice_id, account_reference } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: { message: 'M-Pesa phone number is required.', code: 'PHONE_REQUIRED' }
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const checkoutRequestId = 'ws_CO_' + Date.now().toString() + '_' + Math.random().toString(36).slice(2, 6);
    const mpesaReceipt = 'NLM' + Math.floor(10000000 + Math.random() * 90000000).toString() + 'X';

    // If an invoice is associated, mark it paid
    if (invoice_id && invoices.has(invoice_id)) {
      const inv = invoices.get(invoice_id);
      inv.status = 'paid';
      inv.balance_due = 0.00;
      inv.paid_at = new Date().toISOString();
      inv.payment_method = `Lipa Na M-Pesa (${cleanPhone})`;
      inv.mpesa_receipt = mpesaReceipt;
    }

    return res.status(200).json({
      success: true,
      message: `STK Push initiated successfully to ${phone}. Please enter your M-Pesa PIN on your handset.`,
      checkout_request_id: checkoutRequestId,
      mpesa_receipt: mpesaReceipt,
      amount: amount || 95.00,
      account_reference: account_reference || 'LAWNCRAFT'
    });
  } catch (err) {
    console.error('[stkPushMpesa Error]', err);
    return res.status(500).json({
      success: false,
      error: { message: 'M-Pesa transaction processing failed.', code: 'MPESA_FAILED' }
    });
  }
}

// Get Single Invoice for Payment or Receipt
export async function getInvoice(req, res) {
  try {
    const { invoiceId } = req.params;
    let inv = invoices.get(invoiceId);

    if (!inv) {
      // Fallback demo invoice
      inv = {
        id: invoiceId,
        invoice_number: 'INV-2026-' + invoiceId.replace(/\D/g, '').padStart(4, '0'),
        client_name: 'Sarah Wanjiru',
        client_phone: '0712345678',
        client_email: 'sarah.wanjiru@example.com',
        client_address: '42 Karen Country Club Lane, Karen, Nairobi',
        service_title: 'Bi-Weekly Precision Care & Hedge Trim',
        total_amount: 95.00,
        balance_due: 95.00,
        status: 'unpaid',
        issue_date: '2026-09-01',
        due_date: '2026-09-10',
        subtotal: 81.90,
        tax_vat: 13.10,
        pin_number: 'P051239841K',
        items: [
          { description: 'Precision Lawn Mowing (8,500 sq ft)', quantity: 1, unit_price: 65.00, amount: 65.00 },
          { description: 'Hedge Shaping & Debris Disposal', quantity: 1, unit_price: 30.00, amount: 30.00 }
        ]
      };
      invoices.set(invoiceId, inv);
    }

    return res.status(200).json({
      success: true,
      data: inv
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve invoice.', code: 'INVOICE_FETCH_FAILED' }
    });
  }
}

// Settle Invoice (Card or Manual simulation)
export async function settleInvoice(req, res) {
  try {
    const { invoiceId } = req.params;
    const { payment_method, card_last4 } = req.body || {};

    let inv = invoices.get(invoiceId);
    if (!inv) {
      inv = {
        id: invoiceId,
        invoice_number: 'INV-2026-' + invoiceId.replace(/\D/g, '').padStart(4, '0'),
        total_amount: 95.00,
        balance_due: 95.00,
        status: 'unpaid',
        items: [{ description: 'Lawn Care Service', quantity: 1, unit_price: 95.00, amount: 95.00 }]
      };
      invoices.set(invoiceId, inv);
    }

    inv.status = 'paid';
    inv.balance_due = 0.00;
    inv.paid_at = new Date().toISOString();
    inv.payment_method = payment_method || (card_last4 ? `Card (•••• ${card_last4})` : 'Instant Online Payment');
    inv.mpesa_receipt = 'TX_' + Math.floor(10000000 + Math.random() * 90000000).toString();

    return res.status(200).json({
      success: true,
      message: 'Invoice settled successfully. Official tax receipt generated.',
      data: inv
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: 'Payment settlement failed.', code: 'SETTLEMENT_FAILED' }
    });
  }
}

// Coupon Validator
export async function validateCoupon(req, res) {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const orderAmount = Number(req.body?.amount || 100);

    const validCoupons = {
      'SPRING20': { type: 'percent', value: 20, desc: '20% Spring Refresh Discount' },
      'FIRSTCUT': { type: 'fixed', value: 15, desc: '$15 Off Your First Lawn Cut' },
      'VIPLAWN': { type: 'percent', value: 15, desc: '15% Loyalty Member Perks' },
      'GREEN50': { type: 'fixed', value: 50, minAmount: 150, desc: '$50 Off Orders Over $150' },
      'KAREN10': { type: 'percent', value: 10, desc: '10% Karen & Runda Neighborhood Special' }
    };

    const coupon = validCoupons[code];

    if (!coupon) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid promo code. Try SPRING20 or FIRSTCUT.',
        code: 'INVALID_COUPON'
      });
    }

    if (coupon.minAmount && orderAmount < coupon.minAmount) {
      return res.status(400).json({
        valid: false,
        message: `Promo code ${code} requires a minimum order of $${coupon.minAmount}.`,
        code: 'MIN_ORDER_NOT_MET'
      });
    }

    let discountAmount = 0;
    if (coupon.type === 'percent') {
      discountAmount = Math.round((orderAmount * (coupon.value / 100)) * 100) / 100;
    } else {
      discountAmount = Math.min(coupon.value, orderAmount);
    }

    const finalAmount = Math.max(0, Math.round((orderAmount - discountAmount) * 100) / 100);

    return res.status(200).json({
      valid: true,
      code,
      discount_type: coupon.type,
      discount_value: coupon.value,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      description: coupon.desc,
      message: `Success! ${coupon.desc} applied.`
    });
  } catch (err) {
    return res.status(500).json({
      valid: false,
      message: 'Failed to validate promo code.',
      code: 'VALIDATION_ERROR'
    });
  }
}

// Register Quote from Forms into Portal Store
export function registerQuoteInPortal(quoteData) {
  try {
    const rawPhone = quoteData.phone || '';
    const normPhone = normalizeIdentifier(rawPhone);
    const clientName = quoteData.full_name || quoteData.name || 'Valued Client';
    const clientEmail = quoteData.email || '';
    const serviceType = quoteData.service_type || quoteData.service || 'Precision Lawn Care';

    let client = normPhone ? clients.get(normPhone) : null;
    if (!client && clientEmail) {
      client = clients.get(clientEmail.toLowerCase().trim());
    }

    if (!client && normPhone) {
      client = {
        id: 'cl_dyn_' + Date.now().toString(36),
        name: clientName,
        phone: rawPhone,
        email: clientEmail,
        address: quoteData.address || 'Nairobi Area',
        property_size: Number(quoteData.property_size) || 5000,
        grass_type: 'Kikuyu Turf',
        service_plan: 'Custom Care',
        customer_since: 'New Client',
        loyalty: {
          points_balance: 50,
          tier: 'Bronze',
          rate_per_point: 0.50,
          dollar_value: 25.00,
          referral_code: 'LAWN-' + (normPhone.slice(-4) || 'GIFT'),
          next_tier: 'Silver',
          points_to_next_tier: 200
        }
      };
      clients.set(normPhone, client);
      clients.set(client.id, client);
      if (clientEmail) clients.set(clientEmail.toLowerCase(), client);
    }

    const quoteId = quoteData.id || ('qt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
    const estimatedPrice = Number(quoteData.property_size) ? Math.max(35, Math.round(Number(quoteData.property_size) * 0.008)) : 65.00;

    const newQuote = {
      id: quoteId,
      quote_number: 'QT-2026-' + Math.floor(1000 + Math.random() * 9000),
      client_id: client ? client.id : null,
      client_name: clientName,
      phone: rawPhone,
      email: clientEmail,
      title: `${serviceType} Consultation & Estimate`,
      status: 'pending_review',
      total_amount: estimatedPrice,
      address: quoteData.address || '',
      property_size: quoteData.property_size || null,
      property_type: quoteData.property_type || '',
      service_type: serviceType,
      service_frequency: quoteData.service_frequency || 'Bi-Weekly',
      preferred_start_date: quoteData.preferred_start_date || null,
      additional_details: quoteData.additional_details || quoteData.message || '',
      created_at: quoteData.created_at || new Date().toISOString(),
      items: [
        { description: `${serviceType} - Site Survey & Initial Cut`, amount: estimatedPrice }
      ]
    };

    quotes.set(quoteId, newQuote);
    return newQuote;
  } catch (err) {
    console.error('[registerQuoteInPortal Error]', err);
    return null;
  }
}

// ERP / Portal statistics for system diagnostics
export function getPortalStats() {
  return {
    total_clients: clients.size,
    total_work_orders: workOrders.size,
    total_invoices: invoices.size,
    total_quotes: quotes.size,
    active_in_progress_crews: Array.from(workOrders.values()).filter(w => w.status === 'in_progress').length,
    unpaid_invoices: Array.from(invoices.values()).filter(i => i.status === 'unpaid').length
  };
}
