import { BASE_URL } from '../config.js';
import { currentPropositionContext } from '../components/ui.js';
import { benchProfiles } from '../config/benchProfiles.js';

let voiceWebSocket = null;
let voiceAudioContext = null;
let voiceMicrophoneStream = null;
let voiceWorkletNode = null;
let voiceSourceNode = null;
let voiceSessionActive = false;
let voiceSessionStartTime = null;
let voiceNextPlayTime = 0;
let voicePlaybackSources = [];
let micAnalyser = null;
let playbackAnalyser = null;
let latestPlaybackSource = null;
let isTurnCompleteReceived = false;
let onPlaybackCompleteCallback = null;

let activeCallbacks = null;
let heartbeatInterval = null;
let reconnectionPromise = null;

function getWsUrl() {
  const mode = window.benchDifficultyMode || 'moderate';
  const summary = currentPropositionContext || '';
  const query = `?bench=${encodeURIComponent(mode)}&summary=${encodeURIComponent(summary.slice(0, 1000))}`;
  
  if (BASE_URL.startsWith('https://')) {
    return BASE_URL.replace('https://', 'wss://') + '/ws/voice' + query;
  } else if (BASE_URL.startsWith('http://')) {
    return BASE_URL.replace('http://', 'ws://') + '/ws/voice' + query;
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/voice${query}`;
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

export function isSessionActive() {
  return voiceSessionActive;
}

export function getSessionStartTime() {
  return voiceSessionStartTime;
}

export function getSocketState() {
  if (!voiceWebSocket) return 'disconnected';
  switch (voiceWebSocket.readyState) {
    case WebSocket.CONNECTING:
      return 'connecting';
    case WebSocket.OPEN:
      return 'open';
    case WebSocket.CLOSING:
    case WebSocket.CLOSED:
    default:
      return 'disconnected';
  }
}

export function stopVoicePlayback() {
  voicePlaybackSources.forEach(source => {
    try { source.stop(); } catch(e){}
  });
  voicePlaybackSources = [];
  voiceNextPlayTime = 0;
  latestPlaybackSource = null;
}

function triggerTurnComplete() {
  console.log("[DEBUG AUDIT] triggerTurnComplete: invoking onPlaybackCompleteCallback...");
  isTurnCompleteReceived = false;
  voiceNextPlayTime = 0;
  if (onPlaybackCompleteCallback) {
    onPlaybackCompleteCallback();
  }
}

export async function logAudioDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log("[AUDIO DEVICES] Enumeration not supported.");
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d => d.kind === 'audioinput');
    const outputs = devices.filter(d => d.kind === 'audiooutput');
    console.log("[AUDIO DEVICES] Active Audio Input Devices:");
    inputs.forEach(d => {
      console.log(` - Label: "${d.label || 'Default'}", ID: "${d.deviceId}"`);
    });
    console.log("[AUDIO DEVICES] Active Audio Output Devices:");
    outputs.forEach(d => {
      console.log(` - Label: "${d.label || 'Default'}", ID: "${d.deviceId}"`);
    });
  } catch (err) {
    console.error("[AUDIO DEVICES] Failed to enumerate devices:", err);
  }
}

if (typeof window !== 'undefined' && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    console.log("[AUDIO DEVICES] Audio device configuration changed.");
    logAudioDevices();
  });
}

export function scheduleVoicePlayback(float32Array) {
  if (!voiceAudioContext) return;

  if (voiceAudioContext.state === 'suspended') {
    console.log("[DEBUG AUDIT] AudioContext suspended during playback. Attempting to resume...");
    voiceAudioContext.resume().catch(err => {
      console.warn("Failed to resume AudioContext during playback:", err);
    });
  }

  const sampleRate = 24000;
  const buffer = voiceAudioContext.createBuffer(1, float32Array.length, sampleRate);
  buffer.copyToChannel(float32Array, 0);

  const source = voiceAudioContext.createBufferSource();
  source.buffer = buffer;
  
  if (playbackAnalyser) {
    source.connect(playbackAnalyser);
  } else {
    source.connect(voiceAudioContext.destination);
  }

  const currentTime = voiceAudioContext.currentTime;
  let startTime = Math.max(currentTime, voiceNextPlayTime);
  
  console.log('[TTS_STREAM] Starting playback chunk of duration:', buffer.duration);
  source.start(startTime);
  voiceNextPlayTime = startTime + buffer.duration;
  
  voicePlaybackSources.push(source);
  latestPlaybackSource = source;

  source.onended = () => {
    console.log('[TTS_STREAM] Finished playback chunk');
    const idx = voicePlaybackSources.indexOf(source);
    if (idx > -1) {
      voicePlaybackSources.splice(idx, 1);
    }
    if (voicePlaybackSources.length === 0 && isTurnCompleteReceived) {
      latestPlaybackSource = null;
      console.log('[TTS_STREAM] Finished entire playback turn');
      triggerTurnComplete();
    }
  };
}

function setupWebSocketHandlers(callbacks, onOpenCallback = null) {
  const { onStatusChange, onAudio, onText, onInterrupted, onTurnComplete, onPlaybackComplete, onError, onClose } = callbacks;

  voiceWebSocket.onopen = () => {
    console.log("🎙️ Voice WebSocket opened.");
    
    // Toggle state and status badge in UI immediately
    if (onStatusChange) {
      onStatusChange('ready', 'Bench Ready');
    }
    const voiceStatusEl = document.getElementById('bench-voice-status');
    const voiceTextEl = document.getElementById('bench-voice-text');
    if (voiceStatusEl && voiceTextEl) {
      voiceStatusEl.className = 'backend-status online';
      voiceTextEl.textContent = 'CONNECTED';
    }

    // Start heartbeat ping every 5 seconds to prevent Render spin-down
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
        console.log("💓 Heartbeat ping");
        voiceWebSocket.send(JSON.stringify({ type: "ping" }));
      }
    }, 5000);

    if (onOpenCallback) {
      onOpenCallback();
    } else {
      const selectedIssue = document.getElementById('builder-issue-select')?.value || '';
      const selectedStance = (typeof window.getCurrentSelectedSide === 'function') ? window.getCurrentSelectedSide() : 'Petitioner';
      const selectedAuths = window.selectedAuthorities || [];
      const selectedAuthsText = selectedAuths.map(a => `${a.name}: ${a.ratio}`).join(', ');
      
      const mode = window.benchDifficultyMode || 'moderate';
      const bench = benchProfiles[mode] || benchProfiles.moderate;
      
      const judgesConfig = bench.judges.map(j => `- ${j.name} (${j.ideology}): ${j.behavior}`).join('\n');

      const primingPrompt = `[Appellate Advocacy Hearing Starting] 
Advocate Stance: ${selectedStance.toUpperCase()}
Target Legal Issue: ${selectedIssue}
Selected Authorities: ${selectedAuthsText}
Case Context Summary: ${currentPropositionContext || 'General dispute'}

YOU ARE ACTING AS A MULTI-JUDGE BENCH. 
The bench comprises:
${judgesConfig}

IMPORTANT INSTRUCTIONS:
- You must maintain these distinct judge personalities throughout the hearing.
- WHEN A JUDGE SPEAKS, YOU MUST PREPEND THEIR DIALOGUE WITH THEIR NAME IN BRACKETS.
- Example: "[Chief Justice Rao] Counsel, how do you explain..."
- Example: "[Justice Menon] I disagree, the statute is clear..."
- Do NOT act as a narrator, only speak as the judges.

Begin the hearing by having one of the judges ask a challenging opening question tailored to this issue and stance. Keep it short and intimidating.`;

      voiceWebSocket.send(JSON.stringify({
        type: "text",
        text: primingPrompt
      }));
    }
  };

  voiceWebSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        if (msg.status === 'connected') {
          onStatusChange('listening', 'Listening...');
        }
      } else if (msg.type === 'audio') {
        if (msg.data && msg.data.trim()) {
          if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
            onStatusChange('speaking', 'Judge Speaking...');
          }
          const float32Data = base64ToFloat32Array(msg.data);
          // F1 fix: restore producer->consumer handoff for Gemini audio packets.
          // While buffering, enqueue chunks for turnComplete flush; once flushing starts,
          // schedule playback immediately for low-latency streaming.
          scheduleVoicePlayback(float32Data);
          if (onAudio) onAudio(float32Data);
        }
      } else if (msg.type === 'text') {
        console.log("[DEBUG TRACE] Frontend received text packet from backend:", msg.text.substring(0, 50));
        if (msg.text && msg.text.trim()) {
          if (onText) onText(msg.text);
        }
      } else if (msg.type === 'interrupted') {
        console.log("⚡ Judge interrupted. Stop audio playback.");
        stopVoicePlayback();
        onStatusChange('listening', 'Listening...');
        if (onInterrupted) onInterrupted();
      } else if (msg.type === 'turnComplete') {
        console.log("[DEBUG AUDIT] turnComplete received from server.");
        isTurnCompleteReceived = true;
        if (onTurnComplete) {
          onTurnComplete();
        }
        
        if (voicePlaybackSources.length === 0) {
          console.log('[TTS_STREAM] Finished entire playback turn (no queued sources)');
          triggerTurnComplete();
        }
      } else if (msg.type === 'error') {
        console.error("Voice server error:", msg.message);
        if (onError) onError(msg.message);
      }
    } catch (err) {
      console.error("Error parsing WebSocket message:", err);
    }
  };

  voiceWebSocket.onerror = (err) => {
    console.error("Voice WebSocket Error:", err);
    if (onStatusChange) {
      onStatusChange('error', 'Connection Error');
    }
  };

  voiceWebSocket.onclose = () => {
    console.log("🎙️ Voice WebSocket closed.");
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    const voiceStatusEl = document.getElementById('bench-voice-status');
    const voiceTextEl = document.getElementById('bench-voice-text');
    if (voiceStatusEl && voiceTextEl) {
      voiceStatusEl.className = 'backend-status offline';
      voiceTextEl.textContent = 'DISCONNECTED';
    }

    if (voiceSessionActive) {
      console.log("Attempting automatic reconnection in 1s...");
      setTimeout(() => {
        if (voiceSessionActive) {
          reconnectWebSocket(callbacks);
        }
      }, 1000);
    } else {
      if (onClose) onClose();
    }
  };
}

async function reconnectWebSocket(callbacks = activeCallbacks, onOpenCallback = null) {
  if (!voiceSessionActive || !callbacks) {
    if (onOpenCallback) onOpenCallback();
    return;
  }
  console.log("🔄 Reconnecting voice WebSocket...");

  if (voiceWebSocket) {
    try {
      voiceWebSocket.onopen = null;
      voiceWebSocket.onmessage = null;
      voiceWebSocket.onerror = null;
      voiceWebSocket.onclose = null;
      voiceWebSocket.close();
    } catch (e) {}
    voiceWebSocket = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  const { onStatusChange } = callbacks;
  if (onStatusChange) {
    onStatusChange('reconnecting', 'Reconnecting to Bench...');
  }
  const voiceStatusEl = document.getElementById('bench-voice-status');
  const voiceTextEl = document.getElementById('bench-voice-text');
  if (voiceStatusEl && voiceTextEl) {
    voiceStatusEl.className = 'backend-status checking';
    voiceTextEl.textContent = 'CONNECTING...';
  }

  try {
    const wsUrl = getWsUrl();
    voiceWebSocket = new WebSocket(wsUrl);
    setupWebSocketHandlers(callbacks, onOpenCallback);
  } catch (err) {
    console.error("Reconnection attempt failed:", err);
    setTimeout(() => reconnectWebSocket(callbacks, onOpenCallback), 2000);
  }
}

function reconnectWebSocketPromise(callbacks = activeCallbacks) {
  if (reconnectionPromise) return reconnectionPromise;

  reconnectionPromise = new Promise((resolve) => {
    reconnectWebSocket(callbacks, () => {
      reconnectionPromise = null;
      resolve();
    });
  });

  return reconnectionPromise;
}

export async function sendSpeechText(text) {
  if (!voiceWebSocket || voiceWebSocket.readyState !== WebSocket.OPEN) {
    console.log("WebSocket not open. Reconnecting before sending speech...");
    await reconnectWebSocketPromise(activeCallbacks);
  }
  
  if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
    console.log("Sending speech text payload:", text);
    voiceWebSocket.send(JSON.stringify({
      type: "text",
      text: text
    }));
  } else {
    console.error("Failed to send speech text: Socket reconnection failed.");
  }
}

export async function startOralRound(callbacks) {
  const { onStatusChange, onAudio, onText, onInterrupted, onTurnComplete, onPlaybackComplete, onError, onClose } = callbacks;

  console.log("🎙️ Initiating oral round...");
  voiceSessionActive = true;
  voiceSessionStartTime = Date.now();
  voiceNextPlayTime = 0;
  voicePlaybackSources = [];
  latestPlaybackSource = null;
  isTurnCompleteReceived = false;
  onPlaybackCompleteCallback = onPlaybackComplete;
  activeCallbacks = callbacks;

  try {
    await logAudioDevices();

    const wsUrl = getWsUrl();
    console.log(`Connecting to voice WebSocket: ${wsUrl}`);
    voiceWebSocket = new WebSocket(wsUrl);
    
    voiceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (voiceAudioContext.state === 'suspended') {
      console.log("[DEBUG AUDIT] AudioContext is suspended. Resuming...");
      await voiceAudioContext.resume().catch(err => {
        console.warn("Failed to resume AudioContext on start:", err);
      });
      console.log("[DEBUG AUDIT] AudioContext state after resume:", voiceAudioContext.state);
    }
    
    // Set up playback Analyser
    playbackAnalyser = voiceAudioContext.createAnalyser();
    playbackAnalyser.fftSize = 256;
    playbackAnalyser.connect(voiceAudioContext.destination);
    
    voiceMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    onStatusChange('ready', 'Bench Ready');

    try {
      await voiceAudioContext.audioWorklet.addModule('/pcm-processor.js');
    } catch (err) {
      console.error("Failed to load /pcm-processor.js", err);
      throw new Error("Could not load pcm-processor.js audio worklet. Please check path.");
    }

    voiceSourceNode = voiceAudioContext.createMediaStreamSource(voiceMicrophoneStream);
    voiceWorkletNode = new AudioWorkletNode(voiceAudioContext, 'pcm-processor');

    // Set up mic Analyser
    micAnalyser = voiceAudioContext.createAnalyser();
    micAnalyser.fftSize = 256;
    voiceSourceNode.connect(micAnalyser);

    // Dynamic visualization animation loops
    const micBufferLength = micAnalyser.frequencyBinCount;
    const micDataArray = new Uint8Array(micBufferLength);
    const playBufferLength = playbackAnalyser.frequencyBinCount;
    const playDataArray = new Uint8Array(playBufferLength);

    const updateAudioLevels = () => {
      if (!voiceSessionActive) return;

      const isOpen = voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN;

      // 1. Analyze Mic Volume
      micAnalyser.getByteFrequencyData(micDataArray);
      let sumMic = 0;
      for (let i = 0; i < micBufferLength; i++) {
        sumMic += micDataArray[i];
      }
      const averageMic = sumMic / micBufferLength;
      const percentMic = Math.min(100, Math.round((averageMic / 128) * 100));
      
      const micLevelEl = document.getElementById('cr-mic-level');
      if (micLevelEl) {
        micLevelEl.style.width = isOpen ? `${percentMic}%` : `0%`;
      }

      // 2. Animate Waveform Bars based on status
      const waveBars = document.querySelectorAll('#cr-waveform-container .cr-wave-bar');
      if (waveBars.length > 0) {
        if (isOpen && window.voiceStatus === 'speaking') {
          // Judge Speaking -> Pulsing Red wave
          const time = Date.now() * 0.005;
          waveBars.forEach((bar, index) => {
            const height = Math.max(4, Math.round(14 + Math.sin(time + index * 0.8) * 10));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#e05252'; // Red for Judge
          });
        } else if (isOpen && window.voiceStatus === 'listening') {
          // Counsel/Advocate Speaking -> Mic Analyser
          waveBars.forEach((bar, index) => {
            const val = micDataArray[index % micBufferLength] || 0;
            const height = Math.max(4, Math.round((val / 255) * 24));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#60a5fa'; // Blue for Counsel
          });
        } else if (isOpen && window.voiceStatus === 'processing') {
          // Processing -> Purple pulsing wave
          const time = Date.now() * 0.005;
          waveBars.forEach((bar, index) => {
            const height = Math.max(4, Math.round(14 + Math.sin(time + index * 0.8) * 10));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#a78bfa'; // Purple for Processing
          });
        } else {
          // Idle/Disconnected/Connecting -> Small static bars
          waveBars.forEach((bar) => {
            bar.style.height = '4px';
            bar.style.backgroundColor = 'rgba(245, 243, 239, 0.3)';
          });
        }
      }

      requestAnimationFrame(updateAudioLevels);
    };

    requestAnimationFrame(updateAudioLevels);

    voiceWorkletNode.port.onmessage = (event) => {
      if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
        const base64Audio = arrayBufferToBase64(event.data);
        voiceWebSocket.send(JSON.stringify({
          type: "audio",
          data: base64Audio
        }));
      }
    };

    voiceSourceNode.connect(voiceWorkletNode);
    
    const silenceNode = voiceAudioContext.createGain();
    silenceNode.gain.value = 0;
    voiceWorkletNode.connect(silenceNode);
    silenceNode.connect(voiceAudioContext.destination);

    setupWebSocketHandlers(callbacks);

  } catch (err) {
    console.error("Failed to start oral round:", err);
    if (onError) onError(`Failed to start: ${err.message}`);
    throw err;
  }
}

export function stopOralRound() {
  if (!voiceSessionActive) return 0;
  console.log("🎙️ Stopping oral round...");
  voiceSessionActive = false;

  const durationSec = Math.floor((Date.now() - voiceSessionStartTime) / 1000);

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (voiceWebSocket) {
    try {
      voiceWebSocket.onopen = null;
      voiceWebSocket.onmessage = null;
      voiceWebSocket.onerror = null;
      voiceWebSocket.onclose = null;
      voiceWebSocket.close();
    } catch (e){}
    voiceWebSocket = null;
  }

  if (voiceMicrophoneStream) {
    voiceMicrophoneStream.getTracks().forEach(track => track.stop());
    voiceMicrophoneStream = null;
  }

  if (voiceSourceNode) {
    try { voiceSourceNode.disconnect(); } catch(e){}
    voiceSourceNode = null;
  }
  if (voiceWorkletNode) {
    try { voiceWorkletNode.disconnect(); } catch(e){}
    voiceWorkletNode = null;
  }

  if (voiceAudioContext) {
    try { voiceAudioContext.close(); } catch(e){}
    voiceAudioContext = null;
  }

  stopVoicePlayback();
  
  micAnalyser = null;
  playbackAnalyser = null;
  activeCallbacks = null;
  
  return durationSec;
}
