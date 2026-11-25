import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { Modality, type LiveServerMessage } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { getAiClient } from './server/engine/aiService.ts';
import { apiRouter } from './server/routes/api.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer(): Promise<void> {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Mount NiyamSetu AI unified backend routes
  app.use('/api', apiRouter);

  // Real-Time Live Voice WebSocket Bridge (`gemini-3.8-live`)
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs, req) => {
    let closed = false;
    let liveSession: Awaited<ReturnType<ReturnType<typeof getAiClient>['live']['connect']>> | null =
      null;

    try {
      const url = new URL(req.url || '/live', `http://localhost:${PORT}`);
      const rawLang = url.searchParams.get('lang');
      const mode = url.searchParams.get('mode') === 'landing' ? 'landing' : 'portal';
      const langLabel =
        rawLang === 'te'
          ? 'Telugu (తెలుగు)'
          : rawLang === 'hi'
            ? 'Hindi (हिन्दी)'
            : 'English';

      const systemInstruction =
        mode === 'landing'
          ? `You are JanSetu Live Voice Advisor on the NiyamSetu AI homepage. Many listeners may be first-time smartphone users or unable to read complex forms, so always speak warmly, respectfully, slowly, and in simple everyday ${langLabel}. Answer ANY question they ask aloud — including government schemes, scholarships, pensions, ration cards, Aadhaar/bank linking, income/caste/birth certificates, health/emergency help, or today's news updates shown on the page. Keep answers practical and short (3-4 sentences per turn) unless asked for more steps, and gently remind them that official decisions depend on the relevant government portal.`
          : `You are JanSetu Live Voice Advisor in NiyamSetu AI, helping citizens and students understand Indian government schemes, scholarships, certificates (Income, Caste, Bonafide, Aadhaar NPCI bank seeding), deadlines, grievances, and everyday public services. Speak warmly, clearly, and concisely in ${langLabel}. Answer any legitimate question helpful to the user, clearly noting when official portal verification is needed.`;

      const connectLive = async (apiVersion: string) => {
        const ai = getAiClient(apiVersion);
        return await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              if (closed || clientWs.readyState !== 1) return;
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({ inputTranscript: content.inputTranscription.text })
                );
              }
              if (content?.outputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({ outputTranscript: content.outputTranscription.text })
                );
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
              }
              if (content?.interrupted) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
            },
            onerror: (err: unknown) => {
              const rawMsg =
                err instanceof Error
                  ? err.message
                  : typeof err === 'object' && err !== null && 'message' in err
                    ? String((err as { message?: unknown }).message)
                    : String(err || 'Live session error');
              console.error('Gemini Live session error:', rawMsg);
              if (!closed && clientWs.readyState === 1) {
                clientWs.send(JSON.stringify({ error: rawMsg || 'Live voice session encountered an error.' }));
              }
            },
            onclose: () => {
              if (!closed && clientWs.readyState === 1) {
                clientWs.close();
              }
            },
          },
        });
      };

      try {
        liveSession = await connectLive('v1beta');
      } catch (betaErr) {
        console.warn('Gemini Live v1beta connect failed, trying v1alpha:', betaErr);
        liveSession = await connectLive('v1alpha');
      }

      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not open Gemini Live session.';
      console.error('Live WebSocket initialization error:', msg);
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (data) => {
      if (closed || !liveSession) return;
      try {
        const parsed = JSON.parse(data.toString()) as {
          audio?: string;
          text?: string;
          context?: string;
        };
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({ text: parsed.text });
        } else if (parsed.context) {
          liveSession.sendRealtimeInput({ text: parsed.context });
        }
      } catch (err) {
        console.warn('Invalid Live WS frame:', err);
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close race
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NiyamSetu AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NiyamSetu AI server:', err);
  process.exit(1);
});
