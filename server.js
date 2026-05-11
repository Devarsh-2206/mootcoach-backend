process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");

const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `
You are MootCoach AI.

Analyze moot court propositions professionally.

Give:
1. Summary
2. Legal issues
3. Petitioner arguments
4. Respondent arguments
5. Relevant cases
6. Constitutional provisions
7. Moot Readiness Score out of 100
8. Oral round difficulty
9. Research complexity
10. Strategic insights

Format output clearly.
`;

app.post("/analyze", upload.single("file"), async (req, res) => {

  try {

    const dataBuffer = fs.readFileSync(req.file.path);

    let extractedText = "";

try {
  const pdfData = await pdfParse(dataBuffer);
  extractedText = pdfData.text || "";
} catch (err) {
  console.error("PDF Parse Error:", err);

  // fallback: continue with empty text instead of crashing
  extractedText = "Unable to fully parse PDF content.";
}
    


    const completion = await groq.chat.completions.create({

      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `
Analyze this moot proposition:

${extractedText}
          `,
        },
      ],
    });

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      response: completion.choices[0].message.content,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });

  }

});

app.listen(3000, () => {
  console.log("🚀 MootCoach AI running on port 3000");
});