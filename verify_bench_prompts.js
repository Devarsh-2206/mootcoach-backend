const { buildLiveJudgePrompt } = require('./prompts/benchJudgePrompt.js');

console.log("================ EASY BENCH PROMPT ================");
console.log(buildLiveJudgePrompt('easy', 'Example case context.'));

console.log("\n================ MODERATE BENCH PROMPT ================");
console.log(buildLiveJudgePrompt('moderate', 'Example case context.'));

console.log("\n================ HARD BENCH PROMPT ================");
console.log(buildLiveJudgePrompt('hard', 'Example case context.'));
