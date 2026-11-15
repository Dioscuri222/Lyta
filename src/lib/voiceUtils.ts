export function isBrowserSttSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function isBrowserTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopAllAudio(): void {
  if (isBrowserTtsSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function speakWithBrowserTts(
  text: string,
  lang: 'id' | 'en',
  rate: number,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  if (!isBrowserTtsSupported()) return false;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_`#]/g, '').trim();
  if (!clean) return false;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang === 'id' ? 'id-ID' : 'en-US';
  utterance.rate = Math.max(0.7, Math.min(1.5, rate));
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
  return true;
}

export interface SttSession {
  stop: () => void;
}

export function startBrowserStt(params: {
  lang: 'id' | 'en';
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (msg: string) => void;
  onEnd: () => void;
}): SttSession | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    webkitSpeechRecognition?: new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
      onerror: ((ev: { error: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
  };

  const RecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!RecognitionCtor) return null;

  const recognition = new RecognitionCtor();
  recognition.lang = params.lang === 'id' ? 'id-ID' : 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let transcript = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      transcript += result[0].transcript;
      if (result.isFinal) isFinal = true;
    }
    params.onTranscript(transcript.trim(), isFinal);
  };

  recognition.onerror = (event) => {
    params.onError(
      event.error === 'not-allowed'
        ? 'Izin mikrofon ditolak oleh browser.'
        : `Pengenalan suara berhenti (${event.error}).`
    );
  };

  recognition.onend = () => {
    params.onEnd();
  };

  recognition.start();
  return {
    stop: () => recognition.stop(),
  };
}
