const { parentPort, workerData } = require("worker_threads");
const pdfParse = require("pdf-parse");

(async () => {
  try {
    const dataBuffer = Buffer.from(workerData.buffer);
    const pdfData = await pdfParse(dataBuffer);
    parentPort.postMessage({ success: true, text: pdfData.text || "", numpages: pdfData.numpages || null });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message });
  }
})();
