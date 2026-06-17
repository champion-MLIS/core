# Deploy checklist — MLIS dashboard + "text HOME"

*Follow this once. After this, the dashboard is live, the webhook is reachable
by Twilio, and the cron is running. The PCO write is still **off** until step 7
— the controlled smoke test.*

Time budget: about 60 minutes of clicking. Most of it is pasting values from
1Password into Vercel.

---

## 0. Before you start — gather these

Open a scratch doc and have these handy. You'll paste them into Vercel in
step 4.

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Already known: `https://ubyhnbfvjdcinyhoplsd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable / `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE` | Supabase → Project Settings → API Keys → service_role (**secret — keep safe**) |
| `ALLOWED_EMAIL_DOMAIN` | `championchurch.org` |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys (Champion workspace) |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info → SID |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info → Auth Token (**secret**) |
| `TWILIO_PHONE_NUMBER` | `+19282488200` |
| `RESEND_API_KEY` | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | the verified Resend sender, e.g. `hello@championchurch.org` |
| `RESEND_REPLY_TO` | where guest replies should land (Becky's inbox) |
| `PCO_APP_ID` | api.planningcenteronline.com → Personal Access Tokens |
| `PCO_SECRET` | same place (**secret**) |
| `CHAMPION_NEXT_STEPS_URL` | set in step 6 |
| `CRON_SECRET` | generate now: `openssl rand -hex 32` — paste the output |
| `BROADCAST_PCO_WRITE_ENABLED` | `false` (we flip this in step 7) |

---

## 1. Push the repo to GitHub

```bash
cd /Users/stephenbloomfield/Projects/mlis
git push
```

If this is the first push: confirm the remote is the Champion repo (`github.com/champion-MLIS/core`) and you're pushing the `main` branch.

---

## 2. Create the Vercel project

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** the `champion-MLIS/core` repo.
3. On the "Configure Project" screen:
   - **Root Directory** → click "Edit" → set to `apps/dashboard`.
   - **Framework Preset** → Next.js (auto-detected).
   - **Build Command** → leave default.
   - **Output Directory** → leave default.
4. **Do NOT click Deploy yet.** Click the **Environment Variables** dropdown first.

---

## 3. Paste the environment variables

For each variable from step 0:
- Name: paste exactly (case matters).
- Value: paste the value.
- Environments: leave all three checked (Production, Preview, Development).

Quick sanity check before you deploy: make sure `BROADCAST_PCO_WRITE_ENABLED` is set to **`false`**. This keeps the PCO-write switch off for the first smoke test.

---

## 4. Deploy

Click **Deploy**. Wait ~2 minutes. Vercel gives you a URL like
`champion-mlis.vercel.app`. **Copy it** — you need it in the next step.

If the deploy fails, the most common cause is a missing env var. The error log will name it.

---

## 5. Point Twilio at the webhook

1. Twilio Console → Phone Numbers → Manage → Active numbers → (928) 248-8200.
2. Scroll to **Messaging** → "A MESSAGE COMES IN".
3. Set webhook to: `https://<your-vercel-url>/api/sms/inbound`
4. Method: **HTTP POST**.
5. Save.

---

## 6. Point the auto-reply link at the live `/next` page

The "Welcome home" SMS ends with "three things to do today: [link]." Set that link:

1. Vercel → your project → Settings → Environment Variables.
2. Edit `CHAMPION_NEXT_STEPS_URL` → `https://<your-vercel-url>/next`
3. Redeploy (Deployments tab → latest → ⋯ → **Redeploy**).

Open `https://<your-vercel-url>/next` in your browser — confirm the page looks right. *Edit the copy in `apps/dashboard/app/next/page.tsx` anytime.*

---

## 7. Smoke test — PCO write still OFF

From **your own phone**:

1. Text `HOME` to (928) 248-8200.
2. Within ~5 seconds you should receive your approved welcome message ending with the link to `/next`. **Open the link** — confirm the page loads.
3. Open `https://<your-vercel-url>/responses`. You should see your phone number in the callback queue, status "needs callback," 24-hour countdown ticking.
4. Wait up to 5 minutes (cron interval). Refresh `/responses`. The row should now show `auto-reply sent`. The `meta` won't show `processed_at` yet — that's correct, PCO write is off.
5. Mark it "No action" to clear it.

If all of this works, the front half is live and safe. Move to step 8.

---

## 8. Flip the PCO write switch ON

1. Vercel → Settings → Environment Variables → `BROADCAST_PCO_WRITE_ENABLED` → set to `true`.
2. Redeploy.
3. From your phone again: text `HOME`.
4. Wait ≤ 5 minutes.
5. **Open Planning Center.** Search for your phone number. You should find a person named "Friend" with your phone attached, an inbound note logged, and a 21-day journey just started (7 touches scheduled, Touch 1 skipped).
6. **Delete that test PCO record** so it doesn't pollute real reporting later.
7. Mark the response in `/responses` as "No action" to clear it.

**Now MLIS is fully live.** The keyword campaign is technically functional. But — read step 9 before announcing it.

---

## 9. Register the keyword campaign (required before announcing from the stage)

Carriers (AT&T, Verizon, T-Mobile) silently filter unregistered keyword traffic. "Text HOME to a number on a screen" is exactly the pattern they scrutinize. Until you complete this, your replies risk getting dropped.

1. Twilio Console → Messaging → Regulatory Compliance → **A2P 10DLC**.
2. Register the church brand (EIN, address, contact — Twilio walks you through it).
3. Register a campaign with use case **"Mixed"** or **"Higher Education / Religion"** (Twilio's options shift; pick the closest).
4. In the campaign sample messages, paste your actual welcome copy verbatim, including the opt-out language.
5. Submit. Approval typically takes **2–5 business days**.

Only after the campaign is **approved** is it safe to announce "text HOME" from the stage.

---

## 10. Becky + LaCinda first sign-in (anytime before launch)

Each of them goes to `https://<your-vercel-url>/login`, enters their `@championchurch.org` email, clicks the magic link in their inbox. After this, the system can route touches to them by name (instead of by generic role). Then Becky populates the volunteer pool from the dashboard.

---

## Day-to-day, after this

- **Becky** lives in the dashboard. New "text HOME" responses appear on `/responses` with a 24-hour clock and a Claim button.
- The cron sweeps every 5 minutes — new PCO records and 21-day journeys appear automatically.
- Anything flagged **crisis** halts automation and shows in red — that person needs immediate human contact.
- You and Becky check `/` daily for overall metrics and overdue work.

If anything breaks, the most useful place to start debugging is **Vercel → Logs** on the dashboard project.
