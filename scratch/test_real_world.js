const { extractPropositionIntelligence } = require('../services/propositionEngine');
const fs = require('fs');

const moots = [
  {
    name: 'Constitutional',
    text: `IN THE SUPREME COURT OF INDIA. Writ Petition (Civil) No. of 2026.
    Petitioner: Internet Freedom Foundation.
    Respondent: Union of India.
    FACTS: The Union passed the 'Digital Content Regulation Act, 2025' which requires all OTT platforms to provide end-to-end decryption keys to the government under Section 69A of the IT Act. Non-compliance results in immediate blocking of the platform. The Petitioner argues this violates the fundamental right to privacy under Article 21, the right to free speech under Article 19(1)(a), and is manifestly arbitrary under Article 14. The Union argues it is a reasonable restriction under Article 19(2) for national security. The matter is placed before a 5-judge Constitution Bench.`
  },
  {
    name: 'CommercialArb',
    text: `THIRTIETH ANNUAL WILLEM C. VIS INTERNATIONAL COMMERCIAL ARBITRATION MOOT.
    Claimant: Drone Delivery Inc (Equatoriana).
    Respondent: Advanced UAV Solutions (Mediterraneo).
    FACTS: Claimant purchased 500 UAVs from Respondent for delivering medical supplies. The contract is governed by the CISG and the arbitration is seated in Vindobona under PCA Rules. Upon delivery, the UAVs suffered battery failures in Equatoriana's tropical climate. Claimant alleges breach of Article 35 CISG. Respondent argues that Claimant did not provide notice of the non-conformity in a timely manner (Article 39 CISG) and that the batteries were not designed for extreme humidity, which was not made known to Respondent. Claimant seeks damages of $2M.`
  },
  {
    name: 'InvestmentArb',
    text: `FOREIGN DIRECT INVESTMENT INTERNATIONAL ARBITRATION MOOT 2022.
    Claimant: Goliath National Products (GNP) Ltd.
    Respondent: Republic of Mercuria.
    FACTS: GNP invested $50M in a cannabis plantation in Mercuria under the Mercuria-Basheera BIT. In 2024, a new Mercurian government criminalized all cannabis production citing public health concerns, effectively wiping out GNP's investment. The military occupied the plantation. GNP filed a claim at ICSID seeking $100M for unlawful expropriation and violation of the Fair and Equitable Treatment (FET) standard. Mercuria argues the tribunal lacks jurisdiction because the investment was illegal under its new domestic law, and claims the police power doctrine excuses compensation.`
  },
  {
    name: 'Jessup',
    text: `PHILIP C. JESSUP INTERNATIONAL LAW MOOT COURT COMPETITION 2023.
    Case Concerning The Clarento Peace Treaty.
    Applicant: State of Aglovale.
    Respondent: State of Ragnell.
    FACTS: Aglovale and Ragnell are neighboring states. After a brief war, they signed the Clarento Peace Treaty. Recently, Ragnell conducted a cyber-operation disabling Aglovale's critical water infrastructure, claiming it was a lawful countermeasure against Aglovale's sponsoring of militant groups in Ragnell's territory. Aglovale brings the matter to the International Court of Justice (ICJ), arguing the cyberattack violated the UN Charter Article 2(4) prohibition on the use of force. Ragnell argues cyber operations do not constitute 'force' and relies on the doctrine of necessity.`
  },
  {
    name: 'National',
    text: `10TH NATIONAL ANTITRUST MOOT COURT COMPETITION.
    Appellant: MegaRetailers Ltd.
    Respondent: Competition Commission of India (CCI).
    FACTS: MegaRetailers, a dominant e-commerce platform, introduced a 'SuperSeller' program where it gave preferential algorithmic rankings to sellers who exclusively used its warehousing services. The CCI found this to be an abuse of dominant position under Section 4 of the Competition Act, 2002, and imposed a penalty of INR 500 Crores. MegaRetailers appeals to the National Company Law Appellate Tribunal (NCLAT), arguing that the program is a legitimate pro-competitive efficiency justification and that the relevant market was defined too narrowly by the CCI.`
  }
];

async function run() {
  for (const moot of moots) {
    console.log("Running " + moot.name + "...");
    try {
      const res = await extractPropositionIntelligence(moot.text);
      fs.writeFileSync('scratch/res_' + moot.name + '.json', res);
    } catch(e) {
      console.error(e);
    }
  }
  console.log("Done");
}

run();
