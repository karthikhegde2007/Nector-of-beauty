(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); }, M = $('#main'), CATS = ['Haircare', 'Bodycare', 'Makeup', 'Skincare', 'Baby & essentials'];
var TAB = 'dash', ORD = [], PRO = [], SET = null, EDIT = null, PE = null, timer = null;
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function api(p, o) { o = o || {}; return fetch(p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined, credentials: 'same-origin' }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Request failed'); return j; }); }); }
function toast(m) { var t = $('#ts'); t.textContent = m; try { t.showPopover(); } catch (e) {} t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); try { t.hidePopover(); } catch (e) {} }, 2600); }
function err(e) { toast(e.message || 'Something went wrong'); }
function g(id) { var e = $('#' + id); return e ? e.value.trim() : ''; }
var FLOW = { courier: ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'], pickup: ['Placed', 'Confirmed', 'Ready for pickup', 'Collected'] };

function loginV() {
  M.innerHTML = '<div class="login glass" style="padding:26px"><h2 style="font-size:1.8rem">Owner login</h2><p class="mut">Sign in with the owner account.</p><div class="fm"><label>Email<input id="le" type="email" autocomplete="username"></label><label>Password<input id="lp" type="password" autocomplete="current-password"></label><button class="btn full" data-do="login">Log in</button></div><p><a class="lk" href="/">← Back to shop</a></p></div>';
}
function shell(body) {
  var tabs = [['dash', 'Dashboard'], ['orders', 'Orders'], ['products', 'Products'], ['settings', 'Settings']];
  M.innerHTML = '<div class="top"><h1>Owner dashboard</h1><div><a class="btn o" href="/">View shop</a><button class="btn o" data-do="logout">Log out</button></div></div><div class="tabs">' + tabs.map(function (t) { return '<button aria-selected="' + (TAB == t[0]) + '" data-do="tab:' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' + body;
}
function show() { if (TAB == 'dash') dash(); else if (TAB == 'orders') orders(); else if (TAB == 'products') products(); else settings(); }
function dash() {
  api('/api/admin/stats').then(function (s) {
    shell('<div class="stats"><div class="stat glass"><b>' + s.today.n + '</b><span>Orders today</span></div><div class="stat glass"><b>' + inr(s.today.t) + '</b><span>Sales today</span></div><div class="stat glass"><b>' + s.open + '</b><span>Open orders</span></div><div class="stat glass"><b>' + s.toVerify + '</b><span>UPI payments to verify</span></div><div class="stat glass"><b>' + inr(s.revenue) + '</b><span>Delivered revenue</span></div></div><h3>Orders by status</h3><p>' + (s.byStatus.map(function (x) { return '<span class="tag">' + esc(x.status) + ': ' + x.n + '</span>'; }).join('') || '<span class="mut">No orders yet</span>') + '</p><h3>Low stock (5 or fewer)</h3>' + (s.low.length ? s.low.map(function (p) { return '<p>' + esc(p.name) + ' <span class="tag warn">' + p.stock + ' left</span></p>'; }).join('') : '<p class="mut">All good.</p>'));
  }).catch(function (e) { if (/Owner access/.test(e.message)) loginV(); else err(e); });
}
function orderCard(o) {
  var flow = FLOW[o.delivery], eta = o.eta || (o.est ? o.est.to : '');
  return '<div class="oc glass" id="o_' + o.id + '"><div class="ot"><b>' + o.id + '</b><span>' + new Date(o.created).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span></div>' +
    '<p><b>' + esc(o.name) + '</b> · <a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="https://wa.me/91' + esc(o.phone) + '" target="_blank" rel="noopener">WhatsApp</a><br>' + (o.delivery == 'pickup' ? 'Store pickup' : esc(o.address) + ' – ' + esc(o.pincode)) + '</p>' +
    '<p class="mut">' + o.items.map(function (i) { return esc(i.name) + ' × ' + i.qty + ' (' + inr(i.price * i.qty) + ')'; }).join('<br>') + '</p><p><b>' + inr(o.total) + '</b> (delivery ' + inr(o.shipping) + ') · ' + ({ cod: 'Cash on delivery', upi: 'UPI', online: 'Online' }[o.pay_method]) + (o.utr ? ' · UTR <b>' + esc(o.utr) + '</b>' : '') + '</p>' +
    '<div class="fm cols"><label>Status<select data-f="status">' + flow.map(function (x) { return '<option' + (o.status == x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '<option' + (o.status == 'Cancelled' ? ' selected' : '') + '>Cancelled</option></select></label>' +
    '<label>Payment<select data-f="pay_status">' + ['pending', 'verify', 'paid', 'failed', 'refund_due', 'refunded'].map(function (x) { return '<option value="' + x + '"' + (o.pay_status == x ? ' selected' : '') + '>' + x.replace('_', ' ') + '</option>'; }).join('') + '</select></label>' +
    (o.delivery == 'courier' ? '<label>Courier<input data-f="courier" list="crl" value="' + esc(o.courier || '') + '"></label><label>Tracking number<input data-f="tracking_no" value="' + esc(o.tracking_no || '') + '"></label><label>Estimated delivery date<input type="date" data-f="eta" value="' + esc(eta) + '"></label>' : '') + '</div><button class="btn" data-do="so:' + o.id + '" style="margin-top:10px">Save update</button></div>';
}
function orders() {
  var f = window.__of || '';
  api('/api/admin/orders' + (f ? '?status=' + encodeURIComponent(f) : '')).then(function (r) {
    ORD = r; var open = r.filter(function (o) { return o.status == 'Placed'; }).length; document.title = (open ? '(' + open + ') ' : '') + 'Owner dashboard';
    shell('<datalist id="crl">' + (SET ? SET.couriers : []).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist><div class="note"><span>' + r.length + ' orders' + (open ? ' · <b>' + open + ' new</b>' : '') + '</span><span><select id="of" data-do="of" style="width:auto"><option value="">All statuses</option>' + ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered', 'Ready for pickup', 'Collected', 'Cancelled'].map(function (x) { return '<option' + (f == x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select> <a class="btn o" href="/api/admin/orders.csv">Export CSV</a></span></div>' + (r.length ? r.map(orderCard).join('') : '<p class="em">No orders yet.</p>'));
  }).catch(err);
}
function products() {
  api('/api/admin/products').then(function (r) {
    PRO = r;
    shell('<button class="btn" data-do="np">+ Add product</button>' + (EDIT ? pform() : '') + '<div class="pl">' + r.map(function (p) { return '<div class="ln"><img src="' + esc(p.image) + '" alt=""><div class="lb"><b>' + esc(p.name) + (p.active ? '' : ' <span class="tag warn">hidden</span>') + '</b><small>' + inr(p.price) + ' · MRP ' + inr(p.mrp) + ' · stock ' + p.stock + ' · ' + esc(p.category) + '</small><button class="lk" data-do="ep:' + p.id + '">Edit product &amp; photo</button></div></div>'; }).join('') + '</div>');
    if (EDIT && EDIT.id) loadPE(EDIT.image, true);
  }).catch(err);
}
function pform() {
  var p = EDIT; PE = null;
  return '<div class="oc glass fm"><label>Name<input id="f_n" value="' + esc(p.name) + '"></label><div class="fm cols"><label>Brand<input id="f_b" value="' + esc(p.brand) + '"></label><label>Category<select id="f_c">' + CATS.map(function (c) { return '<option' + (p.category == c ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select></label></div><div class="fm cols"><label>Selling price (₹)<input id="f_p" type="number" value="' + (p.price || '') + '"></label><label>MRP (₹)<input id="f_m" type="number" value="' + (p.mrp || '') + '"></label><label>Stock<input id="f_s" type="number" value="' + (p.stock == null ? '' : p.stock) + '"></label></div><label>Description<textarea id="f_d" rows="2">' + esc(p.description) + '</textarea></label><label class="rad"><input type="checkbox" id="f_a"' + (p.active !== 0 ? ' checked' : '') + '> Visible in shop</label>' +
    '<label>Product photo (upload a new one)<input id="f_i" type="file" accept="image/*"></label><div id="pe" hidden><canvas id="pv" width="360" height="360" style="width:100%;max-width:360px;display:block;margin:0 auto 10px;border-radius:14px;background:radial-gradient(circle at 50% 40%,#fff,#e8ddd0)"></canvas><label>Zoom<input type="range" id="pe_z" min="40" max="220" value="100"></label><div class="fm cols"><label>Move left / right<input type="range" id="pe_x" min="-100" max="100" value="0"></label><label>Move up / down<input type="range" id="pe_y" min="-100" max="100" value="0"></label><label>Brightness<input type="range" id="pe_b" min="60" max="150" value="100"></label><label>Contrast<input type="range" id="pe_c" min="60" max="150" value="100"></label></div><label class="rad"><input type="checkbox" id="pe_rm"> Remove plain background</label><label>Background removal strength<input type="range" id="pe_t" min="5" max="70" value="28"></label><div class="row"><button class="btn o" data-do="rot">Rotate</button><button class="btn o" data-do="per">Reset</button></div><p class="mut">Background removal works best on a photo with a plain white background. Tick it off if the photo is already transparent.</p></div>' +
    '<div class="row"><button class="btn" data-do="sp">Save product</button><button class="btn o" data-do="cp">Cancel</button></div></div>';
}
function settings() {
  api('/api/admin/settings').then(function (s) {
    SET = s; var d = s.dl;
    shell('<div class="oc glass fm"><div class="fm cols"><label>Shop name<input id="s_name" value="' + esc(s.shopName) + '"></label><label>WhatsApp number (e.g. 919876543210)<input id="s_wa" value="' + esc(s.wa) + '"></label><label>UPI ID for payments (leave empty to switch off)<input id="s_upi" value="' + esc(s.upi) + '"></label></div><div class="fm cols"><label>Free delivery above (₹)<input id="s_free" type="number" value="' + s.free + '"></label><label>Delivery charge below that (₹)<input id="s_fee" type="number" value="' + s.fee + '"></label></div><h3>Delivery days</h3><div class="fm cols">' + [['l', 'Sirsi &amp; nearby (5814xx)'], ['s', 'Rest of Karnataka'], ['i', 'Rest of India']].map(function (z) { return '<label>' + z[1] + ' – from (days)<input id="d_' + z[0] + '0" type="number" value="' + d[z[0]][0] + '"></label><label>to (days)<input id="d_' + z[0] + '1" type="number" value="' + d[z[0]][1] + '"></label>'; }).join('') + '</div><label>Couriers you use (comma separated)<input id="s_cr" value="' + esc(s.couriers.join(', ')) + '"></label><label>Tracking link ({id} is replaced by the tracking number)<input id="s_trk" value="' + esc(s.trackUrl) + '" placeholder="https://www.delhivery.com/track/package/{id}"></label><label>Store pickup address<input id="s_pk" value="' + esc(s.pickup) + '"></label><button class="btn" data-do="ss">Save settings</button><p class="mut">Online card/UPI payments are switched on by the server (Razorpay keys). See README.</p></div>');
  }).catch(err);
}
/* ----- photo editor ----- */
function cutBg(im, tol) {
  var w = im.naturalWidth, h = im.naturalHeight, m = Math.min(1, 700 / Math.max(w, h)), W = Math.max(1, Math.round(w * m)), H = Math.max(1, Math.round(h * m)), c = document.createElement('canvas'); c.width = W; c.height = H;
  var gx = c.getContext('2d'); gx.drawImage(im, 0, 0, W, H); var d = gx.getImageData(0, 0, W, H), p = d.data, n = W * H, seen = new Uint8Array(n), q = new Int32Array(n), qs = 0, qe = 0, i, x, y, br = 0, bg = 0, bb = 0;
  [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].forEach(function (a) { var o = (a[1] * W + a[0]) * 4; br += p[o] / 4; bg += p[o + 1] / 4; bb += p[o + 2] / 4; }); var th = tol * tol * 9;
  function ok(i) { var o = i * 4, dr = p[o] - br, dg = p[o + 1] - bg, db = p[o + 2] - bb; return dr * dr + dg * dg + db * db <= th; }
  function push(i) { if (!seen[i] && ok(i)) { seen[i] = 1; q[qe++] = i; } }
  for (x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (qs < qe) { i = q[qs++]; x = i % W; y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
  for (i = 0; i < n; i++) if (seen[i]) p[i * 4 + 3] = 0;
  for (i = 0; i < n; i++) if (!seen[i]) { x = i % W; y = (i / W) | 0; if ((x > 0 && seen[i - 1]) || (x < W - 1 && seen[i + 1]) || (y > 0 && seen[i - W]) || (y < H - 1 && seen[i + W])) p[i * 4 + 3] = 150; }
  gx.putImageData(d, 0, 0); return c;
}
function peOut(S) { var c = document.createElement('canvas'); c.width = c.height = S; var x = c.getContext('2d'), src = PE.rm ? (PE.cut || (PE.cut = cutBg(PE.im, PE.tol))) : PE.im, sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, k = Math.min(S / sw, S / sh) * .86 * PE.z; x.filter = 'brightness(' + PE.b + '%) contrast(' + PE.c + '%)'; x.translate(S / 2 + PE.x * S / 200, S / 2 + PE.y * S / 200); x.rotate(PE.r * Math.PI / 2); x.drawImage(src, -sw * k / 2, -sh * k / 2, sw * k, sh * k); return c; }
function peDraw() { var e = $('#pv'); if (!e || !PE) return; var x = e.getContext('2d'); x.clearRect(0, 0, 360, 360); x.drawImage(peOut(360), 0, 0); }
function peURL() { var c = peOut(600), u = c.toDataURL('image/webp', .9); return u.indexOf('image/webp') > 5 ? u : c.toDataURL('image/png'); }
function peUI() { var e = $('#pe'); if (!e) return; e.hidden = false; var v = { z: PE.z * 100, x: PE.x, y: PE.y, b: PE.b, c: PE.c, t: PE.tol }; for (var k in v) $('#pe_' + k).value = v[k]; $('#pe_rm').checked = PE.rm; }
function loadPE(url, keep) { var im = new Image(); im.onload = function () { PE = { im: im, z: 1, x: 0, y: 0, b: 100, c: 100, r: 0, rm: !keep, tol: 28, cut: null }; if (!$('#pe')) return; peUI(); peDraw(); }; im.src = url; }
/* ----- actions ----- */
var H = {
  login: function () { api('/api/login', { body: { email: g('le'), password: g('lp') } }).then(function (r) { if (r.user.role != 'admin') { api('/api/logout', { body: {} }); throw new Error('This account is not the owner account'); } start(); }).catch(err); },
  logout: function () { api('/api/logout', { body: {} }).then(loginV); },
  tab: function (t) { TAB = t; EDIT = null; show(); }, of: function () { window.__of = $('#of').value; orders(); },
  so: function (id) {
    var c = $('#o_' + id), body = {}; c.querySelectorAll('[data-f]').forEach(function (e) { body[e.dataset.f] = e.value.trim(); });
    api('/api/admin/orders/' + id, { method: 'PATCH', body: body }).then(function () { toast('Order updated'); orders(); }).catch(err);
  },
  np: function () { EDIT = { active: 1 }; products(); }, ep: function (id) { EDIT = PRO.filter(function (p) { return p.id == id; })[0]; products(); }, cp: function () { EDIT = null; products(); },
  sp: function () {
    var b = { name: g('f_n'), brand: g('f_b'), category: g('f_c'), price: g('f_p'), mrp: g('f_m'), stock: g('f_s'), description: g('f_d'), active: $('#f_a').checked ? 1 : 0 }; if (PE) b.image = peURL();
    api(EDIT.id ? '/api/admin/products/' + EDIT.id : '/api/admin/products', { method: EDIT.id ? 'PUT' : 'POST', body: b }).then(function () { EDIT = null; toast('Product saved'); products(); }).catch(err);
  },
  rot: function () { if (PE) { PE.r = (PE.r + 1) % 4; peDraw(); } }, per: function () { if (PE) { PE.z = 1; PE.x = PE.y = 0; PE.b = PE.c = 100; PE.r = 0; PE.cut = null; peUI(); peDraw(); } },
  ss: function () {
    var dl = {}; ['l', 's', 'i'].forEach(function (z) { dl[z] = [+g('d_' + z + '0'), +g('d_' + z + '1')]; });
    api('/api/admin/settings', { method: 'PUT', body: { shopName: g('s_name'), wa: g('s_wa'), upi: g('s_upi'), free: g('s_free'), fee: g('s_fee'), dl: dl, couriers: g('s_cr'), trackUrl: g('s_trk'), pickup: g('s_pk') } }).then(function (s) { SET = s; toast('Settings saved'); settings(); }).catch(err);
  }
};
document.addEventListener('click', function (e) { var t = e.target.closest('[data-do]'); if (!t || t.tagName == 'SELECT') return; var s = t.dataset['do'], i = s.indexOf(':'), a = i < 0 ? s : s.slice(0, i), b = i < 0 ? '' : s.slice(i + 1); if (H[a]) H[a](b, t); });
document.addEventListener('change', function (e) {
  if (e.target.id == 'of') H.of();
  if (e.target.id == 'f_i' && e.target.files[0]) { var f = e.target.files[0], r = new FileReader(); r.onload = function () { loadPE(r.result, f.type == 'image/png'); }; r.readAsDataURL(f); }
  if (e.target.id == 'pe_rm' && PE) { PE.rm = e.target.checked; peDraw(); }
});
document.addEventListener('input', function (e) { if (PE && /^pe_/.test(e.target.id) && e.target.type == 'range') { var k = e.target.id.slice(3), v = +e.target.value; if (k == 'z') PE.z = v / 100; if (k == 'x') PE.x = v; if (k == 'y') PE.y = v; if (k == 'b') PE.b = v; if (k == 'c') PE.c = v; if (k == 't') { PE.tol = v; PE.cut = null; } peDraw(); } });
function start() { api('/api/admin/settings').then(function (s) { SET = s; show(); clearInterval(timer); timer = setInterval(function () { if (TAB == 'orders' && !document.activeElement.closest('.oc')) orders(); }, 60000); }).catch(function () { loginV(); }); }
start();
})();
