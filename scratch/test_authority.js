require('dotenv').config();
const { extractAuthorityIntelligence } = require('../services/authorityIntelligenceEngine');

async function test() {
  const dummyProp = { facts: "The government banned crypto." };
  const dummyHierarchy = { tree: [{ level: 1, category: "Merits" }] };
  const dummyForum = { forumClassification: { broadType: "Constitutional Court" } };
  const dummyIssue = {
    issues: [
      {
        hierarchyLevel: 1,
        petitionerFramework: {
          primaryArguments: [
            { argumentId: "Arg1", legalBasis: "Right to Trade", factualBasis: "Crypto ban destroys business" }
          ]
        }
      }
    ]
  };

  try {
    console.log("Testing authority intelligence extraction...");
    const result = await extractAuthorityIntelligence(
      JSON.stringify(dummyProp), 
      JSON.stringify(dummyHierarchy), 
      JSON.stringify(dummyForum),
      JSON.stringify(dummyIssue)
    );
    console.log("RESULT:");
    console.log(result);
  } catch (err) {
    console.error(err);
  }
}

test();
