# ShaadiSahulat — Deployment Guide (Vercel + Railway Hobby + Resend)

Status: **prepared locally, nothing deployed.** Email delivery is **not proven** until you receive a real OTP
email (section 4, step 6). A separate Railway project `ShaadiSahulat` keeps this completely apart from Hafiz Hospital.

## 1. Architecture

```
Browser ──► Vercel (static Vite build, SPA rewrite)         VITE_API_URL, VITE_ML_URL
   │
   ▼
Railway project "ShaadiSahulat"  (one region for all four services)
  api         Node/Express + Socket.IO    root /                    PUBLIC domain
  visual-ml   Flask + PyTorch (CPU)       root /visual-ml-service   PUBLIC domain (only /images + /health open)
  ml-service  Flask + scikit-learn        root /ml-service          private only
  MongoDB     Railway template, volume                              private only
External: Resend (email over HTTPS), Cloudinary (images), Groq, Kling/fal (try-on), Polar (cards)
Not deployed at launch: tone-voice (Kokoro TTS)  ->  REVIEW_TTS_ENABLED=false
```

Why Resend: Railway Hobby blocks outbound SMTP (ports 25/465/587), and sign-up here is OTP-first, so SMTP
cannot work on Hobby. `EMAIL_TRANSPORT=resend` sends over HTTPS (port 443). SMTP, console and disabled modes still exist.

## 2. Before anything: getting the code to Railway (your decision)

Railway builds from GitHub (or from your laptop with the Railway CLI). The Dockerfiles and fixes exist only in your
local patch until you move them. Nothing here commits or pushes for you. Choose one:
- push a new branch yourself and point each Railway service at it, or
- deploy from your laptop with `railway up` (per service, from the right folder).

Railway's GitHub access: authorize only the `Shaadi-Sahulat` repository. Do not add any AI account as a collaborator.

## 3. Local changes in the patch

| Area | Change |
|---|---|
| `lib/mailer.js` | New `EMAIL_TRANSPORT=resend` (HTTPS API via the existing `axios`). One retry on 429/5xx/timeouts with an idempotency key. Errors never contain the API key, OTP or link. No fallback between modes. SMTP/console/disabled unchanged. |
| `scripts/send-test-email.js` | Reports Resend success too. |
| `tests/auth/mailer-resend.test.js` | 11 tests against a local fake Resend API (no real email). |
| `.env.example` | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`. |
| `server.js`, `lib/storage.js`, `lib/ocr.js`, test, migration script, `.gitignore` | `Uploads` -> `uploads` (Linux is case-sensitive). `server.js` also sets `trust proxy` (real client IPs for rate limiting). |
| `package.json` | engines Node `>=20`. |
| `services/visualClient.js`, `controllers/visualController.js` | `VISUAL_ML_PUBLIC_URL` for browser-facing image links. |
| `visual-ml-service/mongo_catalog.py` | No longer prints the Mongo URI (it contains the password). |
| `vercel.json`, `ml-service/` and `visual-ml-service/` Dockerfile + `.dockerignore` | Deployment files. **There are no `railway.json` files**: Railway's Config as Code is deprecated for new services, so everything is set in the dashboard (section 5). |
| `scripts/backup/*` | Windows `mongodump`/`mongorestore` scripts and guide. |

## 4. Resend setup (do this first; it needs a domain you own)

You need a domain you can edit DNS for (for example `yourdomain.com`). Resend only delivers `onboarding@resend.dev`
mail to your own account address, so without a verified domain real users never receive OTPs.

1. Create an account at resend.com. The free plan allows 100 emails/day and 3,000/month.
2. **Domains -> Add Domain.** Prefer a sending subdomain such as `mail.yourdomain.com`. Pick the region closest to your users.
3. Resend shows DNS records (DKIM TXT at `resend._domainkey`, and SPF TXT/MX or CNAME records on the `send` subdomain). Add them
   at the DNS provider that actually controls your domain, **copying the values exactly as shown**. In Cloudflare set them to "DNS only".
4. Click **Verify DNS Records**. It often completes within about 15 minutes, but can take longer.
5. **API Keys -> Create API Key**, permission **Sending access**, restricted to your domain if offered. Copy it once, store it in a password manager.
6. Set the sender: `RESEND_FROM=ShaadiSahulat <no-reply@mail.yourdomain.com>` (must be on the verified domain).
7. **Prove delivery locally** (section 9) before Railway: `node scripts/send-test-email.js you@gmail.com`, then register a test buyer and confirm the OTP email actually arrives
   (check Spam). Only then is email "working". Repeat once on Railway after deploying.

Daily limit: each sign-up OTP, resend and password reset is one email. 100/day is plenty for a demo; exceeding it pauses sending on the free plan.

## 5. Railway dashboard settings (exact)

Create the project `ShaadiSahulat`. For every service use the **same region** and **1 replica**.
Settings are in the service's *Settings* tab. Do not add `railway.json`.

| Setting | MongoDB | `api` | `ml-service` | `visual-ml` |
|---|---|---|---|---|
| How to add | + New -> Database -> MongoDB (name it `MongoDB`) | + New -> GitHub Repo (or CLI) -> name it `api` | same repo -> name it `ml-service` | same repo -> name it `visual-ml` |
| Root directory | n/a | `/` | `/ml-service` | `/visual-ml-service` |
| Builder | template | default (Railpack/Nixpacks) | **Dockerfile** | **Dockerfile** |
| Build command | n/a | `npm ci --omit=dev` | (Dockerfile) leave empty | (Dockerfile) leave empty |
| Start command | template | `node server.js` | leave empty (Dockerfile `CMD python app.py`) | leave empty (Dockerfile `CMD python app.py`) |
| Health check path | n/a | `/api/health` | `/health` | `/health` |
| Health check timeout | n/a | 120 s | 300 s | 300 s |
| Restart policy | default | On failure, max 5 | On failure, max 5 | On failure, max 5 |
| Public networking | **none** (TCP proxy only temporarily for backups) | Generate Domain | **none** | Generate Domain, target port **5002** |
| Watch paths (optional) | n/a | `/*.js`, `/lib/**`, `/routes/**`, `/controllers/**`, `/models/**`, `/services/**`, `/config/**`, `/package*.json` | `/ml-service/**` | `/visual-ml-service/**` |
| Volume | template creates one; confirm it exists | none | none | none |

Notes:
- Do not set `PORT` anywhere. Railway sets it for `api`. The Python services use fixed ports 5001 (ml-service) and 5002 (visual-ml).
- The build command `npm ci --omit=dev` skips Vite and other dev tools, which the API does not need (Vercel builds the frontend).
- Private addresses look like `http://visual-ml.railway.internal:5002`. The service name is whatever you named it, and the port is mandatory.
- Python services bind with `VISUAL_ML_HOST=::` / `ML_SERVICE_HOST=::` so the private network can reach them.
- First `visual-ml` start can be slow (PyTorch image, ImageNet weights download). Wait for the health check to pass.

## 6. Environment-variable checklist

R = required, O = optional. Generate secrets on your own machine; never paste them into chat or commit them.

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET, INTERNAL_API_SECRET (different values)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"         # BNPL_CRYPTO_KEY (exactly 64 hex chars)
node scripts/hash-bank-officer-password.js                                       # BANK_OFFICER_PASSWORD_HASH (hidden prompt)
```

### `api`
| Variable | R/O | Value / source |
|---|---|---|
| `NODE_ENV` | R | `production` |
| `FRONTEND_ORIGIN` | R | exact Vercel origin, no path/slash (section 7) |
| `JWT_ACCESS_SECRET` | R | generated, at least 32 chars |
| `INTERNAL_API_SECRET` | R | generated; **same value on api, ml-service, visual-ml** |
| `BNPL_CRYPTO_KEY` | R | generated, 64 hex chars; set once, never change after real data exists |
| `MONGODB_URI` | R | `mongodb://<user>:<password>@<mongo private host>:27017/shaadi-sahulat?authSource=admin` (build from the Mongo service's variables; the database name `shaadi-sahulat` is required) |
| `VISUAL_ML_URL` | R | `http://<visual-ml>.railway.internal:5002` |
| `VISUAL_ML_PUBLIC_URL` | R | public `https://…up.railway.app` domain of visual-ml |
| `ML_SERVICE_URL` | R | `http://<ml-service>.railway.internal:5001` |
| `EMAIL_TRANSPORT` | R | `resend` |
| `RESEND_API_KEY` | R | Resend dashboard (section 4) |
| `RESEND_FROM` | R | `ShaadiSahulat <no-reply@mail.yourdomain.com>` (verified domain) |
| `RESEND_REPLY_TO` | O | support address |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | R | Cloudinary dashboard (missing = silent fallback to disk lost on redeploy) |
| `BANK_OFFICER_EMAIL`, `BANK_OFFICER_PASSWORD_HASH` | R for bank portal | you choose; hash from script |
| `REVIEW_TTS_ENABLED` | R | `false` |
| `GROQ_API_KEY`, `GROQ_MODEL` | O | console.groq.com (falls back to rule-based) |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_ID`, `POLAR_SERVER` | O | Polar; webhook `https://<api>/api/payments/webhook` |
| `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `REFRESH_ABSOLUTE_DAYS`, `BCRYPT_ROUNDS`, `PRIVATE_FILE_URL_TTL_SECONDS` | O | defaults are fine |
| `EMAIL_VERIFICATION_REQUIRED`, `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFY_TTL_HOURS` | O | defaults are fine |
| `SMTP_*` | not needed | SMTP is blocked on Railway Hobby |

One-time seed variables (run once, then remove): `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_NAME`.

### `ml-service`
`INTERNAL_API_SECRET` (R), `FRONTEND_ORIGIN` (R), `ML_SERVICE_HOST=::` (R), `FLASK_DEBUG=false` (R). No Mongo, no Cloudinary.

### `visual-ml`
`INTERNAL_API_SECRET` (R), `FRONTEND_ORIGIN` (R), `MONGODB_URI` (R, same as api), `VISUAL_ML_HOST=::` (R), `FLASK_DEBUG=false` (R),
`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (R), `GROQ_API_KEY` (O),
`TRYON_PROVIDER` + `KLING_API_KEY` or `KLING_ACCESS_KEY`+`KLING_SECRET_KEY`, or `FAL_KEY` (O, needed for real try-on images).

### Vercel
`VITE_API_URL` = `https://<api>.up.railway.app` (R), `VITE_ML_URL` = the visual-ml public domain (R). Build-time: redeploy after changing.
Vercel project settings: Framework Vite, build `npm run build`, output `dist`, Node 20.x. `vercel.json` provides the SPA rewrite.

### MongoDB service
None to add; the template provides its own credentials. Confirm variable names in its Variables tab.

## 7. FRONTEND_ORIGIN before Vercel exists

The server refuses to start without a valid origin (scheme + host only).
1. Set the **expected** Vercel URL (e.g. `https://shaadi-sahulat.vercel.app`) on api, ml-service and visual-ml as a placeholder.
2. Deploy Railway services; copy the api and visual-ml public domains.
3. Create the Vercel project with `VITE_API_URL` / `VITE_ML_URL`; deploy.
4. Read the real production URL (Vercel -> Project -> Domains).
5. If it differs, set it on all three Railway services and redeploy them.
Only one origin is allowed. Vercel preview URLs and later custom domains are blocked by CORS until you change this value.

## 8. MongoDB and backups

- `MONGODB_URI` must end `/shaadi-sahulat?authSource=admin` (Python hardcodes that database; Node uses the name in the URI).
- A single node is fine: the code uses no transactions or change streams.
- Hobby volumes default to 5 GB. Railway volume backups are Pro-only, so use `scripts/backup/BACKUP_RESTORE.md` (weekly, and before every migration/deploy).

## 9. Final local testing (before any deployment)

```
npm ci
node --test tests/auth/*.test.js          # expect 256+ pass (includes 11 Resend tests)
npm run test:frontend                      # expect 61 pass
```
Resend, real delivery proof (uses your real key; put values in your local `.env`, never in git):
```
# .env (local only)
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_...
RESEND_FROM=ShaadiSahulat <no-reply@mail.yourdomain.com>
node scripts/send-test-email.js yourname@gmail.com
```
Expected: `Transport : Resend configured (delivery NOT yet verified)` then `RESULT : SUCCESS — Resend accepted the message`.
**Then open the inbox (and Spam).** Success on the command line only means Resend accepted it.
Full flow with local MongoDB: `npm run dev:backend`, `npm run dev:frontend`, register a buyer and a seller (OTP email arrives, code works,
account created), log in, run "forgot password" (reset email arrives, link works). Check `Logs` show `[mail] sent … via Resend (id …)` and no codes or links.
Optional Docker builds: `docker build -t ss-ml ml-service`, `docker build -t ss-visual visual-ml-service`.
Windows backup tooling: run one backup and one scratch restore per `scripts/backup/BACKUP_RESTORE.md`.

## 10. Estimated monthly hosting cost (estimates, nothing measured)

| Item | Estimate |
|---|---|
| Railway Hobby plan | $5/month minimum, which counts toward usage |
| `api` (about 0.3 GB, 0.05 vCPU) | about $4 |
| `ml-service` (about 0.2 GB, 0.02 vCPU) | about $2.5 |
| `visual-ml` (about 1.8 GB, 0.1 vCPU) | about $20 |
| MongoDB (about 0.4 GB, about 1 GB data) | about $5 |
| Egress (a few GB) | under $1 |
| **Railway total** | **about $30/month (plausible range $20–45)**; billed on actual use, minimum $5 |
| Resend | $0 on the free plan (100/day, 3,000/month); $20/month Pro only if you exceed it |
| Domain for Resend | about $10–15/year if you do not already own one (estimate) |
| Cloudinary, Groq, Vercel | free tiers assumed; check your own usage |

Railway rates used: RAM $10/GB-month, CPU $20/vCPU-month, egress $0.05/GB, volume $0.15/GB-month. Replace these with measured values from the
Railway dashboard after a few days.

## 11. Known limitations

- Tone-voice (Kokoro TTS) is disabled; review voice features stay off until hosted separately.
- There is no dedicated defect-detection model in the code (only keyword sentiment and dispute logic).
- Real try-on images need a paid provider key. First `visual-ml` start downloads ImageNet weights (no fine-tuned `.pth` is committed).
- Cloudinary must be configured or uploads silently go to disk that is lost on redeploy.
- Only one `FRONTEND_ORIGIN` is supported.
- `visual-ml` has a public domain, but only `/images/*` and `/health` work without the shared secret.

## 12. Production test checklist

1. `GET https://<api>/api/health` is ok; api logs show `MongoDB connected`; visual-ml `/health` responds on its public domain.
2. Buyer registration: OTP **email arrives from your domain**, code verifies, login works, refresh keeps the session.
3. Password reset email arrives and the link works.
4. Seller registration and login; product upload with images (URLs are Cloudinary).
5. Admin login (seeded) and dashboard. Bank officer login and application review.
6. Recommendations (api -> visual-ml), price/budget estimation (api -> ml-service), try-on (needs provider key).
7. BNPL end to end, Socket.IO notifications (no CORS/401 errors in the browser console), dispute chat.
8. Polar sandbox payment and webhook (if enabled).
9. Redeploy `api` and confirm uploaded images and documents still load.
10. Run a backup and confirm it verifies.
