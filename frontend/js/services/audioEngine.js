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
}

export function scheduleVoicePlayback(float32Array) {
  if (!voiceAudioContext) return;

  const sampleRate = 24000;
  const buffer = voiceAudioContext.createBuffer(1, float32Array.length, sampleRate);
  buffer.copyToChannel(float32Array, 0);

  const source = voiceAudioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(voiceAudioContext.destination);

  const currentTime = voiceAudioContext.currentTime;
  let startTime = Math.max(currentTime, voiceNextPlayTime);
  
  source.start(startTime);
  voiceNextPlayTime = startTime + buffer.duration;
  
  voicePlaybackSources.push(source);

  source.onended = () => {
    const idx = voicePlaybackSources.indexOf(source);
    if (idx > -1) {
      voicePlaybackSources.splice(idx, 1);
    }
  };
}

export async function startOralRound(callbacks) {
  const { onStatusChange, onAudio, onText, onInterrupted, onTurnComplete, onError, onClose } = callbacks;

  console.log("🎙️ Initiating oral round...");
  voiceSessionActive = true;
  voiceSessionStartTime = Date.now();
  voiceNextPlayTime = 0;
  voicePlaybackSources = [];

  try {
    const wsUrl = getWsUrl();
    console.log(`Connecting to voice WebSocket: ${wsUrl}`);
    voiceWebSocket = new WebSocket(wsUrl);
    
    voiceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    voiceMicrophoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    try {
      await voiceAudioContext.audioWorklet.addModule('/pcm-processor.js');
    } catch (err) {
      console.error("Failed to load /pcm-processor.js", err);
      throw new Error("Could not load pcm-processor.js audio worklet. Please check path.");
    }

    voiceSourceNode = voiceAudioContext.createMediaStreamSource(voiceMicrophoneStream);
    voiceWorkletNode = new AudioWorkletNode(voiceAudioContext, 'pcm-processor');

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
    voiceWorkletNode.connect(voiceAudioContext.destination);

    voiceWebSocket.onopen = () => {
      console.log("🎙️ Voice WebSocket opened.");
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
          scheduleVoicePlayback(float32Data);
          if (onAudio) onAudio(float32Data);
        } else if (msg.type === 'text') {
          if (onText) onText(msg.text);
        } else if (msg.type === 'interrupted') {
          console.log("⚡ Judge interrupted. Stop audio playback.");
          stopVoicePlayback();
          onStatusChange('listening', 'Listening...');
          if (onInterrupted) onInterrupted();
        } else if (msg.type === 'turnComplete') {
          onStatusChange('listening', 'Listening...');
          if (onTurnComplete) onTurnComplete();
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
  
  return durationSec;
}
