# Competition sources

Where every date in the Moot Calendar came from, and when it was fetched.

The rule this file exists to serve: **a date is only recorded if it was read off
the organiser's own brochure, rules booklet, competition page or registration
form.** Lawctopus, LawBhoomi, Legal Bites, Latest Laws, SCC Online Blog, Bar &
Bench, LiveLaw and the rest are used to *discover* that a competition exists and
never to confirm a date. Where an aggregator and the organiser disagreed, the
organiser won and the disagreement is noted below.

Dates move. A memorial deadline slipping by a week is routine. Re-fetch the URLs
here rather than trusting the conclusions, and update `verified` when you do.

First populated 2026-10-09 by the moot-calendar agent. All ten entries below
carry `verified: 2026-10-09`.

---

## 34th Willem C. Vis International Commercial Arbitration Moot

`vis-moot-34` · international · Vienna

Official source: <https://www.vismoot.org/home/34th-vis-moot/> (fetched
2026-10-09) and the <https://www.vismoot.org/> home page (same date), which
carries "34TH VIS MOOT" and "19-25 MARCH 2027", confirming edition and year on
the page itself.

| Milestone | Date | Confirmed by |
|---|---|---|
| `prop` Problem distribution | 2026-10-02 | 34th-vis-moot page: "Friday, 2 October 2026" |
| `reg` Registration deadline | 2026-11-12 | 34th-vis-moot page: "Thursday, 12 November 2026" |
| `memo` Memorandum for Claimant | 2026-12-10 | 34th-vis-moot page: "Thursday, 10 December 2026" |
| `memo` Memorandum for Respondent | 2027-01-21 | 34th-vis-moot page: "Thursday, 21 January 2027" |
| `orals` Oral hearings | 2027-03-19 → 2027-03-25 | Home page: "19-25 MARCH 2027". Welcome ceremony 19 Mar, general rounds 20-23 Mar, elimination rounds 23-25 Mar, closing ceremony 25 Mar |

Not recorded: the registration fee payment date (11 December 2026) has no
matching milestone type. `host`, `mode`, `elig`, `team` and `fee` were left out —
the page does not state them and nothing was inferred.

---

## 24th Annual Willem C. Vis (East) International Commercial Arbitration Moot

`vis-east-24` · international · Hong Kong

Official source: the Vis East Moot Foundation's own key-dates PDF,
<https://cisgmoot.org/wp-content/uploads/2026/07/VEM24-Key-Dates-and-Times-as-of-27-July-2026.pdf>
(fetched 2026-10-09). The cover reads "TWENTY-FOURTH ANNUAL WILLEM C. VIS EAST
INTERNATIONAL COMMERCIAL ARBITRATION MOOT / 2026 - 2027 / HONG KONG / ORGANIZED
BY VIS EAST MOOT FOUNDATION LIMITED"; the body is headed "Updated as of 28 July
2026". Deadlines are 23:59 Hong Kong time unless the document says otherwise.

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Team registration opens | 2026-09-25 | "Team Registration Friday, 25 September 2026 at 12pm (HKT)" |
| `prop` Distribution of the problem | 2026-10-02 | "Friday, 2 October 2026 (CEST)" |
| `clar` Clarification requests due | 2026-11-07 **tentative** | See the typo note below |
| `reg` Close of team registration | 2026-11-12 | "Thursday, 12 November 2026" |
| `memo` Claimant's Memorandum | 2026-12-10 | "Thursday, 10 December 2026" |
| `memo` Respondent's Memorandum | 2027-01-21 | "Thursday, 21 January 2027" |
| `orals` Oral arguments | 2027-03-07 → 2027-03-14 | Cover: "ORAL ARGUMENTS 7 - 14 MARCH 2027". Opening ceremony Sun 7 Mar, general rounds 8-11 Mar, elimination rounds 12-13 Mar, final round 14 Mar |

**Typo in the official document.** The clarification-request line reads
"Saturday, 7 November **2025** at 6:59 a.m. (HKT)". 7 November 2025 was a
Friday; 7 November 2026 is a Saturday, so the weekday matches 2026 and the year
appears to be a slip. The milestone is recorded as 2026-11-07 with `tent: true`
rather than silently corrected. **Worth re-fetching the PDF** — the Foundation
may have reissued it.

---

## 31st Stetson International Environmental Moot Court Competition — Surana & Surana India Rounds

`stetson-iemcc-31-india` · international · RGNUL Punjab, Patiala

Two official sources, both fetched 2026-10-09:

- Surana & Surana's own India Rounds rules,
  <https://moot.in/moot1/case_documents/171/rules.pdf> — "OFFICIAL RULES FOR THE
  SURANA & SURANA INDIA ROUNDS OF THE 31ST STETSON INTERNATIONAL ENVIRONMENTAL
  MOOT COURT COMPETITION – 2026-27", running footer "On Campus Rounds :
  December 03-05, 2026".
- Stetson University College of Law's own International Finals rules,
  <https://www.stetson.edu/law/international/iemcc/media/2027iemcc/2026-2027-stetson-iemcc-if-rules.pdf>
  — "Rules for the Thirty-First Annual Stetson International Environmental Moot
  Court Competition 2026–2027".
- Invitation (also moot.in): <https://moot.in/moot1/case_documents/171/invitation.pdf>

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Online registration opens | 2026-09-09 | India Rounds rules, Important Dates: "Start of Online Registration 09 September 2026" |
| `reg` Registration closes | 2026-11-15 | India Rounds rules: "Last date for Online Registration 15 November 2026"; fee also due 15 November 2026 |
| `memo` Memorial due to Stetson | 2026-11-16 | India Rounds rules: "16 November 2026, 5.00pm EST (equivalent to 17 November 2026, 3.30am IST)"; Stetson's own rules: "Memorial due (must be received by this date) ... November 16, 2026" |
| `memo` Memorial due to India Rounds | 2026-11-17 17:00 | India Rounds rules: "Submission of electronic copies of memorials to India Rounds : Rajiv Gandhi National University of Law, Punjab — 17 November 2026, 5.00 pm IST" |
| `orals` India Rounds | 2026-12-03 → 2026-12-05 | India Rounds rules: orientation 03 Dec, prelims/octas/quarters 04 Dec, semis and finals 05 Dec |
| `orals` International Finals | 2027-04-14 → 2027-04-17 | Stetson rules title page: "April 14–17, 2027", Gulfport, Florida; India Rounds rules agree: "Stetson International Finals (Florida USA) - Championship Rounds 14 - 17 April 2027" |

**The organiser's own two documents disagree on the India Rounds dates.** The
invitation PDF advertises "ON CAMPUS: DEC 04 – DEC 06, 2026". The rules PDF gives
03-05 December and says so explicitly against each line — "03 December 2026
(Modified from 04 December 2026)", and so on. The rules are the later document
and state the modification, so 03-05 December is recorded. If a team is
travelling, re-check this one.

Also confirmed from the India Rounds rules: fee Rs. 5,900 (Rs. 5,000 + Rs. 900 @
18% GST); "Each team can have two speakers and one researcher"; "The 2026-27
Stetson (India Rounds) will have teams from India & Nepal".

Stetson's own earlier dates (problem distributed 31 July 2026, clarifications
7 September 2026) are not recorded: they are past, and the India Rounds timeline
is the one an Indian team works to.

---

## Manfred Lachs Space Law Moot Court Competition 2027 — Asia-Pacific Regional Rounds

`lachs-asia-pacific-2027` · international · Singapore

Official source: the International Institute of Space Law's own page,
<https://iisl.space/asia-pacific-manfred-lachs-space-law-moot-court-competition>
(fetched 2026-10-09). The page names the 2027 edition and the host, Singapore
Management University Yong Pung How School of Law.

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Registration opens | 2026-09-01 | "1 September 2026 (SGT)" |
| `reg` Initial registration fee due | 2027-01-15 | "15 January 2027, 2359 (SGT)" |
| `memo` Memorial submission | 2027-02-25 | "25 February 2027, 2359 (SGT)" |
| `orals` Oral rounds | 2027-05-25 → 2027-05-29 | "25 to 29 May 2027", opening ceremony and first preliminary round 25 May, final 29 May |

**Disagreement resolved in the organiser's favour.** A search summary of
spacecourtfoundation.org gave the initial fee deadline as 31 December 2026 at
23:59 SGT. IISL's own page says 15 January 2027. IISL is recorded.

`reg` is the IISL page's "Initial Fee Deadline", labelled as such in the UI —
registration itself opens 1 September 2026 and is completed by paying that fee.
The post-memorial fee (1 May 2027, for teams that qualify for orals) has no
matching milestone type and is captured in `fee` instead. `mode` left out: the
page does not state it.

---

## The K.K. Luthra Memorial Moot Court, 2027

`kk-luthra-2027` · international · Campus Law Centre, University of Delhi

Official source: the competition's own site, kkluthramoot.org. Fetched
2026-10-09:

- Schedule of Events 2027:
  <https://kkluthramoot.org/wp-content/uploads/2020/12/Schedule-of-Events-2027-1.pdf>
- Rules of the Competition 2027:
  <https://kkluthramoot.org/wp-content/uploads/2020/12/Rules-of-the-Competition-2027.pdf>
- Moot Proposition 2027:
  <https://kkluthramoot.org/wp-content/uploads/2020/12/Moot-Problem-2027.pdf>

All three are headed "THE K.K. LUTHRA MEMORIAL MOOT COURT, 2027", so the edition
is confirmed on the documents themselves. The kkluthramoot.org **home page was
still serving 2022 content** when fetched — the 2027 documents are reachable
only by their direct URLs. Do not read the landing page and conclude the 2027
edition has not been announced.

| Milestone | Date | Confirmed by |
|---|---|---|
| `prop` Release of moot problem | 2026-07-15 | Schedule of Events 2027, item 1 |
| `reg` Last date for registration | 2026-11-16 **tentative** | Schedule item 2 |
| `clar` Last date for clarifications | 2026-12-01 **tentative** | Schedule item 3 |
| `memo` Memorial soft copy (PDF) | 2026-12-10 **tentative** | Schedule item 4 |
| `orals` Oral rounds | 2027-02-12 → 2027-02-14 **tentative** | Rules: "will be held from the 12th to the 14th"; schedule items 6-15. Prelims and quarters at Campus Law Centre, semis and finals at the India Habitat Centre, New Delhi |

**Why everything ahead is tentative.** The Schedule of Events carries, directly
under its own title, "[The dates and timings are subject to change]". That is the
organiser calling its own schedule provisional, so every milestone still in the
future is marked `tent: true`. `prop` is left settled because 15 July 2026 has
already happened and cannot move.

Two versions of the schedule are live at adjacent URLs and they differ on the
problem-release date only: `Schedule-of-Events-2027.pdf` says 30.06.2026,
`Schedule-of-Events-2027-1.pdf` says 15.07.2026. The `-1` file is the later
upload, so 15 July 2026 is recorded. Everything from registration onward is
identical in both.

Also confirmed from the Rules 2027: "There is no Registration Fee for registering
or participating in the competition"; "Members of the team must be valid
UNDERGRADUATE students"; "Each team shall consist of two speakers and one
researcher. The team may consist of only two [speakers]"; "The language of the
Court shall be English".

`cat: 'international'` because the Rules admit international undergraduate
students alongside Indian 3-year and 5-year programmes, not only Indian teams.

`subject: 'Criminal law'` is taken from the 2027 Moot Proposition itself, which
turns on a criminal prosecution (and the press-freedom and data-privacy questions
around it) in the fictional Republic of Solenia. The Rules do not state a subject
area; it was **not** filled in from the competition's reputation.

Declaration of memorial results (11 January 2027) has no matching milestone type
and is not recorded.

---

## 9th Surana & Surana and School of Law, Raffles University Labour Law Moot Court Competition, 2026-27

`surana-raffles-labour-9` · national · online

Official source: Surana & Surana's own rules PDF,
<https://moot.in/moot1/case_documents/170/rules.pdf> (fetched 2026-10-09),
headed "9th Surana & Surana and School of Law, Raffles University, Labour Law
Moot Court Competition / 2026 - 2027 / Virtual: 13 - 15 November, 2026". Listed as
open on <https://moot.in/> the same day.

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Online registration opens | 2026-09-01 | Important Dates: "Start of Online Registration Sep 1, 2026" |
| `clar` Clarifications sought by | 2026-10-15 | "Last date for seeking Clarification to the case Oct 15, 2026"; body: "before 15 October, 2026" |
| `reg` Registration closes | 2026-10-22 | "Last date for Online Registration Oct 22, 2026"; fee also due Oct 22 |
| `memo` Memorials (both sides) | 2026-10-30 17:00 | "Last Date for Submission of Memorials (both Appellant and Respondent) Soft Copy ... Oct 30, 2026"; body: "on or before 30 October, 2026 latest by 5:00 PM" |
| `orals` Oral rounds | 2026-11-13 → 2026-11-15 | Inaugural, orientation and draw of lots 13 Nov; prelims, octas and quarters 14 Nov; semis, final and valedictory 15 Nov |

Also confirmed from the rules: fee Rs. 2,000; "open for bonafide students
pursuing 5 Years and 3 Years Law programs in India"; "There shall be 2 speakers
and 1 researcher designated for each team"; held virtually.

Release of clarifications (16 October 2026) has no matching milestone type.

---

## 15th Padma Vibhushan N.A. Palkhivala Memorial National Moot Court Competition, 2026

`napmcc-15` · national · online

Official source: the organisers' own brochure,
<https://itatonline.org/digest/wp-content/uploads/2026/08/15TH-NAPMCC-BROCHURE.pdf>
(fetched 2026-10-09). The cover reads "VIRTUAL • 2026 / MAHARASHTRA NATIONAL LAW
UNIVERSITY MUMBAI / ALL INDIA FEDERATION OF TAX PRACTITIONERS (WEST ZONE) /
INCOME TAX APPELLATE TRIBUNAL BAR ASSOCIATION, MUMBAI / FIFTEENTH EDITION", so
edition, year and organisers are all confirmed on the document.

**Note on where this brochure is hosted.** It is served from itatonline.org, the
tax-law digest associated with the ITAT Bar Association, Mumbai — a co-organiser —
rather than from mnlumumbai.edu.in. MNLU Mumbai's own Palkhivala page,
<https://mnlumumbai.edu.in/nap.php>, was still showing the 2021 edition when
fetched on 2026-10-09. The document itself is the organisers' brochure, which is
why it was treated as confirmation; the hosting is recorded here so the next
person can judge for themselves.

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Registration opens | 2026-08-08 | Cover: "REGISTRATIONS OPEN 8 AUGUST 2026"; timeline: "Registration opens 8 August, 2026" |
| `prop` Release of moot proposition | 2026-08-08 | Timeline: "Release of moot proposition 8 August, 2026" |
| `clar` Deadline for clarification | 2026-08-26 | Timeline: "Deadline for clarification 26 August, 2026" |
| `reg` Deadline for registration | 2026-09-16 | Cover: "DEADLINE FOR REGISTRATION 16 SEPTEMBER 2026" |
| `memo` Submission of memorials | 2026-10-01 | Timeline: "Deadline for submission of memorials 1 October, 2026" |
| `orals` Oral rounds | 2026-10-23 → 2026-10-31 | Timeline: inauguration and researcher's test 23 Oct; preliminary rounds 24 and 25 Oct; quarter finals 30 Oct; semi finals 31 Oct; finals and valedictory 31 Oct. Cover: "PRELIMINARY ROUNDS 24 & 25 OCTOBER 2026 / ADVANCED ROUNDS 30 & 31 OCTOBER 2026" |

Fee confirmed: "The registration fee for participation in the Oral Rounds of the
Competition is ₹3,540 (inclusive of GST) per team."

`elig` and `team` were left out. Aggregators state "2 to 3 members"; the brochure
does not, so nothing was recorded. The brochure's timeline is laid out as a
two-column table and extracted with each date ahead of its label — if you
re-check it, read the pairings carefully.

Release of clarifications (6 September 2026) has no matching milestone type.

---

## 25th Henry Dunant Memorial Moot Court Competition — India National Rounds

`henry-dunant-25-india` · national · ISIL, New Delhi

Official source: ICRC New Delhi — a co-organiser — on its own domain:
<https://blogs.icrc.org/new-delhi/2026/07/23/opening-of-registrations-for-the-25th-henry-dunant-memorial-moot-court-competition-india-national-rounds-silver-jubilee/>
(fetched 2026-10-09). The post names the 25th edition and the Silver Jubilee year.

| Milestone | Date | Confirmed by |
|---|---|---|
| `clar` Clarifications deadline | 2026-08-17 | ICRC post |
| `reg` Registration deadline | 2026-08-17 | ICRC post: "17th August 2026" |
| `memo` Written memorial submission | 2026-09-24 | ICRC post: "24th September 2026" |
| `orals` Oral rounds | 2026-11-20 → 2026-11-22 | ICRC post: "20th November to 22nd November, 2026" at ISIL |

Registration and the memorial deadline are both **already past** as at
2026-10-09; the entry is in the calendar for the oral rounds and for next
season's shape. Qualification notification (21 October 2026) has no matching
milestone type.

`fee` and `team` left out: the ICRC post does not state them. An aggregator
(case2grow) describes it as having no registration fee — not recorded. The
competition rules are published by the Indian Society of International Law at
isil-aca.org; the 2026 rules PDF was located but not fetched, so if you re-check
this entry start there.

---

## IX Surana & Surana and UPES School of Law Insolvency Law Moot Court Competition, 2026

`surana-upes-insolvency-9` · national · UPES Kandoli Campus, Dehradun

Official source: the organisers' brochure and rules on Surana & Surana's own
site, <https://moot.in/moot1/case_documents/169/rules.pdf> and
<https://moot.in/moot1/case_documents/169/invitation.pdf> (both fetched
2026-10-09). Headed "IX SURANA & SURANA AND UPES SCHOOL OF LAW, INSOLVENCY LAW
MOOT COURT COMPETITION, 2026", "Competition at a glance: Ninth (IX) · Offline ·
30th October – 1st November, 2026 · Kandoli Campus, UPES, Dehradun".

| Milestone | Date | Confirmed by |
|---|---|---|
| `open` Registration commences | 2026-08-13 | "Provisional Registration commences from 13th August, 2026"; "Final Registration for teams commences from 13th August, 2026" |
| `prop` Release of moot proposition | 2026-08-13 | At a glance: "Release 13th August, 2026" |
| `reg` Final registration closes | 2026-09-22 | "The teams must register online by 22nd September, 2026" |
| `clar` Clarifications sought by | 2026-09-22 23:59 | "Teams may seek clarification latest by 22nd September, 2026 (11:59 PM IST)" |
| `memo` Memorial soft copy | 2026-10-05 23:59 | "before 5th October, 2026 (11:59 PM IST)"; late submissions penalised up to 6 October |
| `orals` Oral rounds | 2026-10-30 → 2026-11-01 | Prelims, octas, quarters and semis 31 Oct; final round 1 Nov; registration desk and memorial hard copies 30 Oct |

Fee confirmed: "A registration fee of Rs. 4,000/- ... shall be payable online by
each participating team", plus "Rs. 3,000/- per team, per day" for teams
qualifying for the offline rounds.

All deadlines are **past** as at 2026-10-09; the entry is in the calendar for the
oral rounds. Provisional registration closed 15 September 2026 and the
researcher's test is 12 October 2026 — neither has a matching milestone type.
`elig` and `team` left out: not captured from the brochure.

---

## 3rd FinTech Moot Court Competition, 2026-27

`nlsiu-fintech-3` · national · hybrid

Official source: NLSIU's own call for applications,
<https://www.nls.ac.in/news-events/call-for-applications-3rd-fintech-moot-court-competition-2026-2027-by-nlsiu-and-shardul-amarchand-mangaldas/>
(fetched 2026-10-09), which names the third edition, the 2026-27 cycle and the
co-host, Shardul Amarchand Mangaldas & Co.

| Milestone | Date | Confirmed by |
|---|---|---|
| `prop` Moot proposition release | 2026-08-22 | NLSIU page |
| `reg` Final registration | 2026-08-24 | NLSIU page; provisional registration closed 18 August 2026 |
| `clar` Clarifications deadline | 2026-08-29 | NLSIU page; clarifications released 3 September 2026 |
| `memo` Memorial submission | 2026-09-25 | NLSIU page |
| `orals` Virtual qualifier rounds | 2026-10-24 → 2026-10-25 | NLSIU page |
| `orals` Advanced rounds | 2026-11-28 → 2026-11-29 | NLSIU page |

Fees confirmed: INR 2,500 registration, INR 7,500 participation for teams that
clear the qualifiers. Eligibility confirmed: 2nd year and above, 5-year
integrated and 3-year LLB.

`city` deliberately left out. The qualifiers are virtual and the advanced rounds
in person, but the page does not name the venue. NLSIU is in Bengaluru, which is
exactly the kind of "obvious" inference that does not belong in this field.

All deadlines are **past** as at 2026-10-09. A brochure and rulebook are linked
from the page via a Google Drive folder, which was not opened; start there on a
re-check.

---

# Found but NOT written

These are in the calendar's scope and were investigated, but nothing was written
for them. Each line says why.

## Could not reach the official source

**Philip C. Jessup International Law Moot Court Competition 2027** — the single
most important gap in this list. <https://www.ilsa.org/jessup/jessup-2027/> and
every other ilsa.org URL tried returned **HTTP 403** behind Cloudflare bot
protection: direct fetch, two different browser user-agents, the no-`www` host,
a guessed schedule PDF path, and a text-extraction proxy (which reported "This
page maybe requiring CAPTCHA"). This is an unreachable official source, not an
unannounced competition.

Search-engine summaries of that ILSA page give: rules released 31 July 2026
(anticipated), registration opens 3 August 2026, problem released 15 September
2026 (anticipated), basic materials 7 October 2026 (anticipated), clarification
requests due 17 October 2026, eligibility inquiries 6 November 2026,
clarifications released 17 November 2026 (anticipated), **registration, payment
and roster due 20 November 2026**, **memorials due 12 January 2027**, national
and friendly rounds January–March 2027, international rounds 28 March – 4 April
2027 in Toronto. India is on fee Schedule V at USD 270, and the India national
administrator for Jessup 2027 appears to be reachable at `mcsfd@jgu.edu.in`
(Jindal Global Law School, which hosted the 2026 India rounds).

**None of that is recorded**, because none of it was read on an ILSA page. Anyone
with browser access to ilsa.org can confirm it in a few minutes and it should go
in first. The India National Rounds dates were not announced anywhere official.

## Organiser has not announced the 2026-27 or 2027 edition

| Competition | Status on 2026-10-09 | Checked |
|---|---|---|
| Price Media Law Moot Court Competition 2026-27 | Bonavero Institute (Oxford) has published a **draft** calendar. Only the International Rounds are dated: **12-16 April 2027, in person in Oxford**. All seven regional rounds, **South Asia included**, are marked "TBC", there is no memorial deadline, and the page says "this timeline is subject to change" and "detailed timelines for Regional Rounds will be available in due course". Not written: an Indian team registers for the South Asia rounds, and a single Oxford date with no memorial deadline would give no prep plan and no way to enter. **Worth re-checking monthly** — this is the one most likely to become writable soon. | <https://www.law.ox.ac.uk/bonavero-institute-of-human-rights/competition-calendar-2026-2027> |
| FDI Moot | fdimoot.org's calendar covers the **2026** edition only (clarifications 1 June and 15 August 2026, Claimant memorial 10 September, Respondent memorial 17 September, globals 23-27 October 2026 in Shenzhen). Nothing announced for 2027. | <https://fdimoot.org/> and <https://fdimoot.org/calendar.php> |
| Frankfurt Investment Arbitration Moot | Site's most recent edition is the 18th (9-12 June 2026). The team registration link resolves to `/registration-closed/`; `/schedule/` is a 404. No 19th edition announced. | <https://www.investmentmoot.org/> |
| GNLU International Moot Court Competition (GIMC) | The GIMC home page was **still serving GIMC 2025** (16th edition, 24-28 September 2025) on 2026-10-09 — a live example of last year's page sitting at the current URL. Nothing confirmed for 2026-27. | <https://gnlu.ac.in/gimc/home> |
| D.M. Harish Memorial GLC International Moot | 27th edition (2026) is the latest traceable; no 28th / 2027 announcement found on any official channel. | Searched; no official 2027 page |
| NUJS–HSF Kramer National Corporate Law Moot | 18th edition was March 2026. No 19th / 2027 announcement. | nujs.edu; searched |
| NLIU National Corporate Law Moot | 12th edition was 30 January – 1 February 2026; the 13th was said to be announced "in late 2026". The NLIU Moot Court Association site (mca.nliu.ac.in) was returning a **WordPress error** on 2026-10-09. | <https://mca.nliu.ac.in/> |
| RGNUL National Moot Court Competition | RGNUL's moot page lists achievements only, most recently 2024-25. No 2026-27 edition announced. | <https://www.rgnul.ac.in/26/moot-court-competitions> |
| NALSAR Trilegal–CCI Antitrust Moot | 5th edition was 12-14 March 2026. No 6th / 2027 announcement. | Searched |
| ILS Law College — "Remembering Professor S.P. Sathe" National Moot | 20th edition was 22-24 January 2026. The Moot Court Society page describes the competition as annual but announces no 2027 edition. | <https://ilslaw.edu/ils-moot-court-society/> |
| ILNU Antitrust Moot | Nothing more recent than the XIV edition (2025) found. | Searched |
| NUALS | No moot announcement on the site. | <https://www.nuals.ac.in/> |
| INTA Asia-Pacific Moot Court Competition 2027 | INTA says registration materials and key dates are "expected to be available in Fall 2026". | <https://www.inta.org/about/awards-competitions/asia-pacific-moot-court-competition/> |

The pattern is worth stating plainly: as at 9 October 2026, the big Indian
law-school moots that run January to March 2027 had not yet published their
brochures. They typically announce in November and December. **This list needs a
re-check in late November 2026 and again in January 2027**, and most of the
names above should become writable then.

## Out of scope

| Competition | Why not written |
|---|---|
| 2nd International Moot Court Competition, 2027 — Presidency School of Law, Presidency University, Bengaluru, with the NHRC | Dates are on the organiser's own site and are genuinely actionable (proposition 15 December 2026, registration 15 February 2027, memorial 15 March 2027, orals 16-18 April 2027, fee ₹9,000 with accommodation / ₹4,500 without). Left out only because a 2nd edition is not one of the long-running named moots this list was asked to cover. Say the word and it goes in. Source: <https://presidencyuniversity.in/events/2nd-international-moot-court-competition> |
| 2nd India Juris – DNLU National Moot Court Competition 2026 | Aggregator-sourced only (Bar & Bench, Lexibal). Reported dates: registration 12 October 2026, memorial 30 October 2026, competition 20-22 November 2026. **Not confirmed on dnlu.ac.in and therefore not written.** |
| Various 1st/2nd-edition national moots on Lawctopus (MIT-ADT Pune, Central University of Haryana, Innovative Institute of Law Greater Noida, MAIMS Delhi, R.N. Mittal Memorial at Law Centre-I, S.K. Puri Memorial at Law Centre-II, Maharaja Surajmal) | Discovered on listing sites, not confirmed against organisers, and mostly not the long-running named competitions a general audience needs. |
| Intra-college moots | Out of scope by instruction. |

---

# Re-check checklist

1. **ilsa.org from a real browser** — write Jessup 2027. It is the biggest hole here.
2. **Price Media South Asia Rounds** — organiser says "in due course"; check monthly.
3. **Vis East clarification date** — re-fetch the key-dates PDF to see whether the
   "7 November 2025" year typo has been corrected, then drop `tent`.
4. **Stetson India Rounds orals** — the invitation and the rules disagree (Dec 4-6
   vs Dec 3-5). Confirm before anyone books travel.
5. **K.K. Luthra 2027** — the whole schedule is "subject to change"; re-fetch
   closer to the 10 December memorial deadline and drop `tent` if it firms up.
6. **Late November 2026 and January 2027** — sweep the Indian law-school sites in
   the "not announced" table above. Most of that season should be published by then.
7. **MNLU Mumbai** — watch for the Palkhivala brochure appearing on
   mnlumumbai.edu.in so this entry no longer depends on itatonline.org.
