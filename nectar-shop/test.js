'use strict';
/* Smoke tests: node test.js  (uses a temporary database) */
const os = require('os'), fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-')); process.env.ADMIN_EMAIL = 'boss@shop.test'; process.env.ADMIN_PASSWORD = 'bosspass123';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x'; process.env.RAZORPAY_KEY_SECRET = 'secret123'; process.env.RAZORPAY_WEBHOOK_SECRET = 'hook123';
const { app, db, verifySig, sweep } = require('./server');
const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
function client() {
  let cookie = '';
  return async (p, o = {}) => {
    const r = await fetch(base + p, { method: o.method || (o.body || o.raw ? 'POST' : 'GET'), headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(o.headers || {}) }, body: o.raw || (o.body ? JSON.stringify(o.body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j };
  };
}
let n = 0; const ok = (name) => console.log('  ✓ ' + name), T = async (name, fn) => { try { await fn(); n++; ok(name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } };
(async () => {
  const guest = client(), user = client(), admin = client();
  const cfg = (await guest('/api/config')).j, prods = (await guest('/api/products')).j, p1 = prods.find(p => p.stock > 3 && p.price < 200), p2 = prods[0];
  await T('config + 26 products', () => { assert(cfg.online === true); assert.strictEqual(prods.length, 26); });
  await T('security headers present', async () => { const r = await fetch(base + '/'); assert(r.headers.get('content-security-policy')); assert(r.headers.get('x-content-type-options')); });
  await T('register, login, me', async () => {
    assert.strictEqual((await user('/api/register', { body: { name: 'Asha', email: 'asha@test.in', password: 'short' } })).s, 400);
    assert.strictEqual((await user('/api/register', { body: { name: 'Asha', email: 'asha@test.in', password: 'longenough1' } })).s, 200);
    assert.strictEqual((await user('/api/me')).j.user.email, 'asha@test.in');
    assert.strictEqual((await client()('/api/login', { body: { email: 'asha@test.in', password: 'wrong' } })).s, 401);
  });
  let order, stock0 = db.prepare('select stock from products where id=?').get(p1.id).stock;
  await T('guest order: server-side pricing + stock decrement', async () => {
    const r = await guest('/api/orders', { body: { name: 'Ravi', phone: '9876543210', delivery: 'courier', pay: 'cod', address: '12 Market Road, Sirsi', pincode: '581401', items: [{ id: p1.id, q: 2, price: 1 }] } });
    assert.strictEqual(r.s, 200, JSON.stringify(r.j)); order = r.j.order;
    assert.strictEqual(order.subtotal, p1.price * 2); assert.strictEqual(order.shipping, 49); assert(order.est.from);
    assert.strictEqual(db.prepare('select stock from products where id=?').get(p1.id).stock, stock0 - 2);
  });
  await T('validation: bad phone, bad pincode, oversell, empty cart', async () => {
    const b = { name: 'Ravi', phone: '9876543210', delivery: 'courier', pay: 'cod', address: '12 Market Road, Sirsi', pincode: '581401', items: [{ id: p1.id, q: 1 }] };
    assert.strictEqual((await guest('/api/orders', { body: { ...b, phone: '123' } })).s, 400);
    assert.strictEqual((await guest('/api/orders', { body: { ...b, pincode: '12' } })).s, 400);
    assert.strictEqual((await guest('/api/orders', { body: { ...b, items: [{ id: p1.id, q: 99 }] } })).s, 400);
    assert.strictEqual((await guest('/api/orders', { body: { ...b, items: [] } })).s, 400);
    assert.strictEqual((await guest('/api/orders', { body: { ...b, pay: 'upi' } })).s, 400);
  });
  await T('tracking needs matching phone', async () => {
    assert.strictEqual((await guest(`/api/track?id=${order.id}&phone=9876543210`)).s, 200);
    assert.strictEqual((await guest(`/api/track?id=${order.id}&phone=9000000000`)).s, 404);
  });
  await T('non-owner blocked from admin API', async () => { assert.strictEqual((await guest('/api/admin/stats')).s, 403); assert.strictEqual((await user('/api/admin/orders')).s, 403); });
  await T('bad Origin rejected', async () => { assert.strictEqual((await guest('/api/orders', { body: {}, headers: { origin: 'https://evil.example' } })).s, 403); });
  await T('owner login + status/courier/ETA update visible to customer', async () => {
    assert.strictEqual((await admin('/api/login', { body: { email: 'boss@shop.test', password: 'bosspass123' } })).s, 200);
    assert.strictEqual((await admin(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: { status: 'Out for delivery'.replace('Out for delivery', 'Bogus') } })).s, 400);
    const r = await admin(`/api/admin/orders/${order.id}`, { method: 'PATCH', body: { status: 'Shipped', courier: 'DTDC', tracking_no: 'D123', eta: '2030-01-05', pay_status: 'paid' } });
    assert.strictEqual(r.s, 200);
    const t = (await guest(`/api/track?id=${order.id}&phone=9876543210`)).j;
    assert.strictEqual(t.status, 'Shipped'); assert.strictEqual(t.courier, 'DTDC'); assert.strictEqual(t.eta, '2030-01-05'); assert(t.events.some(e => e.status === 'Shipped'));
    assert.strictEqual((await guest(`/api/orders/${order.id}/cancel`, { body: { phone: '9876543210' } })).s, 400);
  });
  await T('customer cancel restores stock', async () => {
    const r = await user('/api/orders', { body: { name: 'Asha', phone: '9123456780', delivery: 'pickup', pay: 'cod', items: [{ id: p2.id, q: 1 }] } }); assert.strictEqual(r.s, 200);
    const s1 = db.prepare('select stock from products where id=?').get(p2.id).stock;
    assert.strictEqual((await user(`/api/orders/${r.j.order.id}/cancel`, { body: {} })).s, 200);
    assert.strictEqual(db.prepare('select stock from products where id=?').get(p2.id).stock, s1 + 1);
    assert.strictEqual((await user('/api/orders/mine')).j.length, 2 - 1);
  });
  await T('razorpay: signature check, /pay/verify and signed webhook', async () => {
    const r = await guest('/api/orders', { body: { name: 'Ravi', phone: '9876543210', delivery: 'pickup', pay: 'online', items: [{ id: p1.id, q: 1 }] } }); const id = r.j.order.id;
    db.prepare("update orders set rzp_order='order_TEST1' where id=?").run(id);
    assert.strictEqual((await guest('/api/pay/verify', { body: { razorpay_order_id: 'order_TEST1', razorpay_payment_id: 'pay_1', razorpay_signature: 'bad' } })).s, 400);
    const sig = crypto.createHmac('sha256', 'secret123').update('order_TEST1|pay_1').digest('hex'); assert(verifySig('order_TEST1', 'pay_1', sig));
    assert.strictEqual((await guest('/api/pay/verify', { body: { razorpay_order_id: 'order_TEST1', razorpay_payment_id: 'pay_1', razorpay_signature: sig } })).j.order.pay_status, 'paid');
    const r2 = await guest('/api/orders', { body: { name: 'Ravi', phone: '9876543210', delivery: 'pickup', pay: 'online', items: [{ id: p1.id, q: 1 }] } }); db.prepare("update orders set rzp_order='order_TEST2' where id=?").run(r2.j.order.id);
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_2', order_id: 'order_TEST2' } } } });
    assert.strictEqual((await guest('/api/pay/webhook', { raw: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' } })).s, 400);
    assert.strictEqual((await guest('/api/pay/webhook', { raw: body, headers: { 'content-type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', 'hook123').update(body).digest('hex') } })).s, 200);
    assert.strictEqual(db.prepare('select pay_status from orders where id=?').get(r2.j.order.id).pay_status, 'paid');
  });
  await T('abandoned online payment is released after 30 min', async () => {
    const r = await guest('/api/orders', { body: { name: 'Ravi', phone: '9876543210', delivery: 'pickup', pay: 'online', items: [{ id: p1.id, q: 1 }] } }), id = r.j.order.id, s = db.prepare('select stock from products where id=?').get(p1.id).stock;
    db.prepare('update orders set created=? where id=?').run(Date.now() - 31 * 60000, id); sweep();
    assert.strictEqual(db.prepare('select status from orders where id=?').get(id).status, 'Cancelled'); assert.strictEqual(db.prepare('select stock from products where id=?').get(p1.id).stock, s + 1);
  });
  await T('owner settings: enable UPI, UPI order + UTR', async () => {
    const s = (await admin('/api/admin/settings')).j; s.upi = 'shop@upi'; s.wa = '919876543210'; assert.strictEqual((await admin('/api/admin/settings', { method: 'PUT', body: s })).j.upi, 'shop@upi');
    const r = await guest('/api/orders', { body: { name: 'Ravi', phone: '9876543210', delivery: 'pickup', pay: 'upi', items: [{ id: p1.id, q: 1 }] } }); assert.strictEqual(r.s, 200);
    assert.strictEqual((await guest(`/api/orders/${r.j.order.id}/utr`, { body: { phone: '9876543210', utr: '412345678901' } })).s, 200);
    assert.strictEqual((await admin('/api/admin/stats')).j.toVerify, 1);
  });
  await T('owner product CRUD with photo upload', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await admin('/api/admin/products', { body: { name: 'Test Serum', brand: 'Acme', category: 'Skincare', price: 500, mrp: 600, stock: 7, description: 'x', image: png } }); assert.strictEqual(r.s, 200);
    assert(r.j.image.startsWith('/uploads/') && fs.existsSync(path.join(process.env.DATA_DIR, 'uploads', path.basename(r.j.image))));
    assert.strictEqual((await admin('/api/admin/products', { body: { name: 'Bad', category: 'Skincare', price: -1, stock: 1 } })).s, 400);
    assert.strictEqual((await admin('/api/admin/products', { body: { name: 'Bad', category: 'Skincare', price: 5, stock: 1, image: 'data:text/html;base64,AAAA' } })).s, 400);
    assert.strictEqual((await admin(`/api/admin/products/${r.j.id}`, { method: 'PUT', body: { ...r.j, price: 450 } })).j.price, 450);
    assert((await guest('/api/products')).j.some(p => p.name === 'Test Serum'));
    await admin(`/api/admin/products/${r.j.id}`, { method: 'DELETE' }); assert(!(await guest('/api/products')).j.some(p => p.name === 'Test Serum'));
  });
  await T('orders CSV export + static pages', async () => {
    const c = await admin('/api/admin/orders.csv'); assert(String(c.j).includes(order.id));
    for (const p of ['/', '/admin', '/app.js', '/admin.js', '/style.css']) assert.strictEqual((await guest(p)).s, 200, p);
  });
  console.log(`\n${n} test groups passed`); srv.close();
})();
