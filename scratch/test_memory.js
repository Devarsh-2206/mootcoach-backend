const { createEmptyMemory, evaluateExchange } = require('../services/memoryEngine');

async function run() {
  let memory = createEmptyMemory();
  
  const transcript1 = `
Judge: Counsel, you rely on the right to privacy under Article 21, but isn't there a legitimate state interest here?
Advocate: I concede that there is a legitimate state interest in preventing crime, Your Ladyship, but the measure is disproportionate.
  `;
  
  console.log("Running Turn 1...");
  let res1 = await evaluateExchange(memory, transcript1);
  console.log(res1);
  
  const transcript2 = `
Judge: Given your previous concession, how do you justify the claim that the entire act is ultra vires?
Advocate: The act is completely unconstitutional.
  `;
  
  console.log("Running Turn 2...");
  let res2 = await evaluateExchange(res1.updatedMemory, transcript2);
  console.log(res2);
}

run().catch(console.error);
