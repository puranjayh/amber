# Amber
Amber helps doctors match patients with clinical trials and see what information is missing.
Eligibility checks use deterministic rules and citations; missing or stale facts stay UNKNOWN.
Built with Next.js and synthetic demo data. Run `npm install`, then `npm run dev`.

## Portals

| Portal | URL |
|---|---|
| Doctor | http://localhost:3000/doctor |
| Clinical site (coordinator worklist) | http://localhost:3000/ |
| Patient | http://localhost:3000/patient-portal?patient=PT-4422 |

The patient link opens Naomi Moreau's portal. Change `patient=` to see someone else.

Suggest-to-patient and follow-ups are stored in Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env.local` (see `.env.example`; schema in `app/_data/loop.sql`). Otherwise they stay in `.data/loop.json`.

## Deploying the doctor portal

Import the repo on Vercel (Next.js preset, no build overrides) and set these environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_DOCTOR_ONLY` | `1` |
| `SUPABASE_URL` | same as `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | same as `.env.local` |

With `NEXT_PUBLIC_DOCTOR_ONLY=1`, every other page redirects to `/doctor` and `/api/loop/reset` returns 404. Vercel's filesystem is read-only, so the Supabase variables are required.
