const { extractPropositionIntelligence } = require('../services/propositionEngine');
const fs = require('fs');

async function run() {
  const mockText = `
  IN THE ARBITRAL TRIBUNAL OF THE INTERNATIONAL CHAMBER OF COMMERCE (ICC)
  CASE NO. 2026/XYZ
  
  BETWEEN:
  Global Tech Corp (Claimant)
  v.
  Republic of Atlantis (Respondent)
  
  FACTS:
  On 15 January 2024, Global Tech Corp signed a Bilateral Investment Treaty (BIT) with Atlantis to build a wind farm.
  On 10 March 2025, Atlantis unilaterally passed the "Green Energy Nationalization Act" which expropriated the wind farm without compensation.
  Global Tech claims this violates the fair and equitable treatment standard under international law.
  Atlantis claims the expropriation was a sovereign right to protect the environment.
  
  PROCEDURAL POSTURE:
  This is a final hearing on jurisdiction and merits before the arbitral tribunal.
  Claimant seeks $500 million in damages.
  `;

  console.log("Running extraction...");
  try {
    const rawJSON = await extractPropositionIntelligence(mockText);
    console.log("RAW RESPONSE:");
    console.log(rawJSON);
  } catch (err) {
    console.error(err);
  }
}

run();
