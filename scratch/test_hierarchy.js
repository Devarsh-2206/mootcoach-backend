require('dotenv').config();
const { extractProceduralHierarchy } = require('../services/proceduralHierarchyEngine');
const fs = require('fs');

async function test() {
  const dummyProp = {
    issues: {
      explicit: [
        "Whether the tribunal has jurisdiction under the BIT.",
        "Whether the expropriation was lawful.",
        "Whether compensation is owed."
      ]
    },
    proceduralContext: {
      currentStage: "Jurisdiction and Merits",
      proceduralPosture: "Arbitration"
    }
  };

  try {
    console.log("Testing procedural hierarchy extraction...");
    const result = await extractProceduralHierarchy(JSON.stringify(dummyProp));
    console.log("RESULT:");
    console.log(result);
  } catch (err) {
    console.error(err);
  }
}

test();
