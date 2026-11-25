import React, { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type { VoiceLanguageCode } from '../../types/niyamsetu';

interface VoiceTranscribeButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
  langOverride?: VoiceLanguageCode;
}

export const VoiceTranscribeButton: React.FC<VoiceTranscribeButtonProps> = ({
  onTranscript,
  disabled,
  label = 'Dictate',
  langOverride,
}) => {
  const { lang, token } = useApp();
  const effectiveLang: VoiceLanguageCode = langOverride || lang;
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 256) return;
        setTranscribing(true);
        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = String(reader.result || '');
              const idx = res.indexOf(',');
              resolve(idx >= 0 ? res.slice(idx + 1) : res);
            };
            reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
            reader.readAsDataURL(blob);
          });

          const data = await apiRequest<{ text: string }>('/audio/transcribe', {
            method: 'POST',
            token,
            body: { base64Audio, mimeType, lang: effectiveLang },
          });
          if (data.text) {
            onTranscript(data.text);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Microphone access denied.');
      setRecording(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || transcribing}
        onClick={recording ? stopRecording : startRecording}
        title={recording ? 'Stop recording and transcribe' : 'Record voice using Gemini Transcribe'}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
          recording
            ? 'border-rose-500 bg-rose-600 text-white'
            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-700 dark:hover:border-cyan-400'
        } disabled:opacity-50`}
      >
        {transcribing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : recording ? (
          <Square className="w-3.5 h-3.5" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
        {label !== '' && (
          <span>
            {transcribing ? 'Transcribing...' : recording ? 'Stop & Transcribe' : label}
          </span>
        )}
      </button>
      {error && <span className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  );
};
