require('dotenv').config();
const { extractAuthorityIntelligence } = require('../services/authorityIntelligenceEngine');
const { extractAdvocacyIntelligence } = require('../services/advocacyIntelligenceEngine');
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
  const metrics = {};

  for (const moot of moots) {
    console.log("\\n--- Processing " + moot + " ---");
    try {
      const propFilePath = path.join(__dirname, `res_${moot}.json`);
      const hierFilePath = path.join(__dirname, `hier_${moot}.json`);
      const forumFilePath = path.join(__dirname, `forum_${moot}.json`);
      const issueFilePath = path.join(__dirname, `issue_${moot}.json`);
      
      if (!fs.existsSync(propFilePath) || !fs.existsSync(issueFilePath)) {
        console.log(`Missing files for ${moot}`);
        continue;
      }
      
      const propData = fs.readFileSync(propFilePath, 'utf8');
      const hierData = fs.readFileSync(hierFilePath, 'utf8');
      const forumData = fs.readFileSync(forumFilePath, 'utf8');
      const issueData = fs.readFileSync(issueFilePath, 'utf8');
      
      metrics[moot] = {};

      // Generate Authority Intelligence
      console.log(`[${moot}] Running Authority Intelligence...`);
      const t1 = Date.now();
      const authData = await extractAuthorityIntelligence(propData, hierData, forumData, issueData);
      metrics[moot].authorityLatency = Date.now() - t1;
      fs.writeFileSync(path.join(__dirname, `auth_${moot}.json`), authData);
      
      // Generate Advocacy Intelligence
      console.log(`[${moot}] Running Advocacy Intelligence...`);
      const t2 = Date.now();
      const advData = await extractAdvocacyIntelligence(propData, hierData, forumData, issueData, authData);
      metrics[moot].advocacyLatency = Date.now() - t2;
      fs.writeFileSync(path.join(__dirname, `adv_${moot}.json`), advData);
      
      console.log(`[${moot}] Success!`);
      
    } catch(e) {
      console.error(`[${moot}] Error:`, e);
    }
  }
  
  console.log("\\n--- METRICS ---");
  console.log(JSON.stringify(metrics, null, 2));
}

run();
