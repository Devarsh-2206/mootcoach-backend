require('dotenv').config();
const { extractProceduralHierarchy } = require('../services/proceduralHierarchyEngine');
const fs = require('fs');
const path = require('path');

const moots = [
  'Constitutional',
  'CommercialArb',
  'InvestmentArb',
  'Jessup',
  'National'
];

async function run() {
  for (const moot of moots) {
    console.log("Running Hierarchy Extraction for " + moot + "...");
    try {
      const propFilePath = path.join(__dirname, `res_${moot}.json`);
      if (fs.existsSync(propFilePath)) {
        const propData = fs.readFileSync(propFilePath, 'utf8');
        const res = await extractProceduralHierarchy(propData);
        fs.writeFileSync(path.join(__dirname, `hier_${moot}.json`), res);
        console.log(`Saved hier_${moot}.json`);
      } else {
        console.log(`File not found: ${propFilePath}`);
      }
    } catch(e) {
      console.error(e);
    }
  }
  console.log("Done");
}

run();
