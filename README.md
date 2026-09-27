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
