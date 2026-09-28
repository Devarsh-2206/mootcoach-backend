const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Clear any proxy/internal endpoints injected by the IDE sandbox
delete process.env.GEMINI_BASE_URL;
delete process.env.GOOGLE_API_KEY;

// Ensure the API key is set
if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set in your .env file.");
    process.exit(1);
}

// Initialize the Google Gen AI client explicitly hitting the public endpoint
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com' }
});
const MODEL_NAME = 'gemini-2.5-flash';

/**
 * Runs a single agent with a specific role and prompt.
 */
async function runAgent(role, systemInstruction, prompt) {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2 // Low temperature for more deterministic/logical analysis
            }
        });
        return response.text;
    } catch (e) {
        console.error(`Error running ${role}:`, e.message);
        return null;
    }
}

/**
 * Processes a single file through the multi-agent pipeline.
 */
async function processFile(filePath) {
    console.log(`\n========================================================`);
    console.log(`🚀 Starting Multi-Agent Review Pipeline for: ${filePath}`);
    console.log(`========================================================\n`);
    
    const code = fs.readFileSync(filePath, 'utf-8');

    // ---------------------------------------------------------
    // Agent 1: Identifier
    // ---------------------------------------------------------
    console.log("🕵️ Agent 1 (Identifier): Scanning code for bugs and dead lines...");
    const identifierPrompt = `Analyze the following code. Identify any bugs and any unwanted, dead, or useless lines of code. Ensure every line serves a purpose. Code:\n\n${code}`;
    const identifiedIssues = await runAgent(
        "Identifier",
        "You are an expert Code Reviewer. Your job is purely to identify potential bugs and useless/dead code. Be highly critical but do not modify the code yet. Just list the issues and the exact line numbers or snippets.",
        identifierPrompt
    );
    if (!identifiedIssues) return;
    console.log("   ✅ Identifier finished.\n");

    // ---------------------------------------------------------
    // Agent 2: Verifier
    // ---------------------------------------------------------
    console.log("🧐 Agent 2 (Verifier): Cross-checking Agent 1's findings against the code...");
    const verifierPrompt = `Original Code:\n${code}\n\nIdentified Issues from Agent 1:\n${identifiedIssues}\n\nVerify each of the identified issues. Are they truly bugs or dead code? Confirm or reject each point with strict technical reasoning.`;
    const verifiedIssues = await runAgent(
        "Verifier",
        "You are a Senior Software Engineer (Verifier). Your job is to check the work of the Identifier. Reject false positives and confirm true issues. Be very strict.",
        verifierPrompt
    );
    if (!verifiedIssues) return;
    console.log("   ✅ Verifier finished.\n");

    // ---------------------------------------------------------
    // Agent 3: Cross-Verifier
    // ---------------------------------------------------------
    console.log("⚖️ Agent 3 (Cross-Verifier): Bringing a fresh perspective and arbitrating...");
    const crossVerifierPrompt = `Original Code:\n${code}\n\nIdentifier's Claims:\n${identifiedIssues}\n\nVerifier's Feedback:\n${verifiedIssues}\n\nPerform a cross-verification. Bring a fresh perspective. Do you agree with the Verifier? Provide your final judgement on what actually needs to be fixed or removed.`;
    const crossVerifiedIssues = await runAgent(
        "Cross-Verifier",
        "You are a Principal Engineer (Cross-Verifier). Your job is to arbitrate between the Identifier and Verifier and make a definitive decision on each issue.",
        crossVerifierPrompt
    );
    if (!crossVerifiedIssues) return;
    console.log("   ✅ Cross-Verifier finished.\n");

    // ---------------------------------------------------------
    // Agent 4: Final Verification (Planner)
    // ---------------------------------------------------------
    console.log("📋 Agent 4 (Final Verification): Creating the final actionable plan...");
    const finalVerificationPrompt = `Original Code:\n${code}\n\nCross-Verifier's Judgement:\n${crossVerifiedIssues}\n\nProvide the FINAL list of exact changes (removals and bug fixes) that will be applied. This must be a clear, actionable plan. If no changes are needed, explicitly state that the file is perfect.`;
    const finalPlan = await runAgent(
        "Planner",
        "You are the Final Verification Agent (Planner). Create a strict, bulleted plan of ONLY the confirmed changes that must be made based on the provided judgement. Do not include unverified changes.",
        finalVerificationPrompt
    );
    if (!finalPlan) return;
    console.log("   ✅ Final Plan ready.\n");
    console.log("--- Final Plan to be executed ---\n" + finalPlan + "\n---------------------------------\n");

    if (finalPlan.toLowerCase().includes("no changes") || finalPlan.toLowerCase().includes("is perfect")) {
        console.log(`✅ No changes needed for ${filePath}. Skipping refactor.`);
        return;
    }

    // ---------------------------------------------------------
    // Agent 5: Removal & Refactor
    // ---------------------------------------------------------
    console.log("🛠️ Agent 5 (Remover/Refactor): Applying the plan and generating clean code...");
    const refactorPrompt = `Original Code:\n${code}\n\nFinal Approved Plan:\n${finalPlan}\n\nRewrite the original code by strictly applying the plan. Remove the unwanted lines and fix the bugs. Return the COMPLETE refactored code (do not omit unchanged parts).`;
    const newCodeRaw = await runAgent(
        "Refactor",
        "You are the Refactoring Agent. Apply the provided plan to the code. Return ONLY the code in a single markdown block (e.g. \`\`\`javascript ... \`\`\`). Do not include any explanations.",
        refactorPrompt
    );
    if (!newCodeRaw) return;
    console.log("   ✅ Refactoring finished.\n");
    
    // Clean up markdown block if present
    let newCode = newCodeRaw;
    if (newCode.startsWith("```")) {
        const lines = newCode.split("\n");
        if (lines.length > 2) {
            newCode = lines.slice(1, -1).join("\n");
        }
    } else {
        newCode = newCodeRaw;
    }
    
    // Write back to a new file so the user can diff it easily
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const newFilePath = path.join(dir, `${base}_cleaned${ext}`);
    
    fs.writeFileSync(newFilePath, newCode);
    console.log(`✅ Pipeline Complete! Cleaned code saved to: ${newFilePath}`);
}

async function main() {
    const targetPath = process.argv[2];
    if (!targetPath) {
        console.error("Usage: node tools/multi_agent_reviewer.js <path-to-file-or-dir>");
        process.exit(1);
    }

    const fullTargetPath = path.resolve(targetPath);
    if (!fs.existsSync(fullTargetPath)) {
        console.error(`Error: Path ${fullTargetPath} does not exist.`);
        process.exit(1);
    }

    const stat = fs.statSync(fullTargetPath);
    if (stat.isFile()) {
        await processFile(fullTargetPath);
    } else if (stat.isDirectory()) {
        const files = fs.readdirSync(fullTargetPath);
        for (const file of files) {
            const p = path.join(fullTargetPath, file);
            if (fs.statSync(p).isFile() && ['.js', '.html', '.css'].includes(path.extname(p))) {
                await processFile(p);
            }
        }
    }
}

main();
