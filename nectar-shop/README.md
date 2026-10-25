# Nectar of Beauty – online shop

A complete small-shop website: marketing pages, product catalogue, customer accounts, cart, wishlist,
checkout (courier delivery or store pickup), payments (Razorpay online, UPI, cash on delivery),
order tracking, and a password-protected **owner dashboard**.

- **Stack:** Node.js 20+ · Express · SQLite (one file) · plain HTML/CSS/JS (no build step)
- **Customers:** browse, search, wishlist, cart, checkout, track orders (account or guest with order ID + mobile)
- **Owner (`/admin`):** dashboard, orders (status, courier, tracking number, estimated date, payment status, CSV export),
  products (add/edit/hide, stock, price, photo editor with background removal), settings (UPI, WhatsApp, delivery rules, couriers)

## 1. Run it on your computer

```bash
npm install
cp .env.example .env        # then edit: ADMIN_EMAIL and ADMIN_PASSWORD
# macOS/Linux:  export $(grep -v '^#' .env | xargs)      Windows: set the variables in your terminal
npm start                   # http://localhost:3000   owner: http://localhost:3000/admin
npm test                    # runs the automated checks
```

On the first start the owner account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(if you forget to set them, a random password is printed in the terminal once).
The shop starts with 26 sample products (placeholder prices and tile images) – replace them in **/admin → Products**.

## 2. Put it online (pick one)

The server needs a **persistent disk**, because orders and photos are stored in the `data/` folder
(`shop.db` + `uploads/`). Free hosts that erase files on restart are not suitable.

**Option A – Railway / Render / Fly.io (easiest, about ₹400–700/month with a disk)**
1. Push this folder to a private GitHub repository (do not commit `.env`).
2. Create a new web service from the repo (or use the Dockerfile). Start command: `npm start`.
3. Add a persistent disk/volume mounted at `/app/data` and set `DATA_DIR=/app/data`.
4. Set the environment variables from `.env.example` in the host's dashboard.
5. Add your domain (for example `nectarofbeauty.in`) and enable HTTPS (the host does this for you).

**Option B – a small VPS (DigitalOcean, Hetzner, AWS Lightsail)**
`docker build -t nectar . && docker run -d --restart always -p 3000:3000 -v /srv/nectar-data:/app/data --env-file .env nectar`,
then put Nginx or Caddy in front for HTTPS. Back up `/srv/nectar-data` daily.

## 3. Switch on online payments (Razorpay)

1. The shop owner creates a Razorpay account in the **shop's name** and completes KYC.
2. Copy the **Key ID** and **Key Secret** (Settings → API Keys) into `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
3. In Razorpay Dashboard → Webhooks, add `https://YOUR-DOMAIN/api/pay/webhook`, tick **payment.captured** and **order.paid**,
   set a secret and put it in `RAZORPAY_WEBHOOK_SECRET`. Restart the server.
4. Test with Razorpay **test keys** first, then switch to live keys.

When keys are present, "Pay online" appears at checkout. Payments are verified on the server (signature check);
an unpaid online order is cancelled automatically after 30 minutes and its stock is released.
**UPI app payment** (manual confirmation) turns on when the owner enters a UPI ID in /admin → Settings.

> The Razorpay connection could not be tested against Razorpay's live servers while this was built.
> The signature verification and webhook handling are covered by automated tests; do a real test payment
> with test keys before launch.

## 4. Daily use by the owner

- **/admin → Orders:** new orders appear at the top (the browser tab shows the number of new orders). Set the status
  (Confirmed → Packed → Shipped → Out for delivery → Delivered), courier, tracking number and the estimated date,
  then **Save update**. The customer sees it immediately under *My account → My orders* or *Track an order*.
- For UPI orders, check the UPI reference the customer sends, then set payment to **paid**.
- Cancelling an order puts the stock back. Paid orders that are cancelled are marked **refund due** – refund from Razorpay/UPI yourself.
- **/admin → Products:** upload a photo; tick *Remove plain background* for photos with a white background.
- **Back up** the `data/` folder regularly. **Export CSV** gives all orders for accounts.

## 5. Handover checklist (before you hand this to a client)

- [ ] Set a strong owner password; the client changes nothing else on the server
- [ ] Domain, hosting and Razorpay accounts are in the **client's** name
- [ ] Replace sample prices, stock and product photos (use photos you have the right to use – brand photos belong to the brands)
- [ ] Settings: WhatsApp number, UPI ID, delivery charge, free-delivery limit, delivery days, couriers and tracking link
- [ ] Edit `public/policies.html` (shipping, returns, privacy, terms, seller details, grievance contact) and have it reviewed by a lawyer
- [ ] Place a test order for each payment type and delivery type, and cancel one
- [ ] Set up daily backups of the `data/` folder

## 6. What is not included (be clear with the client)

- Automatic SMS/email/WhatsApp notifications to customers (the order shows in the dashboard; the customer can message the shop on WhatsApp from the confirmation screen)
- GST invoices, coupon codes, product reviews, automatic refunds, courier-API booking and live courier tracking (the owner pastes the courier's tracking number and link)
- Multiple staff accounts (one owner account; customers have separate accounts)
- Running on several servers at once (SQLite is a single-file database – fine for a single shop)

## 7. Security notes

Passwords are hashed (bcrypt); login cookies are HttpOnly and signed; prices are always calculated on the server;
stock changes happen inside database transactions; owner routes are checked on the server; uploads accept only PNG/WebP/JPEG up to 900 KB;
login and ordering are rate-limited; a strict Content-Security-Policy is set. Keep Node.js and the npm packages updated
(`npm audit`, `npm update`) and serve the site only over HTTPS.

## Files

`server.js` backend · `public/index.html` storefront · `public/app.js` storefront logic · `public/admin.html` + `admin.js` owner dashboard ·
`public/style.css` design · `public/policies.html` policy templates · `seed.json` sample products · `test.js` automated checks
