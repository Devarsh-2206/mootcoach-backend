import { BASE_URL } from '../config.js';

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
let audioChunksBuffer = [];
let isAudioBuffering = true;

function getWsUrl() {
  return BASE_URL.replace(/^http/, 'ws') + '/ws/voice';
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
    if (source === latestPlaybackSource) {
      latestPlaybackSource = null;
      console.log("[DEBUG AUDIT] Latest scheduled audio source onended fired. Remaining sources in queue:", voicePlaybackSources.length);
      if (isTurnCompleteReceived) {
        console.log('[TTS_STREAM] Finished entire playback turn');
        triggerTurnComplete();
      }
    }
  };
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
  audioChunksBuffer = [];
  isAudioBuffering = true;

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
        micLevelEl.style.width = `${percentMic}%`;
      }

      // 2. Animate Waveform Bars based on status
      const waveBars = document.querySelectorAll('#cr-waveform-container .cr-wave-bar');
      if (waveBars.length > 0) {
        if (window.voiceStatus === 'speaking') {
          // Judge Speaking -> Playback Analyser
          playbackAnalyser.getByteFrequencyData(playDataArray);
          waveBars.forEach((bar, index) => {
            const val = playDataArray[index % playBufferLength] || 0;
            const height = Math.max(4, Math.round((val / 255) * 24));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#e05252'; // Red for Judge
          });
        } else if (window.voiceStatus === 'listening') {
          // Counsel/Advocate Speaking -> Mic Analyser
          waveBars.forEach((bar, index) => {
            const val = micDataArray[index % micBufferLength] || 0;
            const height = Math.max(4, Math.round((val / 255) * 24));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#60a5fa'; // Blue for Counsel
          });
        } else if (window.voiceStatus === 'processing') {
          // Processing -> Purple pulsing wave
          const time = Date.now() * 0.005;
          waveBars.forEach((bar, index) => {
            const height = Math.max(4, Math.round(14 + Math.sin(time + index * 0.8) * 10));
            bar.style.height = `${height}px`;
            bar.style.backgroundColor = '#a78bfa'; // Purple for Processing
          });
        } else {
          // Idle/Disconnected -> Small static bars
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
        // Reset buffering since Advocate is speaking, and next response should buffer
        isAudioBuffering = true;
        audioChunksBuffer = [];
      }
    };

    voiceSourceNode.connect(voiceWorkletNode);
    
    // Connect worklet to zero-gain dummy silenceNode to prevent acoustic feedback loop muting while keeping worklet alive in browser
    const silenceNode = voiceAudioContext.createGain();
    silenceNode.gain.value = 0;
    voiceWorkletNode.connect(silenceNode);
    silenceNode.connect(voiceAudioContext.destination);

    voiceWebSocket.onopen = () => {
      console.log("🎙️ Voice WebSocket opened.");
      
      const selectedIssue = document.getElementById('builder-issue-select')?.value || '';
      const selectedStance = (typeof window.getCurrentSelectedSide === 'function') ? window.getCurrentSelectedSide() : 'Petitioner';
      const selectedAuths = window.selectedAuthorities || [];
      const selectedAuthsText = selectedAuths.map(a => `${a.name}: ${a.ratio}`).join(', ');
      
      const primingPrompt = `[Appellate Advocacy Hearing Starting] 
Advocate Stance: ${selectedStance.toUpperCase()}
Target Legal Issue: ${selectedIssue}
Selected Authorities: ${selectedAuthsText}
Case Context Summary: ${currentPropositionContext || 'General dispute'}

Begin the hearing by asking a challenging opening question tailored to this issue and stance. Keep it short and intimidating.`;

      voiceWebSocket.send(JSON.stringify({
        type: "text",
        text: primingPrompt
      }));
    };

    voiceWebSocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
          if (msg.status === 'connected') {
            onStatusChange('listening', 'Listening...');
          }
        } else if (msg.type === 'audio') {
          onStatusChange('speaking', 'Judge Speaking...');
          const float32Data = base64ToFloat32Array(msg.data);
          if (isAudioBuffering) {
            audioChunksBuffer.push(float32Data);
          } else {
            scheduleVoicePlayback(float32Data);
          }
          if (onAudio) onAudio(float32Data);
        } else if (msg.type === 'text') {
          if (onText) onText(msg.text);
        } else if (msg.type === 'interrupted') {
          console.log("⚡ Judge interrupted. Stop audio playback.");
          stopVoicePlayback();
          isAudioBuffering = true;
          audioChunksBuffer = [];
          onStatusChange('listening', 'Listening...');
          if (onInterrupted) onInterrupted();
        } else if (msg.type === 'turnComplete') {
          console.log("[DEBUG AUDIT] turnComplete received from server.");
          isTurnCompleteReceived = true;
          if (onTurnComplete) {
            onTurnComplete();
          }
          // Now play all buffered audio chunks since transcript has been rendered
          isAudioBuffering = false;
          audioChunksBuffer.forEach(chunk => {
            scheduleVoicePlayback(chunk);
          });
          audioChunksBuffer = [];
          
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
      onStatusChange('error', 'Connection Error');
    };

    voiceWebSocket.onclose = () => {
      console.log("🎙️ Voice WebSocket closed.");
      if (onClose) onClose();
    };

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

  if (voiceWebSocket) {
    try { voiceWebSocket.close(); } catch(e){}
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
  
  return durationSec;
}
