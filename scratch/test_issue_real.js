require('dotenv').config();
const { extractForumIntelligence } = require('../services/forumIntelligenceEngine');
const { extractIssueIntelligence } = require('../services/issueIntelligenceEngine');
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
    console.log("\\n--- Processing " + moot + " ---");
    try {
      const propFilePath = path.join(__dirname, `res_${moot}.json`);
      const hierFilePath = path.join(__dirname, `hier_${moot}.json`);
      
      if (!fs.existsSync(propFilePath) || !fs.existsSync(hierFilePath)) {
        console.log(`Missing files for ${moot}`);
        continue;
      }
      
      const propData = fs.readFileSync(propFilePath, 'utf8');
      const hierData = fs.readFileSync(hierFilePath, 'utf8');
      
      // Generate Forum Intelligence
      console.log(`[${moot}] Running Forum Intelligence...`);
      const forumData = await extractForumIntelligence(propData, hierData);
      fs.writeFileSync(path.join(__dirname, `forum_${moot}.json`), forumData);
      
      // Generate Issue Intelligence
      console.log(`[${moot}] Running Issue Intelligence...`);
      const issueData = await extractIssueIntelligence(propData, hierData, forumData);
      fs.writeFileSync(path.join(__dirname, `issue_${moot}.json`), issueData);
      
      console.log(`[${moot}] Success!`);
      
    } catch(e) {
      console.error(`[${moot}] Error:`, e);
    }
  }
  console.log("Done");
}

run();
