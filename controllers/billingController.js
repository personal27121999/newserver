const Bill        = require('../models/Bill');
const Product     = require('../models/Product');
const Customer    = require('../models/Customer');
const Notification = require('../models/Notification');
const { emitToAdmin } = require('../socket/socketManager');

/* ── Safe number parser — never returns NaN ────── */
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ── Determine payment status from paid vs total ── */
const getPaymentStatus = (paid, total) => {
  // Use a tiny epsilon to avoid floating-point edge cases (e.g. 99.999999 vs 100)
  const EPS = 0.005;
  if (paid >= total - EPS) return 'paid';
  if (paid > 0)            return 'partial';
  return 'unpaid';
};

/* ── helper: recalculate & validate bill totals ── */
const calcBill = (items, discountType, discountValue, amountPaid) => {
  let subtotal  = 0;
  let taxAmount = 0;

  const calcItems = items.map(item => {
    const mrp     = num(item.mrp);
    const qty     = num(item.quantity);
    const discPct = num(item.discountPct);
    const taxPct  = num(item.taxPct);

    const discAmt   = parseFloat(((mrp * discPct) / 100).toFixed(2));
    const rate      = parseFloat((mrp - discAmt).toFixed(2));
    const lineTotal = parseFloat((rate * qty).toFixed(2));
    const taxAmt    = parseFloat(((lineTotal * taxPct) / 100).toFixed(2));

    subtotal  += lineTotal;
    taxAmount += taxAmt;

    return {
      ...item,
      mrp, qty, rate,
      discountAmt: discAmt,
      discountPct: discPct,
      taxPct, taxAmt,
      quantity: qty,
      subtotal: lineTotal
    };
  });

  subtotal  = parseFloat(subtotal.toFixed(2));
  taxAmount = parseFloat(taxAmount.toFixed(2));

  // Overall discount — never NaN
  const discVal = num(discountValue);
  let discountAmount = 0;
  if (discountType === 'flat')    discountAmount = parseFloat(discVal.toFixed(2));
  if (discountType === 'percent') discountAmount = parseFloat(((subtotal * discVal) / 100).toFixed(2));
  // Clamp discount so it never exceeds subtotal (avoids negative totals)
  discountAmount = Math.min(discountAmount, subtotal);

  const beforeRound  = subtotal - discountAmount + taxAmount;
  const rounded      = Math.round(beforeRound);
  const roundOff     = parseFloat((rounded - beforeRound).toFixed(2));
  const totalAmount  = Math.max(0, rounded);

  const paid         = num(amountPaid);
  const changeReturn = parseFloat((paid - totalAmount).toFixed(2));

  return { calcItems, subtotal, taxAmount, discountAmount, roundOff, totalAmount, changeReturned: Math.max(0, changeReturn) };
};

/* ── GET /api/billing  ─────────────────────────── */
const getBills = async (req, res) => {
  try {
    const { page=1, limit=20, search, paymentStatus, dateFrom, dateTo } = req.query;
    const q = {};
    if (search) q.$or = [
      { billNumber:   { $regex: search, $options: 'i' } },
      { customerName: { $regex: search, $options: 'i' } },
      { customerPhone:{ $regex: search, $options: 'i' } }
    ];
    if (paymentStatus) q.paymentStatus = paymentStatus;
    if (dateFrom || dateTo) {
      q.createdAt = {};
      if (dateFrom) q.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   q.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [bills, total] = await Promise.all([
      Bill.find(q).sort({ createdAt:-1 }).skip(skip).limit(parseInt(limit)).populate('customer','name phone'),
      Bill.countDocuments(q)
    ]);
    res.json({ success:true, data:bills, pagination:{ page:parseInt(page), limit:parseInt(limit), total, pages:Math.ceil(total/parseInt(limit)) } });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

/* ── GET /api/billing/:id ──────────────────────── */
const getBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate('customer','name phone email');
    if (!bill) return res.status(404).json({ success:false, message:'Bill not found' });
    res.json({ success:true, data:bill });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

/* ── POST /api/billing ─────────────────────────── */
const createBill = async (req, res) => {
  try {
    const {
      customerName='Walk-in Customer', customerPhone='', customerId,
      items, discountType='none', discountValue=0,
      paymentMethod='cash', amountPaid,
      paymentStatus,                 // optional manual override from admin
      notes='', billType='counter'
    } = req.body;

    if (!items?.length) return res.status(400).json({ success:false, message:'Bill must have at least one item' });

    // Validate products & build item snapshots
    const rawItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId)
        .populate('unit','name').populate('category','name');
      if (!product) return res.status(404).json({ success:false, message:`Product not found: ${item.productId}` });
      if (product.currentStock < item.quantity)
        return res.status(400).json({ success:false, message:`Insufficient stock for ${product.name}. Available: ${product.currentStock}` });

      rawItems.push({
        product:     product._id,
        productName: product.name,
        productCode: product.productCode,
        unit:        product.unit?.name || '',
        mrp:         product.sellingPrice,
        quantity:    item.quantity,
        discountPct: item.discountPct || 0,
        taxPct:      item.taxPct      || 0
      });
    }

    // Recalculate everything server-side (never trust client math)
    const { calcItems, subtotal, taxAmount, discountAmount, roundOff, totalAmount } = calcBill(rawItems, discountType, discountValue, amountPaid);

    // Resolve amount paid — if not provided / 0 / invalid, default to full totalAmount (assume fully paid)
    let paid = num(amountPaid, NaN);
    if (!Number.isFinite(paid) || paid <= 0) paid = totalAmount;
    paid = parseFloat(paid.toFixed(2));

    const changeReturned = Math.max(0, parseFloat((paid - totalAmount).toFixed(2)));

    // Payment status — auto-calculated, unless admin explicitly overrides
    let payStatus = getPaymentStatus(paid, totalAmount);
    if (paymentStatus && ['paid','partial','unpaid'].includes(paymentStatus)) {
      payStatus = paymentStatus; // admin manual override at billing time
    }

    // Deduct stock for each item
    for (const item of calcItems) {
      const product = await Product.findById(item.product);
      product.currentStock = parseFloat((product.currentStock - item.quantity).toFixed(3));
      product.isLowStock   = product.currentStock <= product.reorderLevel;
      if (product.currentStock <= 0) { product.currentStock = 0; product.status = 'out_of_stock'; }
      else if (product.status === 'out_of_stock') product.status = 'active';
      await product.save({ validateBeforeSave: false });

      if (product.isLowStock) {
        const n = await Notification.create({
          type:'low_stock', title:'⚠️ Low Stock Alert',
          message:`${product.name}: ${product.currentStock} remaining (reorder at ${product.reorderLevel})`,
          data:{ productId:product._id, productName:product.name, currentStock:product.currentStock }
        });
        emitToAdmin('low_stock_alert', { notification:n, product });
      }
      emitToAdmin('stock_updated', { productId:product._id, productName:product.name, newStock:product.currentStock, isLowStock:product.isLowStock });
    }

    const billDoc = await Bill.create({
      customerName, customerPhone,
      customer: customerId || null,
      billedBy: req.admin.name,
      items: calcItems.map(i => ({
        product:     i.product,
        productName: i.productName,
        productCode: i.productCode,
        unit:        i.unit,
        mrp:         i.mrp,
        rate:        i.rate,
        quantity:    i.quantity,
        discountPct: i.discountPct,
        discountAmt: i.discountAmt,
        taxPct:      i.taxPct,
        taxAmt:      i.taxAmt,
        subtotal:    i.subtotal
      })),
      subtotal, discountType, discountValue: num(discountValue),
      discountAmount, taxAmount, roundOff, totalAmount,
      paymentMethod, amountPaid: paid, changeReturned,
      paymentStatus: payStatus, notes, billType
    });

    emitToAdmin('bill_created', { bill: billDoc });

    res.status(201).json({ success:true, message:'Bill created successfully', data:billDoc });
  } catch(e){ res.status(400).json({ success:false, message:e.message }); }
};

/* ── PATCH /api/billing/:id/payment ───────────────
   Admin can update amountPaid AND/OR paymentStatus directly
   from the bill history list.                       */
const updatePayment = async (req, res) => {
  try {
    const { amountPaid, paymentMethod, paymentStatus } = req.body;
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success:false, message:'Bill not found' });

    // If amountPaid provided, recalc status from it (unless explicit status also given)
    if (amountPaid !== undefined) {
      const paid = num(amountPaid, bill.amountPaid);
      bill.amountPaid     = parseFloat(paid.toFixed(2));
      bill.changeReturned = Math.max(0, parseFloat((paid - bill.totalAmount).toFixed(2)));
      bill.paymentStatus  = getPaymentStatus(paid, bill.totalAmount);
    }

    // Explicit manual status override (e.g. admin marks "paid" after collecting cash later)
    if (paymentStatus && ['paid','partial','unpaid'].includes(paymentStatus)) {
      bill.paymentStatus = paymentStatus;
      // Keep amountPaid consistent with manual status
      if (paymentStatus === 'paid')   bill.amountPaid = bill.totalAmount;
      if (paymentStatus === 'unpaid') bill.amountPaid = 0;
      bill.changeReturned = Math.max(0, parseFloat((bill.amountPaid - bill.totalAmount).toFixed(2)));
    }

    if (paymentMethod) bill.paymentMethod = paymentMethod;
    await bill.save();

    emitToAdmin('bill_updated', { bill });
    res.json({ success:true, message:'Payment updated', data:bill });
  } catch(e){ res.status(400).json({ success:false, message:e.message }); }
};

/* ── DELETE /api/billing/:id  (void bill) ──────── */
const voidBill = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success:false, message:'Bill not found' });

    for (const item of bill.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { currentStock: item.quantity },
        isLowStock: false, status: 'active'
      });
      emitToAdmin('stock_updated', { productId:item.product, productName:item.productName });
    }

    await Bill.findByIdAndDelete(req.params.id);
    emitToAdmin('bill_voided', { billId:req.params.id });
    res.json({ success:true, message:'Bill voided and stock restored' });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

/* ── GET /api/billing/stats ────────────────────── */
const getBillingStats = async (req, res) => {
  try {
    const now        = new Date();
    const startDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Revenue = only count amounts actually PAID (amountPaid), regardless of status,
    // so partial payments still contribute their collected portion.
    const [totalBills, todayBills, monthBills, todayRevenue, monthRevenue, totalRevenue, statusCounts] = await Promise.all([
      Bill.countDocuments(),
      Bill.countDocuments({ createdAt:{ $gte:startDay } }),
      Bill.countDocuments({ createdAt:{ $gte:startMonth } }),
      Bill.aggregate([{ $match:{ createdAt:{ $gte:startDay } } }, { $group:{ _id:null, total:{ $sum:'$amountPaid' } } }]),
      Bill.aggregate([{ $match:{ createdAt:{ $gte:startMonth } } }, { $group:{ _id:null, total:{ $sum:'$amountPaid' } } }]),
      Bill.aggregate([{ $group:{ _id:null, total:{ $sum:'$amountPaid' } } }]),
      Bill.aggregate([{ $group:{ _id:'$paymentStatus', count:{ $sum:1 }, amount:{ $sum:'$totalAmount' } } }])
    ]);

    res.json({
      success:true,
      data:{
        totalBills, todayBills, monthBills,
        todayRevenue: todayRevenue[0]?.total || 0,
        monthRevenue: monthRevenue[0]?.total || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
        statusCounts: statusCounts.reduce((acc,s) => { acc[s._id] = { count:s.count, amount:s.amount }; return acc; }, {})
      }
    });
  } catch(e){ res.status(500).json({ success:false, message:e.message }); }
};

module.exports = { getBills, getBill, createBill, updatePayment, voidBill, getBillingStats };
