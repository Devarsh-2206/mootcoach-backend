const WebSocket = require("ws");

function runLocalTest() {
  console.log("Connecting to local backend at ws://localhost:3000/ws/voice...");
  const ws = new WebSocket("ws://localhost:3000/ws/voice");

  ws.on("open", () => {
    console.log("Connected to backend WS. Waiting for 'ready' status...");
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    console.log("[RECEIVED FROM BACKEND]:", msg.type);
    
    if (msg.type === "status" && msg.status === "connected") {
       console.log("Backend is ready. Sending prompt...");
       ws.send(JSON.stringify({
         type: "text",
         text: "Learned Counsel for the petitioner is present. Please begin the proceedings."
       }));
    }
    
    if (msg.type === "text") {
      console.log("  -> TEXT:", msg.text.substring(0, 50));
    } else if (msg.type === "audio") {
      console.log("  -> AUDIO: [binary chunk]");
    }
  });

  ws.on("close", () => {
    console.log("Connection closed.");
  });
  
  ws.on("error", (err) => {
    console.log("Connection error:", err);
  });

  setTimeout(() => {
    console.log("Test finished.");
    ws.close();
    process.exit(0);
  }, 25000);
}

runLocalTest();
