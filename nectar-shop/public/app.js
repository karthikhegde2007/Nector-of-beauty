(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); }, sh = $('#sh');
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function ls(k, d) { try { var v = localStorage.getItem('nb_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function sv(k, v) { try { localStorage.setItem('nb_' + k, JSON.stringify(v)); } catch (e) {} }
function fd(s) { return new Date(String(s).slice(0, 10) + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function api(p, o) {
  o = o || {};
  return fetch(p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined, credentials: 'same-origin' })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); });
}
function toast(m) { var t = $('#ts'); t.textContent = m; try { t.showPopover(); } catch (e) {} t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); try { t.hidePopover(); } catch (e) {} }, 2600); }
function open(title, html) { $('#sht').textContent = title; $('#shb').innerHTML = html; sh.classList.remove('wide'); if (!sh.open) sh.showModal(); $('#shb').scrollTop = 0; }
function err(e) { toast(e.message || 'Something went wrong'); }

var CFG = { free: 499, fee: 49, categories: [] }, PRODS = [], ME = null, cart = ls('cart', {}), wishL = ls('wish', {}), wishS = {}, GUEST = ls('guest', []), F = { c: 'All', q: '', o: 'rel' };
function P(id) { return PRODS.filter(function (p) { return p.id == id; })[0]; }
function wished(id) { return ME ? !!wishS[id] : !!wishL[id]; }

/* ---------- catalogue ---------- */
function badges() { var c = 0; for (var k in cart) c += cart[k]; $('#cC').textContent = c || ''; $('#cW').textContent = (ME ? Object.keys(wishS) : Object.keys(wishL)).length || ''; }
function drawCats() { $('#cats').innerHTML = ['All'].concat(CFG.categories).map(function (c) { return '<button class="' + (F.c == c ? 'on' : '') + '" data-do="cat:' + esc(c) + '">' + esc(c) + '</button>'; }).join(''); }
function card(p) {
  var off = p.mrp > p.price ? Math.round((p.mrp - p.price) / p.mrp * 100) : 0;
  return '<article class="pc glass"><button class="hb" data-do="w:' + p.id + '" aria-label="Wishlist">' + (wished(p.id) ? '♥' : '♡') + '</button><div class="pi" data-do="v:' + p.id + '"><img loading="lazy" src="' + esc(p.image) + '" alt="' + esc(p.name) + '"></div><div class="pb"><small>' + esc(p.brand) + '</small><h3 data-do="v:' + p.id + '">' + esc(p.name) + '</h3><div class="pr"><b>' + inr(p.price) + '</b>' + (off ? '<s>' + inr(p.mrp) + '</s><em>' + off + '% off</em>' : '') + '</div>' + (p.stock > 0 ? '<button class="btn" data-do="add:' + p.id + '">Add to cart</button>' : '<span class="oos">Out of stock</span>') + '</div></article>';
}
function grid() {
  var q = F.q.toLowerCase(), a = PRODS.filter(function (p) { return (F.c == 'All' || p.category == F.c) && (!q || (p.name + ' ' + p.brand + ' ' + p.category).toLowerCase().indexOf(q) > -1); });
  if (F.o == 'lh') a.sort(function (x, y) { return x.price - y.price; }); if (F.o == 'hl') a.sort(function (x, y) { return y.price - x.price; });
  $('#grid').innerHTML = a.map(card).join(''); $('#none').hidden = a.length > 0;
}
function add(id) { var p = P(id), c = cart[id] || 0; if (c + 1 > p.stock) { toast('Only ' + p.stock + ' in stock'); return; } cart[id] = c + 1; sv('cart', cart); badges(); toast('Added to cart'); }
function toggleWish(id) {
  if (ME) { var had = wishS[id]; (had ? delete wishS[id] : wishS[id] = 1); api('/api/wishlist/' + id, { method: had ? 'DELETE' : 'PUT' }).catch(err); }
  else { if (wishL[id]) delete wishL[id]; else { wishL[id] = 1; toast('Saved to wishlist'); } sv('wish', wishL); }
  badges(); grid(); if (sh.open && $('#sht').textContent == 'Wishlist') wishV();
}
function detail(id) {
  var p = P(id), off = p.mrp > p.price ? Math.round((p.mrp - p.price) / p.mrp * 100) : 0;
  open(p.name, '<img class="dimg" src="' + esc(p.image) + '" alt="' + esc(p.name) + '"><small>' + esc(p.brand) + ' · ' + esc(p.category) + '</small><div class="pr big"><b>' + inr(p.price) + '</b>' + (off ? '<s>' + inr(p.mrp) + '</s><em>' + off + '% off</em>' : '') + '</div><p>' + esc(p.description) + '</p><p class="stk">' + (p.stock > 0 ? (p.stock < 6 ? 'Only ' + p.stock + ' left' : 'In stock') : 'Out of stock') + '</p><div class="trk"><input id="dp" inputmode="numeric" maxlength="6" placeholder="Delivery pincode"><button class="btn o" data-do="dp">Check</button></div><p id="dr" class="mut"></p><div class="row">' + (p.stock > 0 ? '<button class="btn" data-do="add:' + p.id + '">Add to cart</button><button class="btn o" data-do="buy:' + p.id + '">Buy now</button>' : '') + '<button class="btn o" data-do="w:' + p.id + '">' + (wished(id) ? 'Remove from wishlist' : 'Add to wishlist') + '</button></div>');
}
function wishV() {
  var k = Object.keys(ME ? wishS : wishL).filter(P);
  open('Wishlist', k.length ? k.map(function (i) { var p = P(i); return '<div class="ln"><img src="' + esc(p.image) + '" alt=""><div class="lb"><b>' + esc(p.name) + '</b><small>' + esc(p.brand) + '</small><div class="pr"><b>' + inr(p.price) + '</b></div><button class="lk" data-do="add:' + p.id + '">Add to cart</button><button class="lk" data-do="w:' + p.id + '">Remove</button></div></div>'; }).join('') : '<p class="em">Nothing saved yet. Tap the heart on any product.</p>');
}

/* ---------- cart & checkout ---------- */
function tot(dl) { var s = 0, m = 0; for (var k in cart) { var p = P(k); if (p) { s += p.price * cart[k]; m += Math.max(p.mrp, p.price) * cart[k]; } } var sp = dl == 'pickup' || s >= CFG.free ? 0 : CFG.fee; return { sub: s, save: m - s, ship: sp, total: s + sp }; }
function sumH(t) { return '<div class="sum"><div><span>Items</span><span>' + inr(t.sub) + '</span></div>' + (t.save > 0 ? '<div class="gr"><span>You save</span><span>' + inr(t.save) + '</span></div>' : '') + '<div><span>Delivery</span><span>' + (t.ship ? inr(t.ship) : 'Free') + '</span></div><div class="tt"><span>Total</span><span>' + inr(t.total) + '</span></div></div>'; }
function cartV() {
  var k = Object.keys(cart).filter(P);
  if (!k.length) { open('Your cart', '<p class="em">Your cart is empty.</p><button class="btn" data-do="close">Continue shopping</button>'); return; }
  var n = 0, h = k.map(function (i) { var p = P(i), q = cart[i]; n += q; return '<div class="ln"><img src="' + esc(p.image) + '" alt=""><div class="lb"><b>' + esc(p.name) + '</b><small>' + esc(p.brand) + '</small><div class="pr"><b>' + inr(p.price * q) + '</b></div><div class="qt"><button data-do="dec:' + i + '" aria-label="Less">−</button><span>' + q + '</span><button data-do="inc:' + i + '" aria-label="More">+</button></div><button class="lk" data-do="mv:' + i + '">Save for later</button><button class="lk" data-do="rm:' + i + '">Remove</button></div></div>'; }).join('');
  var t = tot('courier');
  open('Your cart (' + n + ')', h + sumH(t) + '<p class="mut">' + (t.ship ? 'Add ' + inr(CFG.free - t.sub) + ' more for free delivery.' : 'Free delivery applied.') + '</p><button class="btn full" data-do="co">Checkout</button>');
}
function fv(n) { var e = $('#shb [name=' + n + ']'); return e ? e.value.trim() : ''; }
function rv(n) { var e = $('#shb [name=' + n + ']:checked'); return e ? e.value : ''; }
function coV() {
  var k = Object.keys(cart).filter(P); if (!k.length) { cartV(); return; }
  var a = (ME && ME.last) || ls('addr', {}), nm = a.name || (ME && ME.user.name) || a.nm || '';
  open('Checkout', '<div class="fm"><label>Full name<input name="nm" autocomplete="name" value="' + esc(nm) + '"></label><label>Mobile number<input name="ph" inputmode="numeric" maxlength="10" autocomplete="tel" value="' + esc(a.phone || a.ph || '') + '"></label>' +
    '<div class="rad"><label><input type="radio" name="dl" value="courier" checked> Courier delivery</label><label><input type="radio" name="dl" value="pickup"> Pick up from store (free)</label></div>' +
    '<div id="adr" class="fm"><label>Address<textarea name="ad" rows="3" autocomplete="street-address">' + esc(a.address || a.ad || '') + '</textarea></label><label>Pincode<input name="pin" inputmode="numeric" maxlength="6" value="' + esc(a.pincode || a.pin || '') + '"></label></div><p id="eta" class="mut"></p><h4>Payment</h4>' +
    (CFG.online ? '<label class="rad"><input type="radio" name="py" value="online" checked> Pay online (UPI, cards, net banking)</label>' : '') +
    (CFG.upi ? '<label class="rad"><input type="radio" name="py" value="upi"' + (CFG.online ? '' : ' checked') + '> Pay by UPI app</label>' : '') +
    '<label class="rad"><input type="radio" name="py" value="cod"' + (CFG.online || CFG.upi ? '' : ' checked') + '> Cash on delivery / pay at store</label><div id="cosum"></div><button class="btn full" data-do="place">Place order</button></div>');
  coUp();
}
function coUp() {
  var dl = rv('dl') || 'courier'; $('#adr').hidden = dl == 'pickup'; $('#cosum').innerHTML = sumH(tot(dl)); var p = fv('pin');
  $('#eta').textContent = dl == 'pickup' ? 'Pick up: ' + CFG.pickup : (/^\d{6}$/.test(p) ? 'Checking delivery date…' : 'Enter your pincode to see the delivery estimate.');
  if (dl == 'courier' && /^\d{6}$/.test(p)) api('/api/delivery?pin=' + p).then(function (d) { if (fv('pin') == p) $('#eta').textContent = 'Estimated delivery ' + fd(d.from) + ' – ' + fd(d.to) + ' by courier'; }).catch(function () {});
}
function place() {
  var btn = $('#shb [data-do=place]'), dl = rv('dl'), py = rv('py'); btn.disabled = true;
  var body = { name: fv('nm'), phone: fv('ph'), delivery: dl, pay: py, address: fv('ad'), pincode: fv('pin'), items: Object.keys(cart).filter(P).map(function (i) { return { id: +i, q: cart[i] }; }) };
  api('/api/orders', { body: body }).then(function (r) {
    var o = r.order; sv('addr', { nm: body.name, ph: body.phone, ad: body.address, pin: body.pincode });
    if (!ME) { GUEST.unshift({ id: o.id, phone: body.phone }); GUEST = GUEST.slice(0, 20); sv('guest', GUEST); }
    cart = {}; sv('cart', cart); badges(); api('/api/products').then(function (p) { PRODS = p; grid(); }).catch(function () {});
    if (py == 'online') return payOnline(o, body.phone).then(function (po) { done(po || o, body.phone, !po); }); done(o, body.phone);
  }).catch(function (e) { btn.disabled = false; err(e); });
}
function loadRzp() { return new Promise(function (res, rej) { if (window.Razorpay) return res(); var s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = function () { rej(new Error('Could not load the payment window')); }; document.head.appendChild(s); }); }
function payOnline(o, phone) {
  return loadRzp().then(function () { return api('/api/orders/' + o.id + '/pay', { body: { phone: phone } }); }).then(function (d) {
    return new Promise(function (res) {
      var r = new window.Razorpay({ key: d.key, order_id: d.order_id, amount: d.amount, currency: 'INR', name: d.name, prefill: d.prefill, theme: { color: '#c9964a' },
        handler: function (x) { api('/api/pay/verify', { body: x }).then(function (v) { res(v.order); }).catch(function (e) { err(e); res(null); }); }, modal: { ondismiss: function () { res(null); } } });
      r.open();
    });
  }).catch(function (e) { err(e); return null; });
}
function waLink(o) {
  if (!CFG.wa) return ''; var m = 'Hi! I placed order ' + o.id + ' on your website (' + inr(o.total) + ', ' + (o.pay_method == 'cod' ? 'cash on delivery' : o.pay_method.toUpperCase()) + ').';
  return 'https://wa.me/' + CFG.wa + '?text=' + encodeURIComponent(m);
}
function done(o, phone, unpaid) {
  var wa = waLink(o), upi = o.pay_method == 'upi' && CFG.upi, pend = o.pay_method == 'online' && o.pay_status != 'paid';
  open(pend ? 'Complete payment' : 'Order placed', '<div class="ok">' + (pend ? '!' : '✓') + '</div><h3 style="text-align:center">' + (pend ? 'Payment pending' : 'Thank you, ' + esc(o.name) + '!') + '</h3><p class="mut" style="text-align:center">Order ID <b>' + o.id + '</b><br>' + (o.delivery == 'pickup' ? 'Pick up: ' + esc(CFG.pickup) : o.est ? 'Estimated delivery ' + fd(o.est.from) + ' – ' + fd(o.est.to) : '') + '</p>' +
    (pend ? '<p>Your order is saved but not paid yet. It will be released automatically if payment is not completed within 30 minutes.</p><button class="btn full" data-do="repay:' + o.id + ':' + phone + '">Pay ' + inr(o.total) + ' now</button>' : '') +
    (upi ? '<a class="btn full" href="upi://pay?pa=' + encodeURIComponent(CFG.upi) + '&pn=' + encodeURIComponent(CFG.shopName || 'Shop') + '&am=' + o.total + '&cu=INR&tn=' + o.id + '">Pay ' + inr(o.total) + ' with UPI</a><p class="mut">On a laptop, pay to UPI ID <b>' + esc(CFG.upi) + '</b> and mention ' + o.id + '. Then enter the UPI reference number so the shop can confirm it.</p><div class="trk"><input id="utr" placeholder="UPI reference / UTR number"><button class="btn o" data-do="utr:' + o.id + ':' + phone + '">Submit</button></div>' : '') +
    (wa ? '<a class="btn o full" href="' + esc(wa) + '" target="_blank" rel="noopener">Message the shop on WhatsApp</a>' : '') + '<button class="btn o full" data-do="acct">View my orders</button>');
}

/* ---------- orders & account ---------- */
function oc(o, phone) {
  var flow = o.flow, cancelled = o.status == 'Cancelled', s = flow.indexOf(o.status), last = s == flow.length - 1;
  var steps = cancelled ? '<p class="bad">Cancelled</p>' : '<div class="stp">' + flow.map(function (x, i) { return '<div class="' + (i <= s ? 'on' : '') + '">' + x + '</div>'; }).join('') + '</div>';
  var eta = cancelled || last ? '' : (o.eta ? '<p>Estimated delivery: <b>' + fd(o.eta) + '</b></p>' : (o.est ? '<p class="mut">Estimated delivery ' + fd(o.est.from) + ' – ' + fd(o.est.to) + '</p>' : ''));
  var ps = { pending: 'Payment pending', verify: 'Payment being verified', paid: 'Paid', failed: 'Payment failed', refund_due: 'Refund due', refunded: 'Refunded' }[o.pay_status];
  return '<div class="oc glass"><div class="ot"><b>' + o.id + '</b><span>' + new Date(o.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span></div><div class="mut">' + o.items.map(function (i) { return esc(i.name) + ' × ' + i.qty; }).join('<br>') + '</div><p><b>' + inr(o.total) + '</b> · ' + ({ cod: 'Cash on delivery', upi: 'UPI', online: 'Online' }[o.pay_method]) + ' · ' + ps + '</p>' + steps +
    (o.courier ? '<p>Courier: <b>' + esc(o.courier) + '</b>' + (o.tracking_no ? ' · Tracking no. <b>' + esc(o.tracking_no) + '</b>' : '') + (o.track_url ? ' · <a href="' + esc(o.track_url) + '" target="_blank" rel="noopener">Track on courier site</a>' : '') + '</p>' : '') + eta + (last ? '<p class="gr">' + (o.delivery == 'pickup' ? 'Collected' : 'Delivered') + '</p>' : '') +
    (o.status == 'Placed' ? '<button class="lk" data-do="cancel:' + o.id + ':' + (phone || '') + '">Cancel order</button>' : '') + '</div>';
}
function trackBox() { return '<h4>Track an order</h4><div class="fm"><input id="tid" placeholder="Order ID (e.g. NB261025K7Q)" autocapitalize="characters"><input id="tph" inputmode="numeric" maxlength="10" placeholder="Mobile number used for the order"><button class="btn o" data-do="trk">Track</button></div><div id="tres"></div>'; }
function acctV() {
  if (ME) {
    open('My account', '<p><b>' + esc(ME.user.name) + '</b><br><span class="mut">' + esc(ME.user.email) + '</span></p><button class="lk" data-do="logout">Log out</button>' + (ME.user.role == 'admin' ? '<a class="lk" href="/admin">Open owner dashboard</a>' : '') + '<h4>My orders</h4><div id="ol"><p class="mut">Loading…</p></div>' + trackBox());
    api('/api/orders/mine').then(function (l) { $('#ol').innerHTML = l.length ? l.map(function (o) { return oc(o); }).join('') : '<p class="mut">No orders yet.</p>'; }).catch(function (e) { $('#ol').textContent = e.message; });
  } else {
    open('My account', '<div class="tabs"><button aria-selected="true" data-do="am:login">Log in</button><button aria-selected="false" data-do="am:reg">Create account</button></div><div id="af"></div><h4>Recent orders on this device</h4><div id="ol"><p class="mut">' + (GUEST.length ? 'Loading…' : 'None yet.') + '</p></div>' + trackBox());
    authForm('login');
    if (GUEST.length) Promise.all(GUEST.slice(0, 8).map(function (g) { return api('/api/track?id=' + g.id + '&phone=' + g.phone).then(function (o) { return oc(o, g.phone); }).catch(function () { return ''; }); })).then(function (h) { $('#ol').innerHTML = h.join('') || '<p class="mut">None yet.</p>'; });
  }
}
function authForm(m) {
  document.querySelectorAll('#shb .tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.do == 'am:' + m); });
  $('#af').innerHTML = '<div class="fm">' + (m == 'reg' ? '<label>Full name<input name="an" autocomplete="name"></label><label>Mobile (optional)<input name="ap" inputmode="numeric" maxlength="10"></label>' : '') + '<label>Email<input name="ae" type="email" autocomplete="email"></label><label>Password' + (m == 'reg' ? ' (8+ characters)' : '') + '<input name="aw" type="password" autocomplete="' + (m == 'reg' ? 'new-password' : 'current-password') + '"></label><button class="btn full" data-do="' + (m == 'reg' ? 'reg' : 'login') + '">' + (m == 'reg' ? 'Create account' : 'Log in') + '</button></div>';
}
function afterAuth(r) {
  ME = r.user; ME.last = null; return api('/api/me').then(function (m) { ME = m.user; ME.last = m.last; wishS = {}; m.wishlist.forEach(function (i) { wishS[i] = 1; });
    var local = Object.keys(wishL); wishL = {}; sv('wish', wishL); return Promise.all(local.map(function (i) { wishS[i] = 1; return api('/api/wishlist/' + i, { method: 'PUT' }).catch(function () {}); })); }).then(function () { badges(); grid(); toast('Welcome, ' + ME.name); acctV(); });
}

/* ---------- actions ---------- */
var H = {
  cat: function (a) { F.c = a; drawCats(); grid(); }, add: add, w: toggleWish, v: detail, close: function () { sh.close(); }, buy: function (a) { add(a); coV(); },
  inc: function (a) { var p = P(a); if (cart[a] + 1 > p.stock) { toast('Only ' + p.stock + ' in stock'); return; } cart[a]++; sv('cart', cart); badges(); cartV(); },
  dec: function (a) { if (--cart[a] <= 0) delete cart[a]; sv('cart', cart); badges(); cartV(); }, rm: function (a) { delete cart[a]; sv('cart', cart); badges(); cartV(); },
  mv: function (a) { delete cart[a]; sv('cart', cart); badges(); if (!wished(a)) toggleWish(a); cartV(); }, co: coV, place: place, acct: acctV,
  dp: function () { var p = $('#dp').value.trim(); api('/api/delivery?pin=' + p).then(function (d) { $('#dr').textContent = 'Delivery between ' + fd(d.from) + ' and ' + fd(d.to) + ' by courier.'; }).catch(function (e) { $('#dr').textContent = e.message; }); },
  trk: function () { api('/api/track?id=' + encodeURIComponent($('#tid').value.trim()) + '&phone=' + encodeURIComponent($('#tph').value.trim())).then(function (o) { $('#tres').innerHTML = oc(o, $('#tph').value.trim()); }).catch(function (e) { $('#tres').innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; }); },
  am: authForm, logout: function () { api('/api/logout', { method: 'POST', body: {} }).then(function () { ME = null; wishS = {}; badges(); grid(); acctV(); }); },
  login: function () { api('/api/login', { body: { email: fv('ae'), password: fv('aw') } }).then(afterAuth).catch(err); },
  reg: function () { api('/api/register', { body: { name: fv('an'), phone: fv('ap'), email: fv('ae'), password: fv('aw') } }).then(afterAuth).catch(err); },
  cancel: function (a) { var id = a.split(':')[0], ph = a.split(':')[1]; api('/api/orders/' + id + '/cancel', { body: { phone: ph } }).then(function () { toast('Order cancelled'); api('/api/products').then(function (p) { PRODS = p; grid(); }); acctV(); }).catch(err); },
  utr: function (a) { var x = a.split(':'); api('/api/orders/' + x[0] + '/utr', { body: { phone: x[1], utr: $('#utr').value } }).then(function () { toast('Thanks! The shop will confirm your payment.'); }).catch(err); },
  repay: function (a) { var x = a.split(':'); api('/api/track?id=' + x[0] + '&phone=' + x[1]).then(function (o) { return payOnline(o, x[1]).then(function (po) { done(po || o, x[1]); }); }).catch(err); }
};
document.addEventListener('click', function (e) { var t = e.target.closest('[data-do]'); if (!t) return; var s = t.dataset['do'], i = s.indexOf(':'), a = i < 0 ? s : s.slice(0, i), b = i < 0 ? '' : s.slice(i + 1); if (H[a]) H[a](b, t); });
$('#shb').addEventListener('input', function (e) { if (e.target.name == 'pin') coUp(); }); $('#shb').addEventListener('change', function (e) { if (e.target.name == 'dl') coUp(); });
$('#q').oninput = function () { F.q = this.value; grid(); }; $('#so').onchange = function () { F.o = this.value; grid(); };
$('#bC').onclick = cartV; $('#bW').onclick = wishV; $('#oH').onclick = function (e) { e.preventDefault(); acctV(); }; $('#shx').onclick = function () { sh.close(); };
sh.addEventListener('click', function (e) { if (e.target == sh) sh.close(); });
Promise.all([api('/api/config'), api('/api/products'), api('/api/me')]).then(function (r) {
  CFG = r[0]; PRODS = r[1]; ME = r[2].user; if (ME) { ME.last = r[2].last; r[2].wishlist.forEach(function (i) { wishS[i] = 1; }); }
  drawCats(); grid(); badges();
}).catch(function () { $('#grid').innerHTML = '<p class="em">Could not load products. Please refresh.</p>'; });
})();
