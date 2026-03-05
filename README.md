# Morning Quest (Bus Countdown + Coins + Pet + Streak Shield)

A simple mobile-first web app to help a teen complete a morning routine before leaving for school.
- Countdown to **leave the house by 7:25am** (bus stop departure 7:35am is shown for context).
- School days are **Mon–Thu** (Fridays and weekends never break streaks).
- Coins + Pet + Streak + Shield.
- Rewards require **parent approval**.

## Tech
- React + Vite (static site)
- Supabase (Auth + Postgres)

---

## 1) Prereqs
- Node.js 18+ installed
- A Supabase account & project
- A free static hosting account (Netlify or Cloudflare Pages)

---

## 2) Supabase setup

### 2.1 Create a Supabase project
In your Supabase dashboard, create a new project.

### 2.2 Run the SQL schema
Open **SQL Editor** in Supabase and run:

- `supabase/schema.sql`
- `supabase/seed.sql` (optional starter data)

> IMPORTANT: After you create the 3 users in Supabase Auth, update `supabase/seed.sql` with their user IDs (UUIDs) before running it.

### 2.3 Create 3 accounts (Auth)
Create the accounts you want:
- son (role: `child`)
- parent1 (role: `parent`)
- parent2 (role: `parent`)

You can create them via **Authentication → Users → Add user** (email + password).

Then copy each user's UUID and use them in `seed.sql`.

### 2.4 Get your project keys
You will need:
- Project URL
- `anon` public API key

---

## 3) Run locally

### 3.1 Install
```bash
npm install
```

### 3.2 Configure environment variables
Create a file named `.env` in the project root:

```bash
VITE_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

### 3.3 Start dev server
```bash
npm run dev
```

Open the local URL shown in the terminal.

---

## 4) Deploy (choose one)

### Option A — Cloudflare Pages
Cloudflare Pages build settings for a Vite app are typically:
- **Build command:** `npm run build`
- **Build output directory:** `dist`

(See Cloudflare Pages Vite guide.) 

Steps:
1. Push this project to GitHub.
2. In Cloudflare dashboard: **Workers & Pages → Create application → Pages → Import Git repo**
3. Set build command and output directory as above.
4. Add environment variables in Pages settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Option B — Netlify
Netlify’s Vite guide supports deploying with Git or CLI.

Typical build settings:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

Steps (Git-based):
1. Push to GitHub.
2. In Netlify: **Add new site → Import from Git**
3. Configure build and publish settings.
4. Add environment variables in Site settings.

---

## 5) Customise

### Bus / leave-house time
Default:
- Leave-house deadline: **07:25**
- Bus departs: **07:35**
- Timezone: **Australia/Sydney**
- School days: Mon–Thu

Change these in the **Parent Dashboard → Settings**.

### Tasks
Edit tasks in the Parent Dashboard (title, coins, required, order).

### Rewards
Edit rewards in the Parent Dashboard. All redemptions require parent approval.

---

## Safety / reliability notes
This is designed for a single family and low contention (usually one phone).
It uses row-level security and role checks to prevent the child account from approving its own rewards.

---

## File map
- `supabase/schema.sql` — tables + RLS policies
- `supabase/seed.sql` — starter family/tasks/rewards (edit UUIDs)
- `src/` — app code


## Upgrades: Boss Battle + Pet Evolution + Treasure Chests
If you already ran the schema earlier, run this in Supabase SQL Editor:
- `supabase/migrations_001_gamification.sql`
