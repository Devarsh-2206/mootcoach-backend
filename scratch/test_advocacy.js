require('dotenv').config();
const { extractAdvocacyIntelligence } = require('../services/advocacyIntelligenceEngine');

async function test() {
  const dummyProp = { facts: "The government banned crypto." };
  const dummyHierarchy = { tree: [{ level: 1, category: "Merits" }] };
  const dummyForum = { forumClassification: { broadType: "Constitutional Court" } };
  const dummyIssue = { issues: [{ hierarchyLevel: 1, petitionerFramework: { primaryArguments: [{ argumentId: "Arg1" }] } }] };
  const dummyAuthority = { authorityRoadmap: [{ targetIssueId: 1, targetArgumentId: "Arg1", ratioIntelligence: { requiredLegalRatio: "Ban must be proportionate" } }] };

  try {
    console.log("Testing advocacy intelligence extraction...");
    const result = await extractAdvocacyIntelligence(
      JSON.stringify(dummyProp), 
      JSON.stringify(dummyHierarchy), 
      JSON.stringify(dummyForum),
      JSON.stringify(dummyIssue),
      JSON.stringify(dummyAuthority)
    );
    console.log("RESULT:");
    console.log(result);
  } catch (err) {
    console.error(err);
  }
}

test();
