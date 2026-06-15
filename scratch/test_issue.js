require('dotenv').config();
const { extractIssueIntelligence } = require('../services/issueIntelligenceEngine');

async function test() {
  const dummyProp = {
    issues: {
      explicit: [
        "Whether the tribunal has jurisdiction under the BIT.",
        "Whether the expropriation was lawful."
      ]
    }
  };
  
  const dummyHierarchy = {
    hierarchyTree: [
      { level: 1, category: "Jurisdiction", mappedExplicitIssues: ["Whether the tribunal has jurisdiction under the BIT."] },
      { level: 2, category: "Merits", mappedExplicitIssues: ["Whether the expropriation was lawful."] }
    ]
  };

  const dummyForum = {
    forumClassification: { broadType: "Investment Arbitration", specificBody: "ICSID" },
    proceduralFramework: { applicableRules: ["ICSID Convention"] }
  };

  try {
    console.log("Testing issue intelligence extraction...");
    const result = await extractIssueIntelligence(
      JSON.stringify(dummyProp), 
      JSON.stringify(dummyHierarchy), 
      JSON.stringify(dummyForum)
    );
    console.log("RESULT:");
    console.log(result);
  } catch (err) {
    console.error(err);
  }
}

test();
