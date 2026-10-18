/**
 * Golden cases for the eval suite.
 *
 * Every proposition here is fictional and written for the suite, so it can be
 * committed. Each case states what a competent analysis MUST contain (and
 * must not), checked as regular expressions so the suite needs no second
 * model to grade it. Keep expectations about substance a moot coach would
 * insist on, not about wording.
 *
 *   expect.isLegal        validation verdict
 *   expect.forum          regex the detected forum must match
 *   expect.courtLevel     allowed courtLevel values
 *   expect.jurisdiction   regex for the detected jurisdiction
 *   expect.issues         each entry is a regex; at least one framed issue
 *                         (legalIssues + additionalIssues) must match it
 *   expect.mustNotMention regex that must not appear anywhere in the analysis
 *                         (catches the wrong country's law leaking in)
 */
module.exports = [
  {
    id: 'in-sc-shutdown',
    title: 'Indian Supreme Court — internet suspension (Art. 19/21)',
    text: `IN THE SUPREME COURT OF INDIA — ORIGINAL WRIT JURISDICTION
Writ Petition (Civil) No. ___ of 2026 under Article 32 of the Constitution of India.
Eastvale Traders' Union v. Union of Indus and State of Northvale.

1. Indus is a union of states with a written Constitution identical in all material respects to the Constitution of India.
2. On 3 March 2026, after communal clashes in Ravipur district, the Home Department of Northvale issued an order under the Temporary Suspension of Telecom Services Rules suspending all mobile and fixed-line internet in the entire district "until further orders".
3. The order was not published. No review committee met within the period the Rules prescribe. The suspension lasted 74 days.
4. Ravipur's 4,000 small traders sell mainly through online marketplaces. The Union says their members lost an estimated 38 crore rupees in sales.
5. The State says the suspension was necessary to stop the spread of inflammatory videos and that targeted blocking was technically impossible. It produced no material showing that less restrictive measures were considered.
6. The Union has filed a writ petition under Article 32 alleging violation of Articles 19(1)(a), 19(1)(g) and 21, and seeks compensation.
The matter is listed for final hearing before a three-judge bench of the Supreme Court.`,
    expect: {
      isLegal: true,
      forum: /supreme court/i,
      courtLevel: ['apex', 'writ'],
      jurisdiction: /india|indus/i,
      issues: [/19\s*\(1\)\s*\(a\)|speech|expression/i, /19\s*\(1\)\s*\(g\)|trade|business|profession/i, /proportional|less restrictive|necess/i, /compensat|damages/i],
      mustNotMention: /first amendment|european convention|echr\b/i,
    },
  },
  {
    id: 'in-civil-tenancy',
    title: 'Indian civil trial — injunction barred by Land Reforms Act',
    text: `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, BELAGAVI, KARNATAKA
Original Suit No. 112 of 2025. Kashinath & Another (Plaintiffs) v. Mallappa & Others (Defendants).

1. The plaintiffs claim to be tenants of 6 acres of agricultural land in Belagavi taluk since 1979. The defendants are the registered owners.
2. In January 2025 the defendants tried to plough the land. The plaintiffs filed this suit for a permanent injunction restraining interference with their possession.
3. Section 133 of the Karnataka Land Reforms Act, 1961 bars civil courts from deciding whether a person is a tenant; that question is for the Land Tribunal. An application by the plaintiffs for occupancy rights is pending before the Land Tribunal.
4. The defendants have filed an application under Order VII Rule 11 of the Code of Civil Procedure, 1908 to reject the plaint as barred by law, and alternatively seek a stay under Section 10 CPC.
5. The trial court must decide (a) whether the suit is maintainable, (b) whether an injunction can issue to protect possession pending the Tribunal's decision, and (c) the effect of the pending tenancy claim.
You appear before the Principal Civil Judge at the hearing of the Order VII Rule 11 application.`,
    expect: {
      isLegal: true,
      forum: /civil|district|judge|trial/i,
      courtLevel: ['trial'],
      jurisdiction: /india/i,
      issues: [/maintainab|barred|order\s*vii|rule\s*11|reject/i, /section\s*133|land reforms|tribunal|jurisdiction/i, /injunction|possession/i],
      mustNotMention: /article\s*32\b|writ of mandamus|puttaswamy|maneka gandhi/i,
    },
  },
  {
    id: 'intl-hr-expression',
    title: 'International human-rights court — criminal libel of a journalist',
    text: `UNIVERSAL COURT OF HUMAN RIGHTS
Application No. 21/2026. Mira Solano v. The Republic of Cero.

1. Cero is a party to the International Covenant on Civil and Political Rights and to the Universal Convention on Human Rights, which establishes this Court. Article 9 of the Convention protects freedom of expression in terms identical to Article 19 ICCPR.
2. Ms Solano, an investigative journalist, published an article alleging that the Minister of Ports had accepted bribes. She relied on two anonymous sources and a leaked invoice.
3. The Minister brought a private prosecution under Section 211 of Cero's Penal Code, which makes "defamation of a public official" a crime punishable by up to three years' imprisonment. She was convicted, sentenced to one year, and banned from journalism for five years. The Cero Supreme Court dismissed her final appeal.
4. Ms Solano refused to name her sources. The trial court drew an adverse inference from that refusal.
5. She applies to this Court, alleging violations of Article 9 (expression) and Article 6 (fair trial) of the Convention. Cero says the conviction protected the Minister's reputation and was prescribed by law.
The case will be argued before the Grand Chamber of the Universal Court of Human Rights.`,
    expect: {
      isLegal: true,
      forum: /universal court|human rights/i,
      courtLevel: ['international'],
      jurisdiction: /international|treaty/i,
      issues: [/expression|article\s*9|article\s*19/i, /criminal|imprison|proportional|necessary/i, /source|journalis/i, /fair trial|article\s*6|adverse inference/i],
      mustNotMention: /article\s*21 of the constitution of india|puttaswamy|maneka gandhi/i,
    },
  },
  {
    id: 'arb-sg-supply',
    title: 'Commercial arbitration — supply contract, force majeure',
    text: `ARBITRATION UNDER THE SIAC RULES — SEAT: SINGAPORE
Helix Components Pte Ltd (Claimant) v. Orvane Motors S.A. (Respondent).

1. Under a Supply Agreement dated 2 June 2024 governed by English law, Helix agreed to supply 80,000 battery modules to Orvane over 18 months.
2. Clause 14 (Force Majeure) excuses delay caused by "events beyond the reasonable control of the affected party, including epidemic, war and governmental action", provided written notice is given within 7 days.
3. In February 2025 a port strike in Helix's supplier's country halted lithium shipments for 9 weeks. Helix notified Orvane on day 12.
4. Orvane terminated the Agreement for repudiatory breach, bought replacement modules at a 22% premium, and withheld USD 4.1 million of invoices due to Helix.
5. Helix claims the invoices. Orvane counterclaims USD 9.6 million in cover costs and lost profits. Clause 19 limits liability to "direct losses" and excludes "loss of profit".
The Tribunal will hear argument on liability and the counterclaim.`,
    expect: {
      isLegal: true,
      forum: /arbitra|tribunal|siac/i,
      courtLevel: ['arbitral'],
      jurisdiction: /singapore|english|england|international/i,
      issues: [/force majeure|clause\s*14/i, /notice|7 days|condition precedent/i, /terminat|repudiat/i, /loss of profit|limitation|clause\s*19|direct loss/i],
      mustNotMention: /constitution of india|article\s*21\b|article\s*32\b|puttaswamy|maneka gandhi/i,
    },
  },
  {
    id: 'uk-jr-deportation',
    title: 'England & Wales — judicial review of a deportation decision',
    text: `IN THE COURT OF APPEAL (CIVIL DIVISION), ENGLAND AND WALES
R (on the application of Daniel Okoro) v. Secretary of State for the Home Department.

1. Mr Okoro, a Nigerian national, has lived lawfully in the United Kingdom since the age of 6. He is now 27 and has a British partner and a 2-year-old British daughter.
2. In 2025 he was convicted of a non-violent fraud offence and sentenced to 14 months' imprisonment.
3. The Secretary of State made a deportation order under the UK Borders Act 2007 and certified his human-rights claim as clearly unfounded, so he could only appeal after removal.
4. The High Court refused permission to apply for judicial review. Mr Okoro appeals, arguing that certification was irrational, that removal before appeal breaches his Article 8 ECHR right to family life under the Human Rights Act 1998, and that the best interests of his daughter were not considered.
The appeal is listed before the Court of Appeal.`,
    expect: {
      isLegal: true,
      forum: /court of appeal/i,
      courtLevel: ['appellate'],
      jurisdiction: /united kingdom|england|uk/i,
      issues: [/article\s*8|family life/i, /certif|clearly unfounded|irration/i, /best interests|child|daughter/i],
      mustNotMention: /article\s*21 of the constitution|article\s*32\b|supreme court of india|puttaswamy|maneka gandhi/i,
    },
  },
  {
    id: 'not-legal-recipe',
    title: 'Not a proposition — a recipe (must be rejected)',
    text: `Grandma's Lemon Drizzle Cake
Ingredients: 225g unsalted butter, 225g caster sugar, 4 eggs, finely grated zest of 1 lemon, 225g self-raising flour.
For the drizzle: juice of 1½ lemons, 85g caster sugar.
Method: 1. Heat oven to 180C. 2. Beat butter and sugar until pale and creamy, then add eggs one at a time, slowly mixing through. 3. Sift in the flour, add the lemon zest and mix until well combined. 4. Line a loaf tin, spoon in the mixture and bake for 45-50 mins. 5. While the cake is cooling, mix lemon juice and sugar for the drizzle and pour it over.
Serves 10.`,
    expect: { isLegal: false },
  },
];
