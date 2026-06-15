const { extractPropositionIntelligence } = require('../services/propositionEngine');
const fs = require('fs');

const caseA = `
IN THE SUPREME COURT OF INDUS
Writ Petition (Civil) No. ____ of 2026
Between:
Association for Digital Privacy (Petitioner)
And
Union of Indus (Respondent)

FACTS:
1. The Union of Indus passed the "National Identity Grid Act, 2025" mandating a DNA database for all citizens to access public services.
2. The Association for Digital Privacy filed a writ petition under Article 32, arguing this violates the fundamental right to privacy under Article 21.
3. The Union argues the database is necessary for national security and preventing welfare fraud.
4. The matter has been referred to a 5-judge Constitutional Bench for final hearing.
`;

const caseB = `
IN THE ARBITRATION TRIBUNAL SEATED IN LONDON
UNDER THE UNCITRAL ARBITRATION RULES
Between:
Nexus Corp Ltd. (Claimant)
And
Stark Industries Inc. (Respondent)

FACTS:
1. Nexus Corp entered into a Commercial Supply Agreement with Stark Industries on Jan 1, 2024, governed by English law.
2. The agreement included an arbitration clause (London seat, UNCITRAL Rules).
3. Stark Industries failed to deliver the vibranium cores by Dec 31, 2025, claiming force majeure due to a global shortage.
4. Nexus claims breach of contract and seeks $50M in damages. Stark claims the force majeure clause excuses performance.
`;

const caseC = `
INTERNATIONAL COURT OF JUSTICE (ICJ)
Case Concerning the Maritime Boundary and Resource Extraction
Between:
Republic of Tropico (Applicant)
And
Kingdom of Valoria (Respondent)

FACTS:
1. Tropico and Valoria are adjacent coastal states. Both are parties to UNCLOS.
2. Valoria unilaterally extended its Exclusive Economic Zone (EEZ) by 50 nautical miles and began deep-sea oil drilling in an area Tropico claims as its continental shelf.
3. Tropico argues this violates UNCLOS provisions on maritime delimitation.
4. Valoria argues the area is an historic bay and UNCLOS does not apply.
5. The ICJ has assumed jurisdiction. Tropico seeks an immediate cessation of drilling and reparations.
`;

async function run() {
  console.log("Running Case A...");
  try {
    const resA = await extractPropositionIntelligence(caseA);
    fs.writeFileSync('scratch/resA.json', resA);
  } catch(e) { console.error(e); }

  console.log("Running Case B...");
  try {
    const resB = await extractPropositionIntelligence(caseB);
    fs.writeFileSync('scratch/resB.json', resB);
  } catch(e) { console.error(e); }

  console.log("Running Case C...");
  try {
    const resC = await extractPropositionIntelligence(caseC);
    fs.writeFileSync('scratch/resC.json', resC);
  } catch(e) { console.error(e); }
  
  console.log("Done");
}

run();
