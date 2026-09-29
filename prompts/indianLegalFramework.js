/**
 * Indian legal grounding layer.
 *
 * WHY THIS EXISTS
 * A practising advocate uploaded a Karnataka civil suit and got constitutional
 * analysis back. The cause was not missing knowledge — the model knows Indian
 * civil law perfectly well — it was that every prompt in this system pushed it
 * towards Article 32/226 proportionality reasoning, and the forum classifier
 * had no way to say "trial court", "civil suit" or "Karnataka".
 *
 * So this file is a ROUTER, not an encyclopedia. It tells the model which body
 * of law actually governs the matter in front of it, and — just as important —
 * which bodies of law to keep out. Trying to embed "every Indian law" in a
 * prompt would be neither possible nor useful; naming the right statute and
 * excluding the wrong doctrine is what fixes the accuracy problem.
 *
 * ONE FACTUAL POINT THAT SHAPES THE DESIGN
 * India has a single Constitution. Indian states do NOT have their own
 * constitutions (Jammu & Kashmir's separate constitution ceased to operate in
 * 2019). What states DO have is their own legislation under List II/III, their
 * own amendments to central codes such as the CPC, their own court-fee and
 * stamp Acts, and their own High Court rules. That is what "state law" means
 * here, and it is what actually decides a Karnataka suit.
 */

const COURT_HIERARCHY = `INDIAN COURT HIERARCHY — place the matter correctly before reasoning about it:
- Supreme Court of India — appeals by SLP (Art. 136), civil/criminal appeals, writs under Art. 32, advisory jurisdiction.
- High Courts — writs (Art. 226/227), first and second appeals, revisions, and ordinary original civil jurisdiction in the chartered High Courts (Bombay, Calcutta, Madras, Delhi, Himachal Pradesh).
- District judiciary — District Judge / Additional District Judge, Civil Judge (Senior Division), Civil Judge (Junior Division) / Munsiff on the civil side; Sessions Judge, Additional Sessions Judge, Chief Judicial / Judicial Magistrate and Metropolitan Magistrate on the criminal side.
- Specialised fora — NCLT/NCLAT, NGT, CAT, DRT/DRAT, Consumer Commissions (District/State/National), Family Courts, Labour Courts and Industrial Tribunals, Rent Controllers, Revenue Courts, MACT.

The level decides the register, the procedure and the relief. A Civil Judge trying a suit for specific performance is not conducting constitutional review.`;

const SUBJECT_MATTER_MAP = `GOVERNING LAW BY SUBJECT MATTER — name the instrument that actually governs:

CIVIL PROCEDURE & LIMITATION
  Code of Civil Procedure 1908 (subject to STATE amendments), Limitation Act 1963,
  Court Fees Act 1870 or the State's own court-fees / suits-valuation Act,
  Commercial Courts Act 2015 for specified commercial disputes above the threshold.
  Pleadings: Order VI; parties: Order I; issues: Order XIV; evidence: Order XVIII;
  temporary injunctions: Order XXXIX rr. 1-2; res judicata: s. 11; execution: Order XXI.

CONTRACT & COMMERCIAL
  Indian Contract Act 1872, Specific Relief Act 1963 (substantially amended 2018 —
  specific performance is now the rule, not a discretionary exception, s. 10),
  Sale of Goods Act 1930, Indian Partnership Act 1932, Negotiable Instruments Act 1881
  (s. 138 dishonour), Arbitration and Conciliation Act 1996 (amended 2015, 2019, 2021).

PROPERTY & LAND
  Transfer of Property Act 1882, Registration Act 1908, Indian Stamp Act 1899 or the
  State Stamp Act, Specific Relief Act 1963, Indian Easements Act 1882, RERA 2016,
  the State land revenue code, the State rent/tenancy Act, Benami Act 1988.

CRIMINAL — NOTE THE 2023 RECODIFICATION
  Bharatiya Nyaya Sanhita 2023 replaced the Indian Penal Code 1860.
  Bharatiya Nagarik Suraksha Sanhita 2023 replaced the Code of Criminal Procedure 1973.
  Bharatiya Sakshya Adhiniyam 2023 replaced the Indian Evidence Act 1872.
  All three took effect on 1 July 2024. Offences committed BEFORE that date continue
  to be tried under the old codes, so identify the date of the offence before citing.
  Special Acts: NDPS 1985, POCSO 2012, PMLA 2002, UAPA 1967, Prevention of Corruption 1988,
  SC/ST (Prevention of Atrocities) Act 1989, Juvenile Justice Act 2015.

FAMILY & SUCCESSION
  Hindu Marriage Act 1955, Hindu Succession Act 1956 (as amended 2005),
  Hindu Adoptions and Maintenance Act 1956, Hindu Minority and Guardianship Act 1956,
  Indian Succession Act 1925, Special Marriage Act 1954, Muslim Personal Law (Shariat)
  Application Act 1937, Muslim Women (Protection of Rights on Marriage) Act 2019,
  Guardians and Wards Act 1890, Family Courts Act 1984, Protection of Women from
  Domestic Violence Act 2005, BNSS s. 144 maintenance (formerly CrPC s. 125).

COMPANY, INSOLVENCY & TAX
  Companies Act 2013, Insolvency and Bankruptcy Code 2016, SEBI Act 1992,
  Competition Act 2002, Income Tax Act 1961, CGST/SGST Acts 2017, Customs Act 1962.

LABOUR, CONSUMER, SERVICE
  The four Labour Codes (Wages 2019; Industrial Relations, Social Security and OSH 2020 —
  check commencement before relying on them, as the predecessor Acts such as the
  Industrial Disputes Act 1947 may still govern), Consumer Protection Act 2019,
  Administrative Tribunals Act 1985 and the service rules in play.

CONSTITUTIONAL — ENGAGE ONLY WHEN GENUINELY RAISED
  Constitution of India 1950. Arts. 12-35 (fundamental rights), 32/226 (writs),
  136 (SLP), 141 (binding precedent), 226/227 (High Court supervisory), Seventh Schedule
  (legislative competence), 246/254 (repugnancy).`;

const STATE_LAW_RULE = `STATE LAW — WHAT IT ACTUALLY MEANS IN INDIA:
India has ONE Constitution; states do not have their own constitutions. What varies by
state, and what you must apply when the state is identified, is:
- State AMENDMENTS to central codes, above all the CPC (several states have materially
  altered Orders and time limits).
- State legislation under List II/III — rent control, land revenue, tenancy, municipal,
  co-operative societies, excise, shops and establishments, education, stamp duty.
- The State's court-fees and suits-valuation Act, which decides valuation and jurisdiction.
- The relevant High Court's Rules and Practice Directions.
- Decisions of that State's High Court, which BIND all courts subordinate to it, and are
  merely persuasive elsewhere.

Example — Karnataka: Karnataka Civil Courts Act 1964; Karnataka Court Fees and Suits
Valuation Act 1958; Karnataka Rent Act 1999; Karnataka Land Revenue Act 1964; Karnataka
Stamp Act 1957; Karnataka Co-operative Societies Act 1959; Karnataka Apartment Ownership
Act 1972; BBMP Act 2020; and the CPC as amended in its application to Karnataka.
A suit filed at Bengaluru is governed by these alongside the central Acts, and by the
High Court of Karnataka's binding precedent.`;

const PRECEDENT_RULE = `PRECEDENT AND CITATION DISCIPLINE:
- Supreme Court decisions bind every court in India (Art. 141). A larger Bench prevails
  over a smaller one.
- A High Court binds the courts subordinate to it; other High Courts are persuasive only.
  For a Karnataka matter, Karnataka High Court authority outranks Madras or Delhi authority.
- Cite only authorities you are confident actually exist and actually say what you claim.
  If you are unsure of a citation, describe the PRINCIPLE and say the citation needs
  verification, rather than inventing a case name, year or reporter reference.
  A fabricated citation is far more damaging to an advocate than an acknowledged gap.
- Prefer the current statutory provision and note renumbering where it has occurred
  (for example CrPC s. 125 is now BNSS s. 144).`;

const EXCLUSION_RULE = `DO NOT IMPORT THE WRONG BODY OF LAW — this is the most common failure:
- In an ordinary civil suit (possession, title, partition, specific performance, injunction,
  recovery, eviction, damages), reason from the CPC and the governing substantive Act.
  Do NOT raise Article 14/19/21, proportionality, "reasonable restrictions", locus standi
  under Art. 32, or writ maintainability. Those doctrines are simply not in issue.
- In a criminal trial, reason from the BNS/BNSS/BSA (or IPC/CrPC/Evidence Act for pre-
  1 July 2024 offences) and the relevant special Act — not from constitutional review,
  unless the vires of a provision is genuinely challenged.
- In arbitration, reason from the Arbitration and Conciliation Act 1996, the arbitration
  agreement and institutional rules — the parties are Claimant and Respondent.
- Constitutional doctrine belongs in writ petitions, constitutional challenges and appeals
  that actually raise it. Nowhere else.
- Use the correct party labels: Plaintiff/Defendant in a suit; Petitioner/Respondent in a
  writ; Appellant/Respondent in an appeal; Complainant/Accused in a prosecution;
  Claimant/Respondent in arbitration.`;

/**
 * Builds the grounding block for a detected forum. Returns '' for non-Indian
 * matters so nothing Indian leaks into an English or arbitral case — the exact
 * bug the forum layer was built to prevent, in the opposite direction.
 */
function buildIndianLegalDirective(forumContext) {
  const fc = forumContext || {};
  const jurisdiction = String(fc.jurisdiction || '');
  if (!/india/i.test(jurisdiction)) return '';

  const level = String(fc.courtLevel || 'Unspecified');
  const proceeding = String(fc.proceedingType || 'Unspecified');
  const state = String(fc.state || 'Unspecified');
  const isConstitutional = fc.isConstitutionalMatter === true || level === 'writ';

  const specifics = [
    `- Court level: ${level}`,
    `- Proceeding: ${proceeding}`,
    state && state !== 'Unspecified' ? `- State: ${state} — apply its legislation, its CPC amendments, its court-fee Act and High Court of ${state} precedent.` : '- State: not identified — rely on central legislation and say so if state law would change the answer.',
    isConstitutional
      ? '- This IS a constitutional matter: constitutional doctrine is properly in issue.'
      : '- This is NOT a constitutional matter: do not introduce constitutional doctrine unless the document itself raises it.',
  ].join('\n');

  return `INDIAN LEGAL FRAMEWORK — BINDING FOR THIS MATTER

THIS MATTER:
${specifics}

${COURT_HIERARCHY}

${SUBJECT_MATTER_MAP}

${STATE_LAW_RULE}

${PRECEDENT_RULE}

${EXCLUSION_RULE}`;
}

module.exports = {
  buildIndianLegalDirective,
  COURT_HIERARCHY,
  SUBJECT_MATTER_MAP,
  STATE_LAW_RULE,
  PRECEDENT_RULE,
  EXCLUSION_RULE,
};
