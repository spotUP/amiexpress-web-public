/**
 * Web Audio API Mock for Node.js Environment
 *
 * Provides minimal mock implementation of Web Audio API for testing/preview
 * in Node.js environments where browser APIs are not available.
 *
 * This is used by the SDK preview server when running doors with Tone.js
 * in a Node.js environment.
 */

/**
 * Initialize Web Audio API mocks in the global scope
 * Call this BEFORE importing Tone.js or any audio libraries
 */
export function initWebAudioMocks(): void {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    // Already in browser environment, no mocking needed
    return;
  }

  console.log('[WebAudioMock] Initializing Web Audio API mocks for Node.js environment...');

  // Create minimal global object
  const g = global as any;

  // Mock AudioContext
  class MockAudioContext {
    public destination: any;
    public currentTime: number = 0;
    public sampleRate: number = 44100;
    public state: string = 'running';
    public listener: any;

    constructor() {
      this.destination = new MockAudioDestinationNode();
      this.listener = new MockAudioListener();
    }

    createOscillator(): any {
      return new MockOscillatorNode();
    }

    createGain(): any {
      return new MockGainNode();
    }

    createDelay(): any {
      return new MockDelayNode();
    }

    createBiquadFilter(): any {
      return new MockBiquadFilterNode();
    }

    createDynamicsCompressor(): any {
      return new MockDynamicsCompressorNode();
    }

    createAnalyser(): any {
      return new MockAnalyserNode();
    }

    createChannelMerger(numberOfInputs?: number): any {
      return new MockChannelMergerNode();
    }

    createChannelSplitter(numberOfOutputs?: number): any {
      return new MockChannelSplitterNode();
    }

    createConvolver(): any {
      return new MockConvolverNode();
    }

    createWaveShaper(): any {
      return new MockWaveShaperNode();
    }

    createPanner(): any {
      return new MockPannerNode();
    }

    createStereoPanner(): any {
      return new MockStereoPannerNode();
    }

    createBufferSource(): any {
      return new MockAudioBufferSourceNode();
    }

    createMediaElementSource(): any {
      return new MockMediaElementAudioSourceNode();
    }

    createMediaStreamSource(): any {
      return new MockMediaStreamAudioSourceNode();
    }

    createBuffer(numberOfChannels: number, length: number, sampleRate: number): any {
      return new MockAudioBuffer(numberOfChannels, length, sampleRate);
    }

    async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<any> {
      return new MockAudioBuffer(2, 44100, 44100);
    }

    resume(): Promise<void> {
      return Promise.resolve();
    }

    suspend(): Promise<void> {
      return Promise.resolve();
    }

    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  // Mock AudioParam
  class MockAudioParam {
    public value: number = 0;
    public defaultValue: number = 0;
    public minValue: number = 0;
    public maxValue: number = 1;
    public automationRate: string = 'a-rate';

    setValueAtTime(value: number, startTime: number): this {
      this.value = value;
      return this;
    }

    linearRampToValueAtTime(value: number, endTime: number): this {
      this.value = value;
      return this;
    }

    exponentialRampToValueAtTime(value: number, endTime: number): this {
      this.value = value;
      return this;
    }

    setTargetAtTime(target: number, startTime: number, timeConstant: number): this {
      this.value = target;
      return this;
    }

    setValueCurveAtTime(values: Float32Array, startTime: number, duration: number): this {
      return this;
    }

    cancelScheduledValues(startTime: number): this {
      return this;
    }

    cancelAndHoldAtTime(cancelTime: number): this {
      return this;
    }
  }

  // Mock AudioNode (base class)
  class MockAudioNode {
    public context: any;
    public numberOfInputs: number = 1;
    public numberOfOutputs: number = 1;
    public channelCount: number = 2;
    public channelCountMode: string = 'max';
    public channelInterpretation: string = 'speakers';

    constructor(context?: any) {
      this.context = context || new MockAudioContext();
    }

    connect(destination: any, output?: number, input?: number): any {
      return destination;
    }

    disconnect(): void {}
  }

  // Mock specific node types
  class MockAudioDestinationNode extends MockAudioNode {
    public maxChannelCount: number = 2;
  }

  class MockAudioListener {
    public positionX: any = new MockAudioParam();
    public positionY: any = new MockAudioParam();
    public positionZ: any = new MockAudioParam();
    public forwardX: any = new MockAudioParam();
    public forwardY: any = new MockAudioParam();
    public forwardZ: any = new MockAudioParam();
    public upX: any = new MockAudioParam();
    public upY: any = new MockAudioParam();
    public upZ: any = new MockAudioParam();
  }

  class MockOscillatorNode extends MockAudioNode {
    public frequency: any = new MockAudioParam();
    public detune: any = new MockAudioParam();
    public type: string = 'sine';

    constructor() {
      super();
      this.frequency.value = 440;
    }

    start(when?: number): void {}
    stop(when?: number): void {}
    setPeriodicWave(periodicWave: any): void {}
  }

  class MockGainNode extends MockAudioNode {
    public gain: any = new MockAudioParam();

    constructor() {
      super();
      this.gain.value = 1;
    }
  }

  class MockDelayNode extends MockAudioNode {
    public delayTime: any = new MockAudioParam();

    constructor() {
      super();
      this.delayTime.value = 0;
    }
  }

  class MockBiquadFilterNode extends MockAudioNode {
    public frequency: any = new MockAudioParam();
    public detune: any = new MockAudioParam();
    public Q: any = new MockAudioParam();
    public gain: any = new MockAudioParam();
    public type: string = 'lowpass';

    constructor() {
      super();
      this.frequency.value = 350;
      this.Q.value = 1;
      this.gain.value = 0;
    }

    getFrequencyResponse(
      frequencyHz: Float32Array,
      magResponse: Float32Array,
      phaseResponse: Float32Array
    ): void {}
  }

  class MockDynamicsCompressorNode extends MockAudioNode {
    public threshold: any = new MockAudioParam();
    public knee: any = new MockAudioParam();
    public ratio: any = new MockAudioParam();
    public attack: any = new MockAudioParam();
    public release: any = new MockAudioParam();
    public reduction: number = 0;

    constructor() {
      super();
      this.threshold.value = -24;
      this.knee.value = 30;
      this.ratio.value = 12;
      this.attack.value = 0.003;
      this.release.value = 0.25;
    }
  }

  class MockAnalyserNode extends MockAudioNode {
    public fftSize: number = 2048;
    public frequencyBinCount: number = 1024;
    public minDecibels: number = -100;
    public maxDecibels: number = -30;
    public smoothingTimeConstant: number = 0.8;

    getFloatFrequencyData(array: Float32Array): void {}
    getByteFrequencyData(array: Uint8Array): void {}
    getFloatTimeDomainData(array: Float32Array): void {}
    getByteTimeDomainData(array: Uint8Array): void {}
  }

  class MockChannelMergerNode extends MockAudioNode {}
  class MockChannelSplitterNode extends MockAudioNode {}
  class MockConvolverNode extends MockAudioNode {
    public buffer: any = null;
    public normalize: boolean = true;
  }

  class MockWaveShaperNode extends MockAudioNode {
    public curve: Float32Array | null = null;
    public oversample: string = 'none';
  }

  class MockPannerNode extends MockAudioNode {
    public panningModel: string = 'equalpower';
    public distanceModel: string = 'inverse';
    public refDistance: number = 1;
    public maxDistance: number = 10000;
    public rolloffFactor: number = 1;
    public coneInnerAngle: number = 360;
    public coneOuterAngle: number = 360;
    public coneOuterGain: number = 0;
    public positionX: any = new MockAudioParam();
    public positionY: any = new MockAudioParam();
    public positionZ: any = new MockAudioParam();
    public orientationX: any = new MockAudioParam();
    public orientationY: any = new MockAudioParam();
    public orientationZ: any = new MockAudioParam();
  }

  class MockStereoPannerNode extends MockAudioNode {
    public pan: any = new MockAudioParam();
  }

  class MockAudioBufferSourceNode extends MockAudioNode {
    public buffer: any = null;
    public playbackRate: any = new MockAudioParam();
    public detune: any = new MockAudioParam();
    public loop: boolean = false;
    public loopStart: number = 0;
    public loopEnd: number = 0;

    constructor() {
      super();
      this.playbackRate.value = 1;
    }

    start(when?: number, offset?: number, duration?: number): void {}
    stop(when?: number): void {}
  }

  class MockMediaElementAudioSourceNode extends MockAudioNode {
    public mediaElement: any;
  }

  class MockMediaStreamAudioSourceNode extends MockAudioNode {
    public mediaStream: any;
  }

  class MockAudioBuffer {
    public sampleRate: number;
    public length: number;
    public duration: number;
    public numberOfChannels: number;
    private _data: Float32Array[];

    constructor(numberOfChannels: number, length: number, sampleRate: number) {
      this.numberOfChannels = numberOfChannels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.duration = length / sampleRate;
      this._data = [];
      for (let i = 0; i < numberOfChannels; i++) {
        this._data.push(new Float32Array(length));
      }
    }

    getChannelData(channel: number): Float32Array {
      return this._data[channel] || new Float32Array(this.length);
    }

    copyFromChannel(destination: Float32Array, channelNumber: number, startInChannel?: number): void {}
    copyToChannel(source: Float32Array, channelNumber: number, startInChannel?: number): void {}
  }

  class MockPeriodicWave {}

  // Inject mocks into global scope
  g.AudioContext = MockAudioContext;
  g.webkitAudioContext = MockAudioContext;
  g.AudioParam = MockAudioParam;
  g.AudioNode = MockAudioNode;
  g.AudioDestinationNode = MockAudioDestinationNode;
  g.AudioListener = MockAudioListener;
  g.OscillatorNode = MockOscillatorNode;
  g.GainNode = MockGainNode;
  g.DelayNode = MockDelayNode;
  g.BiquadFilterNode = MockBiquadFilterNode;
  g.DynamicsCompressorNode = MockDynamicsCompressorNode;
  g.AnalyserNode = MockAnalyserNode;
  g.ChannelMergerNode = MockChannelMergerNode;
  g.ChannelSplitterNode = MockChannelSplitterNode;
  g.ConvolverNode = MockConvolverNode;
  g.WaveShaperNode = MockWaveShaperNode;
  g.PannerNode = MockPannerNode;
  g.StereoPannerNode = MockStereoPannerNode;
  g.AudioBufferSourceNode = MockAudioBufferSourceNode;
  g.MediaElementAudioSourceNode = MockMediaElementAudioSourceNode;
  g.MediaStreamAudioSourceNode = MockMediaStreamAudioSourceNode;
  g.AudioBuffer = MockAudioBuffer;
  g.PeriodicWave = MockPeriodicWave;

  console.log('[WebAudioMock] Web Audio API mocks initialized successfully');
}

/**
 * Check if we're running in preview mode
 */
export function isPreviewMode(): boolean {
  return process.env.PREVIEW_MODE === '1';
}

/**
 * Auto-initialize mocks if in preview mode
 * This runs when the module is imported
 */
if (isPreviewMode()) {
  initWebAudioMocks();
}
