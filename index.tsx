/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from "./genaiProxy";
import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @property({type: Boolean, reflect: true, attribute: 'active-input'})
  activeInput = false;

  private activeInputTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly AUDIO_INPUT_THRESHOLD = 0.015;

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
      transition: box-shadow 0.3s ease, filter 0.3s ease;
    }

    /* Pulsing and glowing CSS animation on component host when active audio input is detected */
    :host([active-input]),
    :host(.active-input),
    :host([data-active-audio="true"]) {
      animation: host-audio-glow-pulse 1.4s ease-in-out infinite;
    }

    @keyframes host-audio-glow-pulse {
      0% {
        box-shadow: inset 0 0 35px rgba(56, 189, 248, 0.45), 0 0 20px rgba(56, 189, 248, 0.3);
      }
      50% {
        box-shadow: inset 0 0 95px rgba(168, 85, 247, 0.8), inset 0 0 170px rgba(56, 189, 248, 0.45), 0 0 50px rgba(168, 85, 247, 0.65);
      }
      100% {
        box-shadow: inset 0 0 35px rgba(56, 189, 248, 0.45), 0 0 20px rgba(56, 189, 248, 0.3);
      }
    }

    /* Ambient glow halo layer that scales and pulses */
    .glow-aura {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      opacity: 0;
      transition: opacity 0.35s ease;
      background: radial-gradient(
        circle at 50% 50%,
        rgba(168, 85, 247, 0.22) 0%,
        rgba(56, 189, 248, 0.15) 35%,
        rgba(16, 12, 20, 0) 70%
      );
    }

    :host([active-input]) .glow-aura,
    :host(.active-input) .glow-aura {
      opacity: 1;
      animation: aura-glow-pulse 1.4s ease-in-out infinite alternate;
    }

    @keyframes aura-glow-pulse {
      0% {
        transform: scale(0.92);
        opacity: 0.55;
        filter: blur(12px) brightness(1);
      }
      50% {
        transform: scale(1.12);
        opacity: 0.95;
        filter: blur(24px) brightness(1.45);
      }
      100% {
        transform: scale(0.92);
        opacity: 0.55;
        filter: blur(12px) brightness(1);
      }
    }

    /* Active audio badge with sound wave bars */
    .audio-input-badge {
      position: absolute;
      top: 2rem;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      z-index: 15;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 18px;
      border-radius: 9999px;
      background: rgba(16, 12, 20, 0.75);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.3);
      backdrop-filter: blur(10px);
      color: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.03em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :host([active-input]) .audio-input-badge,
    :host(.active-input) .audio-input-badge {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      animation: badge-glow-pulse 1.4s ease-in-out infinite alternate;
    }

    @keyframes badge-glow-pulse {
      0% {
        border-color: rgba(56, 189, 248, 0.5);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(56, 189, 248, 0.4);
      }
      100% {
        border-color: rgba(168, 85, 247, 0.85);
        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.5), 0 0 28px rgba(168, 85, 247, 0.65), 0 0 45px rgba(56, 189, 248, 0.35);
      }
    }

    .audio-input-badge .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 10px #38bdf8;
      animation: pulse-dot-anim 1s infinite alternate ease-in-out;
    }

    @keyframes pulse-dot-anim {
      0% {
        background: #38bdf8;
        transform: scale(0.9);
      }
      100% {
        background: #c084fc;
        transform: scale(1.3);
      }
    }

    .wave-bars {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      height: 16px;
    }

    .wave-bars span {
      display: inline-block;
      width: 3px;
      height: 4px;
      background: #38bdf8;
      border-radius: 2px;
      transition: height 0.1s ease;
    }

    :host([active-input]) .wave-bars span:nth-child(1),
    :host(.active-input) .wave-bars span:nth-child(1) {
      animation: bar-bounce 0.6s 0s ease-in-out infinite alternate;
    }
    :host([active-input]) .wave-bars span:nth-child(2),
    :host(.active-input) .wave-bars span:nth-child(2) {
      animation: bar-bounce 0.6s 0.15s ease-in-out infinite alternate;
    }
    :host([active-input]) .wave-bars span:nth-child(3),
    :host(.active-input) .wave-bars span:nth-child(3) {
      animation: bar-bounce 0.6s 0.3s ease-in-out infinite alternate;
    }
    :host([active-input]) .wave-bars span:nth-child(4),
    :host(.active-input) .wave-bars span:nth-child(4) {
      animation: bar-bounce 0.6s 0.45s ease-in-out infinite alternate;
    }

    @keyframes bar-bounce {
      0% {
        height: 4px;
        background: #38bdf8;
      }
      100% {
        height: 16px;
        background: #c084fc;
      }
    }

    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: rgba(255, 255, 255, 0.7);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }
      }

      button[disabled] {
        display: none;
      }
    }

    :host([active-input]) #stopButton,
    :host(.active-input) #stopButton {
      border-color: rgba(239, 68, 68, 0.8);
      animation: stop-btn-pulse 1.2s ease-in-out infinite alternate;
    }

    @keyframes stop-btn-pulse {
      0% {
        transform: scale(1);
        box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
      }
      100% {
        transform: scale(1.08);
        box-shadow: 0 0 30px rgba(239, 68, 68, 0.9), 0 0 45px rgba(168, 85, 247, 0.6);
      }
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: "server-side",
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private handleAudioInputLevel(rms: number) {
    if (rms > this.AUDIO_INPUT_THRESHOLD) {
      if (!this.activeInput) {
        this.activeInput = true;
        this.classList.add('active-input');
        this.setAttribute('data-active-audio', 'true');
      }
      if (this.activeInputTimeout) {
        clearTimeout(this.activeInputTimeout);
      }
      this.activeInputTimeout = setTimeout(() => {
        this.activeInput = false;
        this.classList.remove('active-input');
        this.removeAttribute('data-active-audio');
        this.activeInputTimeout = null;
      }, 350);
    }
  }

  public setActiveAudioInput(active: boolean) {
    this.activeInput = active;
    if (active) {
      this.classList.add('active-input');
      this.setAttribute('data-active-audio', 'true');
    } else {
      this.classList.remove('active-input');
      this.removeAttribute('data-active-audio');
    }
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        // Detect active audio input by computing Root Mean Square (RMS) amplitude
        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i] * pcmData[i];
        }
        const rms = Math.sqrt(sum / pcmData.length);
        this.handleAudioInputLevel(rms);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.activeInputTimeout) {
      clearTimeout(this.activeInputTimeout);
      this.activeInputTimeout = null;
    }
    this.activeInput = false;
    this.classList.remove('active-input');
    this.removeAttribute('data-active-audio');

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  render() {
    return html`
      <div>
        <div class="glow-aura" aria-hidden="true"></div>
        <div class="audio-input-badge" aria-hidden="true">
          <div class="pulse-dot"></div>
          <div class="wave-bars">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Active Audio Input</span>
        </div>

        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
