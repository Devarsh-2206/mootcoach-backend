const { parentPort, workerData } = require("worker_threads");
const pdfParse = require("pdf-parse");

(async () => {
  try {
    const dataBuffer = Buffer.from(workerData.buffer);
    const pdfData = await pdfParse(dataBuffer);
    parentPort.postMessage({ success: true, text: pdfData.text || "" });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message });
  }
})();
