require('dotenv').config();
const { extractForumIntelligence } = require('../services/forumIntelligenceEngine');

async function test() {
  const dummyProp = {
    jurisdictionSignals: ["ICSID", "Arbitration"],
    governingLaw: "BIT between Mercuria and Basheera",
    reliefSought: ["Compensation of $100M", "Declaration of unlawful expropriation"]
  };
  
  const dummyHierarchy = {
    hierarchyTree: [
      { level: 1, category: "Jurisdiction", isFatalToClaim: true }
    ]
  };

  try {
    console.log("Testing forum intelligence extraction...");
    const result = await extractForumIntelligence(JSON.stringify(dummyProp), JSON.stringify(dummyHierarchy));
    console.log("RESULT:");
    console.log(result);
  } catch (err) {
    console.error(err);
  }
}

test();
