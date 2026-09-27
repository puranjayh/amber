## Our Inspiration
Clinical trials can provide patients with access to valuable new treatment opportunities, yet many patients are unaware of the trials for which they may qualify. The problem, however, isn't always the lack of trials, but rather the disconnect between the pharmaceutical companies running them, the physicians caring for eligible patients, and the patients themselves.

We saw an opportunity to put **physicians** at the center of solving this problem. Doctors understand their patients and already have their trust, but they don't have the time to actively search through thousands of clinical trials. In fact, 84% of primary care physicians are not highly familiar with trials relevant to their patients.

That inspired **Amber**: a clinical-trial ecosystem designed to empower physicians to bridge the gap between patients and clinical research.

## What Amber Does
Amber helps physicians identify, recommend, and connect their patients with the right clinical trials.

### 1. Trial & Patient Matching
- Amber pulls real clinical trials and their eligibility criteria from ClinicalTrials.gov and compiles each protocol into structured, machine-checkable criteria, creating a centralized view of studies and potential participants.
- Amber analyzes healthcare information, sourced from insurance claims and EMR records, against trial eligibility criteria to identify patients who may qualify.
- Research teams can see where qualified candidates may exist.

### 2. Physician Dashboard
- Potential trial matches are shown directly to a patient's physician, allowing doctors to discover relevant opportunities for their patients without constantly searching through thousands of active clinical trials.
- Amber shows how many eligibility criteria each patient meets, allowing physicians to quickly see who is eligible now and who is only one step away.
- Physicians remain at the center of the process by reviewing potential matches and deciding which trial opportunities they would like to recommend to their patients.
- For every match, Amber explains why a patient may qualify based on factors such as diagnosis, age, treatment history, location, and other eligibility criteria. Each result cites the trial's own wording and, when the chart has it, the exact line from the patient's record.

### 3. Patient Experience
- When a physician recommends a trial, the patient receives it in a simple, understandable format that explains why they may qualify and where the study takes place.
- Amber transforms complicated clinical-trial information into something patients can understand without requiring them to interpret lengthy clinical protocols.
- Patients share what works for them (how far they can travel, how many extra visits they can manage, whether they're open to a placebo, and whether they have a ride), and Amber uses those answers to re-rank their options.

### 4. Closing the Loop
- Amber doesn't stop once a trial is recommended. It watches ClinicalTrials.gov for changes to recommended trials, such as recruitment status, sites, and dates.
- Updates go to the physician first. The physician can review each one before it reaches the patient, or choose to release updates automatically.
- Instead of clinical research existing in three disconnected worlds (pharma, physicians, and patients), Amber creates one continuous loop that keeps all three connected.

## How we built it
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS 4, with three connected portals: physician, coordinator, and patient.
- **AI criteria compiler:** xAI's **Grok 4** turns free-text protocols into nested AND/OR/NOT criteria trees. A second Grok pass translates each tree back into plain English so we can check it matches the original.
- **Eligibility engine:** pure TypeScript using three-valued logic (PASS / FAIL / UNKNOWN). No AI is involved in scoring; every decision is explicit code with exact date math.
- **Backend:** **Supabase** Postgres behind Next.js API routes, storing recommendations, follow-ups, patient preferences, and trial updates. Row-level security is on for every table, and only the server can access the database.
- **Data and APIs:** ClinicalTrials.gov API v2, the openFDA NDC Directory, CMS synthetic Medicare claims (DE-SynPUF), Synthea synthetic patient records with LOINC-coded labs, and open-access PubMed Central case reports.
- **Validation and testing:** Zod schemas shared across every part of the system, Vitest test suites, and Playwright screenshots. Built in Cursor.

## Challenges we Faced
- **Standardizing eligibility criteria:** ClinicalTrials.gov trial criteria came in inconsistent, largely unstructured formats. We had to use xAI's Grok 4 with schema-constrained JSON output, validated by Zod, plus a second Grok pass that translated each result back into English, to read and standardize requirements into fields our matching system could reliably compare against patient data. Of 300 lung-cancer protocols, 233 compiled; the other 67 were rejected rather than forced into a shape they didn't fit.
- **Filtering relevant trials:** With thousands of clinical trials available, we had to narrow the search space before performing detailed patient matching. This required combining the ClinicalTrials.gov API v2 (filtered to interventional lung-cancer trials that are active or recruiting) with a deterministic TypeScript engine that rules out a trial the moment one inclusion criterion fails or one exclusion criterion is met, to efficiently eliminate trials that failed key patient eligibility requirements.
- **Designing the ranking logic:** Building our ranking logic in TypeScript required determining how different eligibility criteria should be weighted to generate meaningful match scores. We rank patients by fewest unanswered criteria first, then by the chance the open questions resolve in their favor, then by travel time. Trials are weighted by how much it would cost the patient to qualify: the tests still needed (a blood draw costs far less than a biopsy), travel, visit load, and whether they have a ride.

## Accomplishments that we're proud of
- We turned 233 real lung cancer protocols from ClinicalTrials.gov into 5,105 criteria a computer can actually check.
- 208 patients against 134 trials works out to 27,872 pairs and 688,272 individual criterion checks, and you can click any of them to see the trial's wording next to the line in the patient's chart it was based on.
- Missing info never counts against a patient. If a lab is missing or too old, it shows up as unknown, something the doctor can go get.
- Grok reads the protocols, but plain code makes every eligibility call, so run it twice and you get the same answer.
- When the doctor hits Suggest, the trial shows up in the patient's portal, and it's all stored in Postgres on Supabase.

## What we learned
- Treating missing data as "no" quietly hides a lot of patients who might qualify.
- LLMs are great at turning messy protocol text into structure. We didn't want one deciding who qualifies, and keeping it out of scoring made testing a lot easier.
- Real records have huge gaps. Not one of our 200 Synthea patients had a creatinine clearance on file, and that shows up as a requirement in plenty of trials.
- Exclusion criteria are confusing to get right. A patient "passing" an exclusion means they're out, and we had to keep that straight through nested AND/OR logic.

## What's next for Amber
- A portal for pharmaceutical sponsors to upload their own trials and eligibility criteria.
- Patient responses to a recommendation (Interested, Not Interested, or Ask My Doctor), with more study details such as time commitment and compensation.
- A secure consent and enrollment pathway that keeps the physician connected as the patient moves into the trial.
- Approved, patient-specific updates flowing from research teams back to the patient's physician during the trial.
- Integration with real EHRs via FHIR, plus the HIPAA compliance work needed to handle real patient data.
- Expanding beyond lung cancer and adding human review for the 167 compiled trials our pipeline flagged for a second look.
