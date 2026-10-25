'use strict';
/* Nectar of Beauty – shop server. Express + SQLite. See README.md */
const express = require('express'), helmet = require('helmet'), rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs'), cookieParser = require('cookie-parser'), Database = require('better-sqlite3');
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const ENV = process.env, PROD = ENV.NODE_ENV === 'production', PORT = +ENV.PORT || 3000;
const DATA = ENV.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });

let SECRET = ENV.SESSION_SECRET;
if (!SECRET) {
  const f = path.join(DATA, '.secret');
  try { SECRET = fs.readFileSync(f, 'utf8'); } catch { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, SECRET, { mode: 0o600 }); }
}
const RZP = { id: ENV.RAZORPAY_KEY_ID || '', secret: ENV.RAZORPAY_KEY_SECRET || '', hook: ENV.RAZORPAY_WEBHOOK_SECRET || '' };
const RZP_ON = !!(RZP.id && RZP.secret);

/* ---------- database ---------- */
const db = new Database(path.join(DATA, 'shop.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
create table if not exists users(id integer primary key, name text not null, email text unique not null, phone text, pass text not null, role text not null default 'customer', created integer not null);
create table if not exists products(id integer primary key, slug text unique, name text not null, brand text, category text, price integer not null, mrp integer not null, stock integer not null default 0, description text, image text, active integer not null default 1, created integer);
create table if not exists wishlist(user_id integer not null, product_id integer not null, primary key(user_id, product_id));
create table if not exists orders(id text primary key, user_id integer, name text, phone text, address text, pincode text, delivery text, pay_method text, pay_status text default 'pending', status text default 'Placed', subtotal integer, shipping integer, total integer, courier text, tracking_no text, eta text, utr text, rzp_order text, rzp_payment text, note text, created integer, updated integer);
create table if not exists order_items(order_id text not null, product_id integer, name text, price integer, qty integer);
create table if not exists events(id integer primary key, order_id text not null, status text, note text, at integer);
create table if not exists settings(key text primary key, value text);
create index if not exists idx_orders_user on orders(user_id); create index if not exists idx_orders_created on orders(created);
`);

const CATS = ['Haircare', 'Bodycare', 'Makeup', 'Skincare', 'Baby & essentials'];
const FLOW = { courier: ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'], pickup: ['Placed', 'Confirmed', 'Ready for pickup', 'Collected'] };
const PAY_STATUS = ['pending', 'verify', 'paid', 'failed', 'refund_due', 'refunded'];
const DEF = { shopName: 'Nectar of Beauty', wa: '', upi: '', free: 499, fee: 49, dl: { l: [1, 2], s: [3, 4], i: [5, 8] }, couriers: ['India Post', 'DTDC', 'Delhivery', 'Blue Dart', 'Local delivery'], trackUrl: '', pickup: 'Ground floor, Saraswati Towers, Sharaddhanand Galli, Sirsi, Karnataka' };
function settings() {
  const o = JSON.parse(JSON.stringify(DEF));
  for (const r of db.prepare('select key,value from settings').all()) { try { if (r.key in DEF) o[r.key] = JSON.parse(r.value); } catch { } }
  return o;
}

/* first-run seed */
if (!db.prepare('select count(*) c from products').get().c) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8')), ins = db.prepare('insert into products(slug,name,brand,category,price,mrp,stock,description,image,created) values(?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => seed.forEach(p => ins.run(p.slug, p.name, p.brand, p.category, p.price, p.mrp, p.stock, p.description, p.image, Date.now())))();
}
if (!db.prepare("select 1 from users where role='admin'").get()) {
  const email = (ENV.ADMIN_EMAIL || 'owner@example.com').toLowerCase(); let pw = ENV.ADMIN_PASSWORD;
  if (!pw) { pw = crypto.randomBytes(9).toString('base64url'); console.log(`\n  FIRST RUN: admin login  ${email}  /  ${pw}\n  Change it by setting ADMIN_EMAIL and ADMIN_PASSWORD before first start.\n`); }
  db.prepare("insert into users(name,email,pass,role,created) values('Owner',?,?, 'admin',?)").run(email, bcrypt.hashSync(pw, 10), Date.now());
}

/* ---------- helpers ---------- */
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function issue(res, uid) { const p = uid + '.' + (Date.now() + 30 * 864e5); res.cookie('nb_sess', p + '.' + sign(p), { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 30 * 864e5, path: '/' }); }
function who(req) {
  const t = req.cookies && req.cookies.nb_sess; if (!t) return null;
  const i = t.lastIndexOf('.'), p = t.slice(0, i); if (!safeEq(sign(p), t.slice(i + 1))) return null;
  const [uid, exp] = p.split('.'); if (+exp < Date.now()) return null;
  return db.prepare('select id,name,email,phone,role from users where id=?').get(+uid) || null;
}
const str = (v, min, max) => { v = typeof v === 'string' ? v.trim() : ''; return v.length >= min && v.length <= max ? v : null; };
const phoneOk = p => /^[6-9]\d{9}$/.test(p || '');
const last10 = p => String(p || '').replace(/\D/g, '').slice(-10);
const fail = (res, code, error) => res.status(code).json({ error });
const publicProduct = p => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, category: p.category, price: p.price, mrp: p.mrp, stock: p.stock, description: p.description, image: p.image });
function est(pin, from = Date.now()) {
  const z = /^5814/.test(pin) ? 'l' : /^5[6-9]/.test(pin) ? 's' : 'i', [a, b] = settings().dl[z], f = n => new Date(from + n * 864e5).toISOString().slice(0, 10);
  return { from: f(a), to: f(b) };
}
function orderFull(id) {
  const o = db.prepare('select * from orders where id=?').get(id); if (!o) return null;
  o.items = db.prepare('select product_id,name,price,qty from order_items where order_id=?').all(id);
  o.events = db.prepare('select status,note,at from events where order_id=? order by id').all(id);
  return o;
}
function customerView(o) {
  const s = settings();
  return { id: o.id, status: o.status, delivery: o.delivery, pay_method: o.pay_method, pay_status: o.pay_status, name: o.name, address: o.address, pincode: o.pincode, subtotal: o.subtotal, shipping: o.shipping, total: o.total, courier: o.courier, tracking_no: o.tracking_no, track_url: o.tracking_no && s.trackUrl ? s.trackUrl.replace('{id}', encodeURIComponent(o.tracking_no)) : '', eta: o.eta, est: o.delivery === 'courier' ? est(o.pincode, o.created) : null, created: o.created, items: o.items, events: o.events.filter(e => e.status), flow: FLOW[o.delivery] };
}
const addEvent = (id, status, note) => db.prepare('insert into events(order_id,status,note,at) values(?,?,?,?)').run(id, status, note || '', Date.now());
function restoreStock(id) { for (const i of db.prepare('select product_id,qty from order_items where order_id=?').all(id)) db.prepare('update products set stock=stock+? where id=?').run(i.qty, i.product_id); }
function canAccess(o, req, phone) { const u = who(req); return !!o && ((u && (u.role === 'admin' || u.id === o.user_id)) || (phone && last10(phone) === last10(o.phone))); }
function saveImage(data, old) {
  const m = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data || ''); if (!m) throw new Error('Image must be PNG, WebP or JPEG');
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > 900 * 1024) throw new Error('Image too large (max 900 KB)');
  const fn = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(DATA, 'uploads', fn), buf);
  if (old && old.startsWith('/uploads/')) fs.unlink(path.join(DATA, 'uploads', path.basename(old)), () => { });
  return '/uploads/' + fn;
}
function verifySig(orderId, paymentId, sig) { return safeEq(crypto.createHmac('sha256', RZP.secret).update(orderId + '|' + paymentId).digest('hex'), sig || ''); }
function markPaid(rzpOrder, paymentId) {
  const o = db.prepare('select id,pay_status from orders where rzp_order=?').get(rzpOrder); if (!o || o.pay_status === 'paid') return o;
  db.prepare("update orders set pay_status='paid', rzp_payment=?, updated=? where id=?").run(paymentId, Date.now(), o.id); addEvent(o.id, null, 'Online payment received'); return o;
}

/* ---------- app ---------- */
const app = express(); app.set('trust proxy', 1); app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://checkout.razorpay.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'https://lumberjack.razorpay.com'], frameSrc: ['https://api.razorpay.com', 'https://checkout.razorpay.com'], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"] } } }));

app.post('/api/pay/webhook', express.raw({ type: '*/*', limit: '200kb' }), (req, res) => {
  if (!RZP.hook) return res.sendStatus(404);
  const sig = req.get('x-razorpay-signature') || '', exp = crypto.createHmac('sha256', RZP.hook).update(req.body).digest('hex');
  if (!safeEq(exp, sig)) return res.sendStatus(400);
  try { const ev = JSON.parse(req.body.toString()), p = ev.payload && ev.payload.payment && ev.payload.payment.entity; if (p && (ev.event === 'payment.captured' || ev.event === 'order.paid')) markPaid(p.order_id, p.id); } catch { }
  res.sendStatus(200);
});
app.use(express.json({ limit: '1.5mb' })); app.use(cookieParser());
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin'); if (o) { try { if (new URL(o).host !== req.get('host')) return fail(res, 403, 'Bad origin'); } catch { return fail(res, 403, 'Bad origin'); } }
  next();
});
const lim = (windowMin, max) => rateLimit({ windowMs: windowMin * 60000, max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
app.use('/api', lim(15, 600));
const authLim = lim(15, 25), orderLim = lim(60, 40);

app.use('/uploads', express.static(path.join(DATA, 'uploads'), { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1h' : 0, extensions: ['html'] }));

/* public */
app.get('/api/config', (req, res) => { const s = settings(); res.json({ shopName: s.shopName, wa: s.wa, upi: s.upi, free: s.free, fee: s.fee, dl: s.dl, pickup: s.pickup, categories: CATS, online: RZP_ON, rzpKey: RZP_ON ? RZP.id : '' }); });
app.get('/api/products', (req, res) => res.json(db.prepare('select * from products where active=1 order by id').all().map(publicProduct)));
app.get('/api/delivery', (req, res) => { const p = String(req.query.pin || ''); if (!/^\d{6}$/.test(p)) return fail(res, 400, 'Enter a valid 6-digit pincode'); res.json(est(p)); });

/* auth */
app.post('/api/register', authLim, (req, res) => {
  const b = req.body || {}, name = str(b.name, 2, 80), email = str(b.email, 5, 120), pw = typeof b.password === 'string' ? b.password : '';
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Enter your name and a valid email');
  if (pw.length < 8 || pw.length > 100) return fail(res, 400, 'Password must be at least 8 characters');
  if (b.phone && !phoneOk(b.phone)) return fail(res, 400, 'Enter a valid 10-digit mobile number');
  if (db.prepare('select 1 from users where email=?').get(email.toLowerCase())) return fail(res, 409, 'An account with this email already exists');
  const r = db.prepare("insert into users(name,email,phone,pass,role,created) values(?,?,?,?, 'customer',?)").run(name, email.toLowerCase(), b.phone || null, bcrypt.hashSync(pw, 10), Date.now());
  issue(res, r.lastInsertRowid); res.json({ user: { id: r.lastInsertRowid, name, email: email.toLowerCase(), role: 'customer' } });
});
app.post('/api/login', authLim, (req, res) => {
  const b = req.body || {}, u = db.prepare('select * from users where email=?').get(String(b.email || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(String(b.password || ''), u.pass)) return fail(res, 401, 'Wrong email or password');
  issue(res, u.id); res.json({ user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role } });
});
app.post('/api/logout', (req, res) => { res.clearCookie('nb_sess', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  const u = who(req); if (!u) return res.json({ user: null });
  const last = db.prepare('select name,phone,address,pincode from orders where user_id=? order by created desc limit 1').get(u.id);
  res.json({ user: u, last: last || null, wishlist: db.prepare('select product_id from wishlist where user_id=?').all(u.id).map(r => r.product_id) });
});
app.put('/api/wishlist/:pid', (req, res) => { const u = who(req); if (!u) return fail(res, 401, 'Log in first'); db.prepare('insert or ignore into wishlist values(?,?)').run(u.id, +req.params.pid); res.json({ ok: true }); });
app.delete('/api/wishlist/:pid', (req, res) => { const u = who(req); if (!u) return fail(res, 401, 'Log in first'); db.prepare('delete from wishlist where user_id=? and product_id=?').run(u.id, +req.params.pid); res.json({ ok: true }); });

/* orders */
app.post('/api/orders', orderLim, (req, res) => {
  const b = req.body || {}, s = settings(), u = who(req);
  const name = str(b.name, 2, 80), delivery = b.delivery === 'pickup' ? 'pickup' : b.delivery === 'courier' ? 'courier' : null, pay = ['cod', 'upi', 'online'].includes(b.pay) ? b.pay : null;
  if (!name) return fail(res, 400, 'Enter your name'); if (!phoneOk(b.phone)) return fail(res, 400, 'Enter a valid 10-digit mobile number');
  if (!delivery || !pay) return fail(res, 400, 'Choose delivery and payment');
  if (pay === 'online' && !RZP_ON) return fail(res, 400, 'Online payment is not enabled'); if (pay === 'upi' && !s.upi) return fail(res, 400, 'UPI is not enabled');
  const address = delivery === 'courier' ? str(b.address, 8, 300) : '', pincode = delivery === 'courier' ? String(b.pincode || '') : '';
  if (delivery === 'courier' && (!address || !/^\d{6}$/.test(pincode))) return fail(res, 400, 'Enter your full address and 6-digit pincode');
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : []; if (!items.length) return fail(res, 400, 'Your cart is empty');
  let id;
  try {
    db.transaction(() => {
      const lines = []; let sub = 0;
      for (const it of items) {
        const q = Math.floor(+it.q), p = db.prepare('select * from products where id=? and active=1').get(+it.id);
        if (!p || !(q >= 1 && q <= 20)) throw new Error('A product in your cart is no longer available');
        if (p.stock < q) throw new Error(`Only ${p.stock} left of ${p.name}`);
        lines.push({ p, q }); sub += p.price * q;
      }
      const ship = delivery === 'pickup' || sub >= s.free ? 0 : s.fee, now = Date.now();
      do { id = 'NB' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3); } while (db.prepare('select 1 from orders where id=?').get(id));
      db.prepare('insert into orders(id,user_id,name,phone,address,pincode,delivery,pay_method,pay_status,status,subtotal,shipping,total,created,updated) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, u ? u.id : null, name, b.phone, address, pincode, delivery, pay, 'pending', 'Placed', sub, ship, sub + ship, now, now);
      for (const { p, q } of lines) { db.prepare('insert into order_items values(?,?,?,?,?)').run(id, p.id, p.name, p.price, q); db.prepare('update products set stock=stock-? where id=?').run(q, p.id); }
      addEvent(id, 'Placed', 'Order placed');
    })();
  } catch (e) { return fail(res, 400, e.message); }
  res.json({ order: customerView(orderFull(id)), phone: b.phone });
});
app.get('/api/orders/mine', (req, res) => { const u = who(req); if (!u) return fail(res, 401, 'Log in to see your orders'); res.json(db.prepare('select id from orders where user_id=? order by created desc limit 100').all(u.id).map(r => customerView(orderFull(r.id)))); });
app.get('/api/track', (req, res) => { const o = orderFull(String(req.query.id || '').toUpperCase().trim()); if (!canAccess(o, req, req.query.phone)) return fail(res, 404, 'No order found for that ID and mobile number'); res.json(customerView(o)); });
app.post('/api/orders/:id/cancel', (req, res) => {
  const o = orderFull(req.params.id); if (!canAccess(o, req, req.body && req.body.phone)) return fail(res, 404, 'Order not found');
  if (o.status !== 'Placed') return fail(res, 400, 'This order can no longer be cancelled online. Please contact the shop.');
  db.transaction(() => { db.prepare("update orders set status='Cancelled', pay_status=?, updated=? where id=?").run(o.pay_status === 'paid' ? 'refund_due' : o.pay_status, Date.now(), o.id); restoreStock(o.id); addEvent(o.id, 'Cancelled', 'Cancelled by customer'); })();
  res.json({ order: customerView(orderFull(o.id)) });
});
app.post('/api/orders/:id/utr', (req, res) => {
  const o = orderFull(req.params.id); if (!canAccess(o, req, req.body && req.body.phone)) return fail(res, 404, 'Order not found');
  const utr = str(req.body.utr, 6, 30); if (!utr || o.pay_method !== 'upi' || o.pay_status === 'paid') return fail(res, 400, 'Enter the UPI reference number');
  db.prepare("update orders set utr=?, pay_status='verify', updated=? where id=?").run(utr, Date.now(), o.id); addEvent(o.id, null, 'Customer submitted UPI reference'); res.json({ ok: true });
});
app.post('/api/orders/:id/pay', async (req, res) => {
  const o = orderFull(req.params.id); if (!RZP_ON || !canAccess(o, req, req.body && req.body.phone)) return fail(res, 404, 'Order not found');
  if (o.pay_method !== 'online' || o.pay_status === 'paid' || o.status === 'Cancelled') return fail(res, 400, 'This order cannot be paid online');
  try {
    if (!o.rzp_order) {
      const r = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(RZP.id + ':' + RZP.secret).toString('base64') }, body: JSON.stringify({ amount: o.total * 100, currency: 'INR', receipt: o.id }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error && j.error.description || 'Razorpay error');
      db.prepare('update orders set rzp_order=? where id=?').run(j.id, o.id); o.rzp_order = j.id;
    }
    res.json({ key: RZP.id, order_id: o.rzp_order, amount: o.total * 100, name: settings().shopName, prefill: { name: o.name, contact: o.phone } });
  } catch (e) { fail(res, 502, 'Could not start payment: ' + e.message); }
});
app.post('/api/pay/verify', (req, res) => {
  const b = req.body || {}, o = db.prepare('select id from orders where rzp_order=?').get(String(b.razorpay_order_id || ''));
  if (!RZP_ON || !o || !verifySig(String(b.razorpay_order_id), String(b.razorpay_payment_id || ''), String(b.razorpay_signature || ''))) return fail(res, 400, 'Payment could not be verified');
  markPaid(b.razorpay_order_id, b.razorpay_payment_id); res.json({ order: customerView(orderFull(o.id)) });
});

/* ---------- admin ---------- */
const admin = express.Router();
admin.use((req, res, next) => { const u = who(req); if (!u || u.role !== 'admin') return fail(res, 403, 'Owner access only'); req.user = u; next(); });
admin.get('/stats', (req, res) => {
  const day = new Date(); day.setHours(0, 0, 0, 0); const q = (sql, ...a) => db.prepare(sql).get(...a);
  res.json({ today: q('select count(*) n, coalesce(sum(total),0) t from orders where created>=? and status!=\'Cancelled\'', day.getTime()), open: q("select count(*) n from orders where status not in ('Delivered','Collected','Cancelled')").n, toVerify: q("select count(*) n from orders where pay_status='verify'").n, revenue: q("select coalesce(sum(total),0) t from orders where status in ('Delivered','Collected')").t, byStatus: db.prepare('select status, count(*) n from orders group by status').all(), low: db.prepare('select id,name,stock from products where active=1 and stock<=5 order by stock limit 20').all() });
});
admin.get('/orders', (req, res) => {
  const st = String(req.query.status || ''), rows = (st ? db.prepare('select id from orders where status=? order by created desc limit 200').all(st) : db.prepare('select id from orders order by created desc limit 200').all());
  res.json(rows.map(r => { const o = orderFull(r.id); o.est = o.delivery === 'courier' ? est(o.pincode, o.created) : null; return o; }));
});
admin.patch('/orders/:id', (req, res) => {
  const o = orderFull(req.params.id); if (!o) return fail(res, 404, 'Order not found'); const b = req.body || {}, set = {}, now = Date.now();
  if (b.status !== undefined) {
    if (b.status !== 'Cancelled' && !FLOW[o.delivery].includes(b.status)) return fail(res, 400, 'Invalid status for this order');
    if (o.status === 'Cancelled' && b.status !== 'Cancelled') return fail(res, 400, 'A cancelled order cannot be reopened');
    set.status = b.status;
  }
  if (b.courier !== undefined) set.courier = String(b.courier).slice(0, 60); if (b.tracking_no !== undefined) set.tracking_no = String(b.tracking_no).slice(0, 60);
  if (b.eta !== undefined) { if (b.eta && !/^\d{4}-\d{2}-\d{2}$/.test(b.eta)) return fail(res, 400, 'Invalid date'); set.eta = b.eta || null; }
  if (b.pay_status !== undefined) { if (!PAY_STATUS.includes(b.pay_status)) return fail(res, 400, 'Invalid payment status'); set.pay_status = b.pay_status; }
  if (b.note !== undefined) set.note = String(b.note).slice(0, 300);
  const keys = Object.keys(set); if (!keys.length) return res.json(orderFull(o.id));
  db.transaction(() => {
    db.prepare(`update orders set ${keys.map(k => k + '=?').join(',')}, updated=? where id=?`).run(...keys.map(k => set[k]), now, o.id);
    if (set.status && set.status !== o.status) { addEvent(o.id, set.status, b.eventNote || ''); if (set.status === 'Cancelled') restoreStock(o.id); }
    if (set.pay_status && set.pay_status !== o.pay_status) addEvent(o.id, null, 'Payment: ' + set.pay_status);
  })();
  res.json(orderFull(o.id));
});
admin.get('/orders.csv', (req, res) => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = db.prepare('select id from orders order by created desc').all().map(r => orderFull(r.id));
  const out = ['Order,Date,Customer,Phone,Delivery,Address,Pincode,Items,Total,Payment,Pay status,Status,Courier,Tracking'].concat(rows.map(o => [o.id, new Date(o.created).toISOString(), o.name, o.phone, o.delivery, o.address, o.pincode, o.items.map(i => i.name + ' x' + i.qty).join('; '), o.total, o.pay_method, o.pay_status, o.status, o.courier, o.tracking_no].map(q).join(',')));
  res.type('text/csv').attachment('orders.csv').send(out.join('\n'));
});
function productFields(b, old) {
  const name = str(b.name, 2, 140), price = Math.round(+b.price), mrp = Math.round(+b.mrp || +b.price), stock = Math.floor(+b.stock);
  if (!name) throw new Error('Enter a product name'); if (!(price > 0)) throw new Error('Enter a valid price'); if (!(stock >= 0)) throw new Error('Enter stock (0 or more)');
  if (!CATS.includes(b.category)) throw new Error('Choose a category');
  return { name, brand: str(b.brand, 1, 60) || 'Assorted', category: b.category, price, mrp: Math.max(mrp, price), stock, description: String(b.description || '').slice(0, 600), image: typeof b.image === 'string' && b.image.startsWith('data:') ? saveImage(b.image, old && old.image) : (old ? old.image : ''), active: b.active === 0 || b.active === false ? 0 : 1 };
}
admin.get('/products', (req, res) => res.json(db.prepare('select * from products order by id').all()));
admin.post('/products', (req, res) => {
  try { const f = productFields(req.body || {}), r = db.prepare('insert into products(slug,name,brand,category,price,mrp,stock,description,image,active,created) values(?,?,?,?,?,?,?,?,?,?,?)').run('p' + Date.now().toString(36), f.name, f.brand, f.category, f.price, f.mrp, f.stock, f.description, f.image, f.active, Date.now()); res.json(db.prepare('select * from products where id=?').get(r.lastInsertRowid)); }
  catch (e) { fail(res, 400, e.message); }
});
admin.put('/products/:id', (req, res) => {
  const old = db.prepare('select * from products where id=?').get(+req.params.id); if (!old) return fail(res, 404, 'Product not found');
  try { const f = productFields(req.body || {}, old); db.prepare('update products set name=?,brand=?,category=?,price=?,mrp=?,stock=?,description=?,image=?,active=? where id=?').run(f.name, f.brand, f.category, f.price, f.mrp, f.stock, f.description, f.image, f.active, old.id); res.json(db.prepare('select * from products where id=?').get(old.id)); }
  catch (e) { fail(res, 400, e.message); }
});
admin.delete('/products/:id', (req, res) => { db.prepare('update products set active=0 where id=?').run(+req.params.id); res.json({ ok: true }); });
admin.get('/settings', (req, res) => res.json(settings()));
admin.put('/settings', (req, res) => {
  const b = req.body || {}, out = {}, num = (v, d) => (Number.isFinite(+v) && +v >= 0 ? Math.round(+v) : d);
  out.shopName = str(b.shopName, 2, 60) || DEF.shopName; out.wa = String(b.wa || '').replace(/\D/g, '').slice(0, 15); out.upi = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(b.upi || '') ? b.upi : '';
  out.free = num(b.free, 499); out.fee = num(b.fee, 49); out.pickup = String(b.pickup || '').slice(0, 200); out.trackUrl = /^https?:\/\//.test(b.trackUrl || '') ? b.trackUrl : '';
  out.couriers = (Array.isArray(b.couriers) ? b.couriers : String(b.couriers || '').split(',')).map(x => String(x).trim()).filter(Boolean).slice(0, 12);
  out.dl = {}; for (const z of ['l', 's', 'i']) { const a = b.dl && b.dl[z] || [], lo = num(a[0], 1), hi = Math.max(lo, num(a[1], lo)); out.dl[z] = [lo, hi]; }
  const ins = db.prepare('insert into settings values(?,?) on conflict(key) do update set value=excluded.value'); db.transaction(() => { for (const k in out) ins.run(k, JSON.stringify(out[k])); })();
  res.json(settings());
});
app.use('/api/admin', admin);
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', (req, res) => fail(res, 404, 'Not found'));
app.use((err, req, res, next) => { console.error(err); fail(res, err.status || 500, err.status ? err.message : 'Something went wrong'); });

/* abandoned online payments: release stock after 30 min */
function sweep() {
  for (const o of db.prepare("select id from orders where pay_method='online' and pay_status='pending' and status='Placed' and created<?").all(Date.now() - 30 * 60000))
    db.transaction(() => { db.prepare("update orders set status='Cancelled', pay_status='failed', updated=? where id=?").run(Date.now(), o.id); restoreStock(o.id); addEvent(o.id, 'Cancelled', 'Payment not completed'); })();
}
if (require.main === module) { setInterval(sweep, 10 * 60000).unref(); app.listen(PORT, () => console.log(`Shop running on http://localhost:${PORT}  (admin: /admin)`)); }
module.exports = { app, db, verifySig, sweep };
