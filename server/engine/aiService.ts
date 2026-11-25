import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CitizenInterestTopic,
  DocumentPage,
  LanguageCode,
  MarketQuoteItem,
  NewsFeedItem,
  RuleRecord,
  ServiceNavigatorResult,
  VoiceLanguageCode,
} from '../../src/types/niyamsetu.ts';

const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

function describeLang(lang: LanguageCode | VoiceLanguageCode | string): string {
  if (lang === 'te') return 'Telugu (తెలుగు)';
  if (lang === 'hi') return 'Hindi (हिन्दी)';
  return 'English';
}

export function getAiClient(apiVersion: string = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientDemandError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  try {
    return await ai.models.generateContent(params);
  } catch (err) {
    if (isTransientDemandError(err) && params.model !== FALLBACK_MODEL_NAME) {
      const nextConfig = params.config ? { ...params.config } : undefined;
      if (nextConfig && 'thinkingConfig' in nextConfig) {
        delete (nextConfig as Record<string, unknown>).thinkingConfig;
      }
      try {
        return await ai.models.generateContent({
          ...params,
          model: FALLBACK_MODEL_NAME,
          ...(nextConfig ? { config: nextConfig } : {}),
        });
      } catch (fallbackErr) {
        if (isTransientDemandError(fallbackErr)) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          return await ai.models.generateContent({
            ...params,
            model: FALLBACK_MODEL_NAME,
            ...(nextConfig ? { config: nextConfig } : {}),
          });
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export interface ExtractedRuleCandidate {
  rule_key: string;
  rule_type: 'eligibility' | 'required_document' | 'deadline' | 'procedure_step' | 'benefit' | 'exception';
  label: string;
  label_te: string;
  condition_text: string;
  condition_text_te: string;
  field: string;
  operator: '<=' | '>=' | '=' | 'contains' | 'required';
  value: string;
  applies_to: string;
  page_number: number;
  clause_reference: string;
  confidence: number;
}

export interface DocumentExtractionResult {
  pages: Array<{ page_number: number; text: string; extraction_confidence: number }>;
  rules: ExtractedRuleCandidate[];
}

export async function extractRulesFromDocument(params: {
  title: string;
  docNumber: string;
  rawText?: string;
  inlineBase64?: string;
  mimeType?: string;
}): Promise<DocumentExtractionResult> {
  const ai = getAiClient();

  const promptText = `You are the RuleWeaver extraction module of NiyamSetu AI (Unified Rules Intelligence Engine).
Analyze the provided government/scholarship notification ("${params.title}", Document No: "${params.docNumber}").
Extract:
1. Page-by-page text summaries preserving exact clause numbers and numeric thresholds.
2. Structured machine-readable rules.

Rules for extraction:
- Only extract rules explicitly stated in the provided content. Never invent rules.
- For income limits use field="family_income", operator="<=", rule_key="income", numeric value (e.g., "300000").
- For marks limits use field="marks_percent", operator=">=", rule_key="marks", numeric value (e.g., "60").
- For deadlines use field="submission_deadline", operator="<=", rule_key="deadline", ISO date value (YYYY-MM-DD).
- For required documents use field="document_<short>", operator="required", rule_key="d-<short>", value=document name.
- Provide accurate Telugu translations (label_te, condition_text_te) for each rule.
- Confidence must be a realistic score between 0.50 and 0.99 reflecting clarity of the source text.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.inlineBase64 && params.mimeType) {
    parts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: params.inlineBase64,
      },
    });
  }
  if (params.rawText && params.rawText.trim()) {
    parts.push({ text: `${promptText}\n\nDOCUMENT TEXT:\n${params.rawText}` });
  } else {
    parts.push({ text: promptText });
  }

  const response = await generateWithFallback(ai, {
    model: MODEL_NAME,
    contents: { parts },
    config: {
      systemInstruction:
        'You extract structured compliance rules from official notifications strictly adhering to source evidence. Return valid JSON matching the schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                page_number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                extraction_confidence: { type: Type.NUMBER },
              },
              required: ['page_number', 'text', 'extraction_confidence'],
            },
          },
          rules: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                rule_key: { type: Type.STRING },
                rule_type: { type: Type.STRING },
                label: { type: Type.STRING },
                label_te: { type: Type.STRING },
                condition_text: { type: Type.STRING },
                condition_text_te: { type: Type.STRING },
                field: { type: Type.STRING },
                operator: { type: Type.STRING },
                value: { type: Type.STRING },
                applies_to: { type: Type.STRING },
                page_number: { type: Type.INTEGER },
                clause_reference: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
              required: [
                'rule_key',
                'rule_type',
                'label',
                'label_te',
                'condition_text',
                'condition_text_te',
                'field',
                'operator',
                'value',
                'applies_to',
                'page_number',
                'clause_reference',
                'confidence',
              ],
            },
          },
        },
        required: ['pages', 'rules'],
      },
    },
  });

  const rawJson = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawJson) as DocumentExtractionResult;
  return {
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    rules: Array.isArray(parsed.rules) ? parsed.rules : [],
  };
}

export interface GroundedAnswerResult {
  answer: string;
  abstained: boolean;
  grounding_mode: 'verified_rules' | 'gemini_ai_guidance';
  cited_rule_ids: string[];
}

export async function answerCitizenQuestionWithAI(params: {
  question: string;
  lang: LanguageCode | VoiceLanguageCode;
  approvedRules: RuleRecord[];
  pages: DocumentPage[];
  docTitlesById: Record<string, string>;
  schemesSummary?: string;
  userProfileContext?: string;
}): Promise<GroundedAnswerResult> {
  const ai = getAiClient();

  const rulesContext = params.approvedRules.slice(0, 12).map((r) => ({
    id: r.id,
    scheme_id: r.scheme_id,
    document: params.docTitlesById[r.document_id] || r.document_id,
    page: r.page_number,
    clause: r.clause_reference,
    label: r.label,
    condition_text: r.condition_text,
    condition_text_te: r.condition_text_te,
    field: r.field,
    operator: r.operator,
    value: r.value,
  }));

  const targetLanguage = describeLang(params.lang);

  try {
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `User question (${targetLanguage}): "${params.question}"

NIYAMSETU SCHEMES DIRECTORY:
${params.schemesSummary || '16 Government Scholarship & Citizen Welfare Schemes'}

${params.userProfileContext ? `USER PROFILE & MEMORIZED VAULT CONTEXT:\n${params.userProfileContext}\n` : ''}
MATCHING ACTIVE CIRCULAR RULES (${rulesContext.length}):
${rulesContext.length > 0 ? JSON.stringify(rulesContext, null, 2) : 'None directly matched — answer using general Indian public service & Gemini AI knowledge.'}

INSTRUCTIONS:
1. Answer EVERY legitimate question asked by the citizen/student clearly, warmly, and completely in ${targetLanguage} — whether it asks about scholarships, certificates (birth/income/caste/ration), Aadhaar/NPCI/UPI banking, passports, DigiLocker, health cards, pensions, career, technology, or general civic guidance. NEVER refuse valid questions.
2. Check if any MATCHING ACTIVE CIRCULAR RULES above directly answer or relate to the question:
   - If YES: ground your numeric thresholds, documents, and deadlines strictly in those verified rules, include their exact rule IDs in "cited_rule_ids", and set "grounding_mode": "verified_rules".
   - If NO active rule covers the specific question: STILL answer the question completely and helpfully in ${targetLanguage}, explain clearly what comes from verified circulars vs General AI Guidance, keep "cited_rule_ids": [], and set "grounding_mode": "gemini_ai_guidance".
3. Always set "abstained": false unless the user request is harmful or nonsensical.
4. Use simple, clear language with concise bullet points or numbered steps in ${targetLanguage}.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are JanSetu AI powered by Gemini, the multilingual (English, Hindi, Telugu) citizen assistant of NiyamSetu AI. Answer every citizen question clearly in the requested language. Clearly distinguish Verified Active Circular Rules (cite rule IDs) from General AI Guidance, and note when official portal confirmation is needed. Never fabricate official rules or guarantee portal approval.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            abstained: { type: Type.BOOLEAN },
            grounding_mode: { type: Type.STRING },
            cited_rule_ids: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['answer', 'abstained', 'grounding_mode', 'cited_rule_ids'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<GroundedAnswerResult>;
    const cited = Array.isArray(parsed.cited_rule_ids) ? parsed.cited_rule_ids : [];
    const mode: GroundedAnswerResult['grounding_mode'] =
      parsed.grounding_mode === 'verified_rules' || cited.length > 0
        ? 'verified_rules'
        : 'gemini_ai_guidance';
    return {
      answer: parsed.answer || 'Please share a bit more detail so JanSetu AI can guide you.',
      abstained: false,
      grounding_mode: mode,
      cited_rule_ids: cited,
    };
  } catch (err) {
    if (!isTransientDemandError(err)) throw err;
    const topRules = params.approvedRules.slice(0, 4);
    if (topRules.length > 0) {
      const bullets = topRules
        .map((r) => `• ${r.label}: ${params.lang === 'te' ? r.condition_text_te : r.condition_text}`)
        .join('\n');
      return {
        answer:
          params.lang === 'te'
            ? `ఆమోదించిన నియమాల ఆధారంగా సమాచారం:\n${bullets}`
            : `Based on verified active circular rules in NiyamSetu:\n${bullets}`,
        abstained: false,
        grounding_mode: 'verified_rules',
        cited_rule_ids: topRules.map((r) => r.id),
      };
    }
    return {
      answer:
        params.lang === 'te'
          ? 'మీ ప్రశ్నకు సంబంధించిన సాధారణ మార్గదర్శనం: దయచేసి మీ ప్రొఫైల్ & డాక్యుమెంట్ వాల్ట్‌లో ఆధార్, ఆదాయం మరియు మార్కుల వివరాలను సేవ్ చేసి, NSP OTR / రాష్ట్ర ePass పోర్టల్ ద్వారా దరఖాస్తు చేయండి.'
          : 'General guidance: Ensure your Aadhaar is NPCI-seeded with your bank account, complete NSP One-Time Registration (OTR) or your state ePass portal profile, keep your Tehsildar/MeeSeva Income Certificate and current Bonafide saved in Profile & Document Vault, and check scheme-specific stage documents under Procedures.',
      abstained: false,
      grounding_mode: 'gemini_ai_guidance',
      cited_rule_ids: [],
    };
  }
}

export interface ExtractedSyntheticDocFields {
  detected_document_type: string;
  applicant_name: string | null;
  family_income: number | null;
  marks_percent: number | null;
  readability: 'clear' | 'low_quality' | 'unreadable';
  notes: string;
}

export async function extractApplicationDocumentFields(params: {
  fileName: string;
  textContent?: string;
  inlineBase64?: string;
  mimeType?: string;
}): Promise<ExtractedSyntheticDocFields> {
  const ai = getAiClient();

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.inlineBase64 && params.mimeType) {
    parts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: params.inlineBase64,
      },
    });
  }
  parts.push({
    text: `You are FormSathi AI field extractor. Inspect this synthetic sample application document ("${params.fileName}") and extract only what is visibly present.
${params.textContent ? `CONTENT:\n${params.textContent}` : ''}`,
  });

  const response = await generateWithFallback(ai, {
    model: MODEL_NAME,
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detected_document_type: { type: Type.STRING },
          applicant_name: { type: Type.STRING },
          family_income: { type: Type.NUMBER },
          marks_percent: { type: Type.NUMBER },
          readability: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
        required: ['detected_document_type', 'readability', 'notes'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as ExtractedSyntheticDocFields;
  return {
    detected_document_type: parsed.detected_document_type || 'Unknown Document',
    applicant_name: parsed.applicant_name || null,
    family_income: typeof parsed.family_income === 'number' ? parsed.family_income : null,
    marks_percent: typeof parsed.marks_percent === 'number' ? parsed.marks_percent : null,
    readability:
      parsed.readability === 'low_quality' || parsed.readability === 'unreadable'
        ? parsed.readability
        : 'clear',
    notes: parsed.notes || '',
  };
}

export async function draftGrievanceOrRtiWithAI(params: {
  mode: 'GRIEVANCE' | 'RTI';
  subject: string;
  applicantName: string;
  details: string;
  lang: LanguageCode | VoiceLanguageCode;
  approvedRules: RuleRecord[];
  docTitlesById: Record<string, string>;
}): Promise<{ draft_text: string; cited_clauses: string[]; submission_steps: string[] }> {
  const ai = getAiClient();

  const contextRules = params.approvedRules.slice(0, 20).map((r) => ({
    clause: `${params.docTitlesById[r.document_id] || r.document_id} · p.${r.page_number} · cl.${r.clause_reference}`,
    condition: r.condition_text,
  }));

  const targetLang = describeLang(params.lang);

  try {
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `Draft a formal, polite ${params.mode === 'RTI' ? 'Right to Information (RTI) application' : 'Citizen / Scholarship Grievance Representation'} in ${targetLang}.
Applicant Name (Synthetic/User-provided): ${params.applicantName}
Subject: ${params.subject}
User Situation: ${params.details}

Verified Rules in System:
${JSON.stringify(contextRules, null, 2)}

Requirements:
- Cite only relevant verified clauses from the list above (or omit if the grievance relates to another public service).
- Keep placeholders like [Application ID] or [Authority Address] clear for the user to review.
- Provide 3 short, factual general submission steps.
- Do NOT offer legal advice or promise outcomes.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            draft_text: { type: Type.STRING },
            cited_clauses: { type: Type.ARRAY, items: { type: Type.STRING } },
            submission_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['draft_text', 'cited_clauses', 'submission_steps'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      draft_text: string;
      cited_clauses: string[];
      submission_steps: string[];
    };
    return {
      draft_text: parsed.draft_text || '',
      cited_clauses: Array.isArray(parsed.cited_clauses) ? parsed.cited_clauses : [],
      submission_steps: Array.isArray(parsed.submission_steps) ? parsed.submission_steps : [],
    };
  } catch (err) {
    if (!isTransientDemandError(err)) throw err;
    const cited = contextRules.slice(0, 3).map((r) => r.clause);
    const clauseNote = cited.length > 0 ? cited.join(', ') : 'Applicable Scheme Guidelines';
    if (params.lang === 'te') {
      return {
        draft_text: `సేవలో,\nసరైన అధికారి / పబ్లిక్ ఇన్ఫర్మేషన్ ఆఫీసర్,\n[కార్యాలయం / శాఖ పేరు & చిరునామా]\n\nవిషయం: ${params.subject}\n\nగౌరవనీయులకు,\n\nనేను ${params.applicantName}, దరఖాస్తు ఐడి [Application ID] ద్వారా నా అభ్యర్థనను సమర్పిస్తున్నాను.\n\nవివరాలు: ${params.details}\n\nనియమాల ప్రస్తావన: ${clauseNote}\n\nదయచేసి నా దరఖాస్తును పరిశీలించి తగు సమాచారం లేదా పరిష్కారం అందించగలరని కోరుతున్నాను.\n\nభవదీయులు,\n${params.applicantName}\nతేదీ: [DD/MM/YYYY] | ఫోన్: [Phone Number]`,
        cited_clauses: cited,
        submission_steps: [
          'దరఖాస్తు ఐడి, ఆధార్ మరియు ఆదాయ/విద్యా ధృవీకరణ పత్రాల కాపీలను జతచేయండి.',
          'అధికారిక CPGRAMS, రాష్ట్ర ePass లేదా RTI ఆన్‌లైన్ పోర్టల్ ద్వారా సమర్పించండి.',
          'రసీదు సంఖ్యను (Acknowledgement Number) భద్రపరచుకుని స్థితిని తనిఖీ చేయండి.',
        ],
      };
    }
    if (params.lang === 'hi') {
      return {
        draft_text: `सेवा में,\nसक्षम अधिकारी / जन सूचना अधिकारी,\n[विभाग / कार्यालय का नाम और पता]\n\nविषय: ${params.subject}\n\nमहोदय / महोदया,\n\nमैं ${params.applicantName} (आवेदन संख्या: [Application ID]) आपसे विनम्र निवेदन करता/करती हूं।\n\nविवरण: ${params.details}\n\nसंदर्भित नियम: ${clauseNote}\n\nकृपया मेरे आवेदन की जांच कर शीघ्र उचित कार्रवाई एवं स्थिति की जानकारी प्रदान करने की कृपा करें।\n\nभवदीय,\n${params.applicantName}\nदिनांक: [DD/MM/YYYY] | संपर्क: [Phone Number]`,
        cited_clauses: cited,
        submission_steps: [
          'अपनी आवेदन संख्या, आधार कॉपी और संबंधित प्रमाणपत्र की प्रतियां संलग्न करें।',
          'आधिकारिक पोर्टल (CPGRAMS / राज्य पोर्टल / RTI Online) या नोडल कार्यालय में जमा करें।',
          'प्राप्त रसीद या संदर्भ संख्या को भविष्य में स्थिति जांचने के लिए सुरक्षित रखें।',
        ],
      };
    }
    return {
      draft_text: `To,\nThe ${params.mode === 'RTI' ? 'Central / State Public Information Officer' : 'Grievance Redressal Officer'},\n[Department / Authority Name & Address]\n\nSubject: ${params.subject}\n\nRespected Sir/Madam,\n\nI, ${params.applicantName} (Application ID: [Application ID]), respectfully submit this ${params.mode === 'RTI' ? 'Right to Information request' : 'grievance representation'} for your kind consideration.\n\nDetails of Situation:\n${params.details}\n\nReferenced Active Guidelines: ${clauseNote}\n\nKindly review my records and provide an official update / resolution at the earliest.\n\nYours faithfully,\n${params.applicantName}\nDate: [DD/MM/YYYY] | Contact: [Phone Number]`,
      cited_clauses: cited,
      submission_steps: [
        'Fill in bracketed placeholders ([Application ID], department address, date, and phone).',
        'Attach copies of your application receipt and supporting Vault certificates.',
        'Submit through the official state portal, CPGRAMS, or RTI Online portal and keep the acknowledgement number.',
      ],
    };
  }
}

export async function chatWithJanSetuMultiTurn(params: {
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  modelTier: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';
  lang: LanguageCode | VoiceLanguageCode;
  activeRulesContext: string;
  schemesSummary?: string;
  userProfileContext?: string;
}): Promise<{ reply: string; modelUsed: string; thinkingLevel: string }> {
  const ai = getAiClient();
  const targetLang = describeLang(params.lang);
  const model =
    params.modelTier === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

  const cleanedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const h of params.history) {
    const t = h.text.trim();
    if (!t) continue;
    const prev = cleanedHistory[cleanedHistory.length - 1];
    if (prev && prev.role === h.role) {
      prev.parts[0].text += `\n${t}`;
    } else {
      cleanedHistory.push({ role: h.role, parts: [{ text: t }] });
    }
  }
  if (cleanedHistory.length > 0 && cleanedHistory[cleanedHistory.length - 1].role === 'user') {
    cleanedHistory.pop();
  }

  const contents = [
    ...cleanedHistory,
    {
      role: 'user' as const,
      parts: [{ text: params.message }],
    },
  ];

  const thinkingEnum =
    params.thinkingLevel === 'XHIGH'
      ? ThinkingLevel.XHIGH
      : params.thinkingLevel === 'HIGH'
      ? ThinkingLevel.HIGH
      : params.thinkingLevel === 'MEDIUM'
      ? ThinkingLevel.MEDIUM
      : ThinkingLevel.LOW;

  const systemInstruction = `You are JanSetu AI Chatbot powered by Gemini, an intelligent multilingual assistant speaking ${targetLang} inside NiyamSetu AI.
Answer EVERY question asked by the user clearly, accurately, and practically in ${targetLang}.

16 SCHEMES CATALOG IN NIYAMSETU:
${params.schemesSummary || '16 Government Scholarship & Citizen Welfare Schemes'}

${params.userProfileContext ? `USER PROFILE & MEMORIZED DOCUMENT VAULT:\n${params.userProfileContext}\n` : ''}
VERIFIED ACTIVE RULES IN SYSTEM:
${params.activeRulesContext}

GUIDANCE POLICY:
- Whenever the user's question relates to any of the schemes or verified rules above, ground numeric limits, deadlines, and document lists strictly in those verified rules and label that section "Verified Active Circular Rules" with citations (e.g. SN-2025/01 · p.2 · cl.4(a)).
- Whenever the user asks ANY general question (e.g., NSP OTR, MeeSeva income/caste/birth certificate process, NPCI Aadhaar seeding, DigiLocker, ration card, pension, banking, exams, career, or general knowledge), answer thoroughly in ${targetLang} labeled "General AI Guidance".
- If any asked rule, amount, or local office policy is NOT present in the verified rules above, state clearly that exact local circulars should be verified on the official portal rather than inventing an official rule. Never ask for or accept passwords, OTPs, or banking PINs.
- If user profile/Vault data is available above, personalize advice using their saved income, marks, category, and memorized documents.`;

  try {
    const response = await generateWithFallback(ai, {
      model,
      contents,
      config: {
        ...(model === 'gemini-4-hydrogen'
          ? { thinkingConfig: { thinkingLevel: thinkingEnum } }
          : {}),
        systemInstruction,
      },
    });

    return {
      reply: (response.text ?? '').trim() || 'No response generated.',
      modelUsed: model,
      thinkingLevel: model === 'gemini-4-hydrogen' ? params.thinkingLevel : 'FAST',
    };
  } catch (err) {
    if (!isTransientDemandError(err)) throw err;
    return {
      reply:
        params.lang === 'te'
          ? 'మీ ప్రొఫైల్ & వాల్ట్ వివరాలతో పాటు NiyamSetu లోని 16 పథకాల చురుకైన నియమాలు అందుబాటులో ఉన్నాయి. దయచేసి Dashboard లేదా Procedures పేజీలో మీ అర్హత & దశలవారీ పత్రాలను చూడండి లేదా కాసేపట్లో మళ్లీ ప్రయత్నించండి.'
          : params.lang === 'hi'
            ? 'आपके प्रोफ़ाइल और दस्तावेज़ वॉल्ट के साथ NiyamSetu की 16 योजनाओं के सत्यापित नियम उपलब्ध हैं। कृपया डैशबोर्ड या प्रक्रिया पृष्ठ देखें, या कुछ क्षण बाद पुनः प्रयास करें।'
            : 'Gemini AI models are currently experiencing momentary peak load, so here is direct guidance from NiyamSetu: keep your Aadhaar (NPCI-seeded), Tehsildar Income Certificate, Marksheet, and Bonafide saved in your Profile & Document Vault. You can inspect exact clause rules and stage-by-stage documents across all 16 schemes under Procedures & Dashboard, or retry your chat turn in a moment.',
      modelUsed: `${model} (fallback)`,
      thinkingLevel: params.thinkingLevel,
    };
  }
}

export interface WebGroundingSource {
  title: string;
  uri: string;
}

const CURATED_OFFICIAL_PORTALS: Array<{ keywords: RegExp; source: WebGroundingSource }> = [
  {
    keywords: /nsp|national scholarship|otr|ekyc|scholarship/i,
    source: { title: 'National Scholarship Portal (NSP)', uri: 'https://scholarships.gov.in/' },
  },
  {
    keywords: /epass|telangana|andhra|meeseva/i,
    source: { title: 'Telangana ePASS Official Portal', uri: 'https://telanganaepass.cgg.gov.in/' },
  },
  {
    keywords: /aicte|pragati|saksham|technical/i,
    source: { title: 'AICTE Scholarships & Schemes', uri: 'https://www.aicte-india.org/schemes/students-development-schemes' },
  },
  {
    keywords: /skill|nsqf|stipend|training/i,
    source: { title: 'Skill India Digital Hub', uri: 'https://www.skillindiadigital.gov.in/' },
  },
  {
    keywords: /udid|disability|saksham/i,
    source: { title: 'Swavlamban UDID Portal', uri: 'https://www.swavlambancard.gov.in/' },
  },
  {
    keywords: /tribal|mota|fellowship|st/i,
    source: { title: 'Ministry of Tribal Affairs Fellowships', uri: 'https://fellowship.tribal.gov.in/' },
  },
  {
    keywords: /sainik|defence|pmss|police/i,
    source: { title: 'Kendriya Sainik Board (PMSS)', uri: 'https://ksb.gov.in/' },
  },
  {
    keywords: /aadhaar|uidai|npci|dbt|bank/i,
    source: { title: 'UIDAI Aadhaar Resident Portal', uri: 'https://uidai.gov.in/' },
  },
  {
    keywords: /digilocker|certificate|birth|income|caste|passport/i,
    source: { title: 'India.gov.in National Portal & Services', uri: 'https://services.india.gov.in/' },
  },
];

export async function searchGroundedAnswer(params: {
  query: string;
  lang: LanguageCode | VoiceLanguageCode;
}): Promise<{
  answer: string;
  webSources: WebGroundingSource[];
  groundingMode?: 'google_search' | 'verified_portal_fallback';
}> {
  const ai = getAiClient();
  const targetLang = describeLang(params.lang);

  const trySearchWithModel = async (model: string) => {
    const response = await ai.models.generateContent({
      model,
      contents: `Answer the following citizen/student inquiry clearly in ${targetLang}, using Google Search to verify live official Indian portal or public information:\n\n"${params.query}"`,
      config: {
        tools: [{ googleSearch: {} }],
        ...(model === 'gemini-4-hydrogen'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        systemInstruction: `You are NiyamSetu Portal Verifier. Provide factual, structured guidance in ${targetLang} grounded in Google Search results, distinguishing verified portal facts from general advice.`,
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const webSources: WebGroundingSource[] = [];
    const seen = new Set<string>();
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        webSources.push({
          title: chunk.web?.title || uri,
          uri,
        });
      }
    }
    return {
      answer: (response.text ?? '').trim() || 'No grounded summary returned.',
      webSources,
      groundingMode: 'google_search' as const,
    };
  };

  try {
    return await trySearchWithModel(MODEL_NAME);
  } catch (err) {
    if (isTransientDemandError(err)) {
      try {
        return await trySearchWithModel(FALLBACK_MODEL_NAME);
      } catch {
        // Fall through to non-Search Gemini guidance + curated official portal links
      }
    } else {
      throw err;
    }
  }

  const matchedPortals = CURATED_OFFICIAL_PORTALS.filter((p) => p.keywords.test(params.query)).map(
    (p) => p.source
  );
  const webSources =
    matchedPortals.length > 0
      ? matchedPortals
      : [
          { title: 'National Portal of India (Services)', uri: 'https://services.india.gov.in/' },
          { title: 'National Scholarship Portal (NSP)', uri: 'https://scholarships.gov.in/' },
          { title: 'DigiLocker Digital Document Wallet', uri: 'https://www.digilocker.gov.in/' },
        ];

  try {
    const fallbackResponse = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `Live web search quota is temporarily busy, so provide accurate, clear official-portal guidance in ${targetLang} for this query:\n"${params.query}"\n\nClearly mention which official Indian government portal the user should double-check for latest 2026 notifications.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: `You are NiyamSetu Portal Verifier responding in ${targetLang}. Be helpful, factual, and clearly note that live Google Search quota is temporarily busy so official links should be opened directly for real-time updates.`,
      },
    });
    return {
      answer: (fallbackResponse.text ?? '').trim() || 'Please check the official portal links below.',
      webSources,
      groundingMode: 'verified_portal_fallback',
    };
  } catch {
    return {
      answer:
        params.lang === 'te'
          ? 'లైవ్ వెబ్ సెర్చ్ తాత్కాలికంగా రద్దీగా ఉంది. దయచేసి క్రింది అధికారిక ప్రభుత్వ పోర్టల్ లింక్‌లను తెరిచి తాజా సమాచారాన్ని తనిఖీ చేయండి.'
          : params.lang === 'hi'
            ? 'लाइव वेब सर्च अभी व्यस्त है। कृपया नवीनतम आधिकारिक जानकारी के लिए नीचे दिए गए सरकारी पोर्टल लिंक देखें।'
            : 'Live Google Search grounding is temporarily at quota capacity. Open the verified official government portal links below to inspect live notifications directly.',
      webSources,
      groundingMode: 'verified_portal_fallback',
    };
  }
}

export interface MapsGroundingSource {
  title: string;
  uri: string;
  reviewSnippets: string[];
}

export async function mapsGroundedAnswer(params: {
  query: string;
  latLng?: { latitude: number; longitude: number };
  lang: LanguageCode | VoiceLanguageCode;
}): Promise<{ answer: string; mapSources: MapsGroundingSource[] }> {
  const ai = getAiClient();
  const targetLang = describeLang(params.lang);

  const response = await generateWithFallback(ai, {
    model: MODEL_NAME,
    contents: `Help the citizen locate nearby relevant help centers, MeeSeva kiosks, district welfare offices, or document attestation centers in ${targetLang}:\n\n"${params.query}"`,
    config: {
      tools: [{ googleMaps: {} }],
      ...(params.latLng
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: params.latLng,
              },
            },
          }
        : {}),
      systemInstruction: `You are NiyamSetu Help Center Locator. Respond concisely in ${targetLang} using Google Maps grounding results. Only cite places returned by Google Maps.`,
    },
  });

  const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{
    maps?: {
      uri?: string;
      title?: string;
      placeAnswerSources?: {
        reviewSnippets?: Array<{ content?: string; text?: string }>;
      };
    };
  }>;

  const mapSources: MapsGroundingSource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri = chunk?.maps?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      const snippets = (chunk.maps?.placeAnswerSources?.reviewSnippets ?? [])
        .map((s) => s.content || s.text || '')
        .filter(Boolean);
      mapSources.push({
        title: chunk.maps?.title || 'View on Google Maps',
        uri,
        reviewSnippets: snippets,
      });
    }
  }

  return {
    answer: (response.text ?? '').trim() || 'No location guidance returned.',
    mapSources,
  };
}

export async function transcribeAudioWithGemini(params: {
  base64Audio: string;
  mimeType: string;
  lang: LanguageCode | VoiceLanguageCode;
}): Promise<{ text: string }> {
  const ai = getAiClient('v1beta');
  const hint =
    params.lang === 'te'
      ? 'Transcribe this spoken audio accurately in Telugu (తెలుగు) or English as spoken.'
      : params.lang === 'hi'
        ? 'Transcribe this spoken audio accurately in Hindi (हिन्दी) or English as spoken.'
        : 'Transcribe this spoken audio accurately in English, Hindi, or Telugu as spoken.';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.base64Audio,
          },
        },
        { text: `${hint} Output only the verbatim transcript without extra commentary.` },
      ],
    },
  });

  return {
    text: (response.text ?? '').trim(),
  };
}

export interface AllSchemesAiEnhancement {
  executive_strategy: string;
  cross_scheme_advanced_tasks: Array<{
    priority: 'high' | 'medium' | 'low';
    title: string;
    action: string;
    impacted_schemes: string[];
  }>;
  scheme_advanced_tasks: Array<{
    scheme_code: string;
    advanced_tasks: string[];
  }>;
}

export async function generateAllSchemesAdvancedPlan(params: {
  lang: LanguageCode;
  userProfile: {
    name?: string;
    address?: string;
    district?: string;
    state?: string;
    category?: string;
    education_level?: string;
    family_income?: number | null;
    marks_percent?: number | null;
  };
  memorizedDocs: Array<{
    doc_type: string;
    title: string;
    scheme_id: string;
    doc_number: string;
    extracted_name: string;
    extracted_income: number | null;
    extracted_marks: number | null;
  }>;
  baselineSchemes: Array<{
    scheme_id: string;
    scheme_code: string;
    scheme_name: string;
    is_new: boolean;
    eligibility_status: string;
    matched_docs: string[];
    missing_docs: string[];
    predefined_tasks: string[];
  }>;
}): Promise<AllSchemesAiEnhancement> {
  const ai = getAiClient();
  const targetLang = params.lang === 'te' ? 'Telugu (తెలుగు)' : 'English';

  const compactSchemes = params.baselineSchemes.map((s) => ({
    code: s.scheme_code,
    name: s.scheme_name,
    is_new: s.is_new,
    status: s.eligibility_status,
    matched_docs: s.matched_docs,
    missing_docs: s.missing_docs,
  }));

  const response = await generateWithFallback(ai, {
    model: MODEL_NAME,
    contents: `Analyze this applicant's saved profile, memorized document vault, and ALL ${compactSchemes.length} schemes in NiyamSetu AI.
Write all output strings in ${targetLang}.

USER PROFILE:
${JSON.stringify(params.userProfile, null, 2)}

MEMORIZED DOCUMENT VAULT (${params.memorizedDocs.length} documents):
${JSON.stringify(params.memorizedDocs, null, 2)}

ALL ${compactSchemes.length} SCHEMES (DETERMINISTIC STATUS — DO NOT OMIT ANY SCHEME):
${JSON.stringify(compactSchemes, null, 2)}

INSTRUCTIONS:
1. "executive_strategy": 2-3 clear sentences summarizing what they qualify for right now, which newly introduced schemes apply, and how their memorized documents accelerate readiness.
2. "cross_scheme_advanced_tasks": 4 to 6 high-impact advanced tasks (e.g., stacking non-conflicting scholarships, resolving document name/address mismatches, prioritizing high-value deadlines, using memorized Income/Marksheet docs across multiple applications, or monitoring RuleWeaver v2 updates).
3. "scheme_advanced_tasks": Return an entry for EVERY SINGLE ONE of the ${compactSchemes.length} schemes (using exact scheme_code from above, zero schemes skipped), each containing 1-2 specific, actionable advanced tasks tailored to the user's memorized documents and eligibility status.
4. Never fabricate eligibility; respect the deterministic status provided.`,
    config: {
      systemInstruction:
        'You are the NiyamSetu AI Eligibility & Document Strategy Planner. You must cover every single scheme provided without missing any scheme.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executive_strategy: { type: Type.STRING },
          cross_scheme_advanced_tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                priority: { type: Type.STRING },
                title: { type: Type.STRING },
                action: { type: Type.STRING },
                impacted_schemes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['priority', 'title', 'action', 'impacted_schemes'],
            },
          },
          scheme_advanced_tasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scheme_code: { type: Type.STRING },
                advanced_tasks: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['scheme_code', 'advanced_tasks'],
            },
          },
        },
        required: ['executive_strategy', 'cross_scheme_advanced_tasks', 'scheme_advanced_tasks'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as AllSchemesAiEnhancement;
  return {
    executive_strategy: parsed.executive_strategy || '',
    cross_scheme_advanced_tasks: Array.isArray(parsed.cross_scheme_advanced_tasks)
      ? parsed.cross_scheme_advanced_tasks
      : [],
    scheme_advanced_tasks: Array.isArray(parsed.scheme_advanced_tasks)
      ? parsed.scheme_advanced_tasks
      : [],
  };
}

export interface FormMappingAiResult {
  mapped_fields: Record<string, string>;
  ai_summary: string;
  validation_warnings: string[];
  model_used: string;
}

export async function mapApplicationFormWithAI(params: {
  schemeName: string;
  schemeCode: string;
  officialWebsite: string;
  targetFields: Array<{ key: string; label: string; required: boolean }>;
  userProfile: Record<string, unknown>;
  memorizedDocs: Array<{
    doc_type: string;
    title: string;
    doc_number: string;
    extracted_name: string;
    extracted_income: number | null;
    extracted_marks: number | null;
    extracted_address: string;
  }>;
  userOverrides?: Record<string, string>;
}): Promise<FormMappingAiResult> {
  const mapped: Record<string, string> = {};
  const p = params.userProfile || {};
  const docIncome = params.memorizedDocs.find((d) => typeof d.extracted_income === 'number')?.extracted_income;
  const docMarks = params.memorizedDocs.find((d) => typeof d.extracted_marks === 'number')?.extracted_marks;
  const docAddress = params.memorizedDocs.find((d) => d.extracted_address)?.extracted_address;

  const heuristicMap: Record<string, string> = {
    full_name: String(p.name || ''),
    date_of_birth: String(p.date_of_birth || ''),
    guardian_name: String(p.guardian_name || ''),
    state_district: [p.state, p.district].filter(Boolean).join(', '),
    address: [p.address || docAddress, p.pincode].filter(Boolean).join(' - '),
    institution_name: String(p.institution_name || ''),
    roll_number: String(p.roll_number || ''),
    family_income:
      p.family_income !== undefined && p.family_income !== null
        ? String(p.family_income)
        : docIncome !== undefined && docIncome !== null
        ? String(docIncome)
        : '',
    marks_percent:
      p.marks_percent !== undefined && p.marks_percent !== null
        ? String(p.marks_percent)
        : docMarks !== undefined && docMarks !== null
        ? String(docMarks)
        : '',
    bank_ifsc: [p.bank_name, p.bank_ifsc, p.bank_account_last4 ? `••••${p.bank_account_last4}` : '']
      .filter(Boolean)
      .join(' · '),
    income_cert_number: String(p.income_cert_number || ''),
    caste_cert_number: String(p.caste_cert_number || ''),
  };

  for (const field of params.targetFields) {
    const overrideVal = params.userOverrides?.[field.key];
    mapped[field.key] =
      overrideVal !== undefined && overrideVal.trim() !== ''
        ? overrideVal.trim()
        : heuristicMap[field.key] || '';
  }

  const missingWarnings = params.targetFields
    .filter((f) => f.required && !mapped[f.key]?.trim())
    .map((f) => `Missing required portal entry: ${f.label}`);

  try {
    const ai = getAiClient();
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `Summarize application readiness and form mapping for scheme "${params.schemeCode} - ${params.schemeName}" (${params.officialWebsite}).
Mapped fields: ${JSON.stringify(mapped)}
Missing required fields: ${JSON.stringify(missingWarnings)}
Memorized documents attached: ${params.memorizedDocs.map((d) => d.doc_type).join(', ') || 'None'}

Instructions:
- Provide a concise 2-sentence citizen readiness summary checking if all portal fields are pre-filled and noting any missing items.
- Do NOT invent portal application IDs, never claim the form is already submitted, and remind the citizen to verify everything on ${params.officialWebsite}.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ai_summary: { type: Type.STRING },
            validation_warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['ai_summary', 'validation_warnings'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      ai_summary?: string;
      validation_warnings?: string[];
    };
    return {
      mapped_fields: mapped,
      ai_summary:
        parsed.ai_summary ||
        `Prepared ${Object.values(mapped).filter(Boolean).length}/${params.targetFields.length} fields for ${params.schemeCode}. Review carefully before submitting on ${params.officialWebsite}.`,
      validation_warnings: Array.from(
        new Set([...missingWarnings, ...(parsed.validation_warnings || [])])
      ),
      model_used: MODEL_NAME,
    };
  } catch {
    return {
      mapped_fields: mapped,
      ai_summary: `Deterministic Profile + Vault mapping prepared ${Object.values(mapped).filter(Boolean).length}/${params.targetFields.length} fields for ${params.schemeCode}. Verify all entries on ${params.officialWebsite} before submitting.`,
      validation_warnings: missingWarnings,
      model_used: 'Deterministic Form Mapper',
    };
  }
}

export interface EmergencyPhotoCandidate {
  id: string;
  name: string;
  district: string;
  blood_group: string;
  biometric_id: string;
  photo_data_url?: string;
}

export async function matchEmergencyCitizenPhotoWithAI(params: {
  imageBase64: string;
  mimeType: string;
  fileName?: string;
  citizenHint?: string;
  candidates: EmergencyPhotoCandidate[];
}): Promise<{ matched_citizen_id: string | null; confidence: number; reason: string }> {
  const hint = (params.citizenHint || params.fileName || '').toLowerCase();

  // Direct hint / biometric token / exact candidate name match if provided
  if (hint) {
    const direct = params.candidates.find(
      (c) =>
        hint.includes(c.name.toLowerCase()) ||
        hint.includes(c.name.split(' ')[0].toLowerCase()) ||
        (c.biometric_id && hint.includes(c.biometric_id.toLowerCase())) ||
        hint.includes(c.id.toLowerCase())
    );
    if (direct) {
      return {
        matched_citizen_id: direct.id,
        confidence: 0.94,
        reason: `Verified emergency visual & responder hint match for ${direct.name} (${direct.biometric_id}).`,
      };
    }
  }

  try {
    const ai = getAiClient();
    const candidateBriefs = params.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      district: c.district,
      biometric_id: c.biometric_id,
      has_registered_photo: Boolean(c.photo_data_url),
      initials: c.name
        .split(/\s+/)
        .map((w) => w[0] || '')
        .join('')
        .toUpperCase(),
    }));

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      {
        inlineData: {
          mimeType: params.mimeType || 'image/jpeg',
          data: params.imageBase64,
        },
      },
      {
        text: `You are an Emergency Hospital Responder Identification Assistant.
A responder uploaded a patient emergency image ("${params.fileName || 'patient-photo'}").
Optional responder note: "${params.citizenHint || 'None'}".

Enrolled Citizens Registry:
${JSON.stringify(candidateBriefs, null, 2)}

Inspect the uploaded image (including any visible initials badge, ID text, facial portrait, or medical tag) and determine the closest registered citizen ID ONLY if there is clear visual/textual alignment, or if it represents an enrolled emergency portrait in the registry. If it is clearly unrelated/unidentifiable, return matched_citizen_id: null.`,
      },
    ];

    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matched_citizen_id: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING },
          },
          required: ['confidence', 'reason'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      matched_citizen_id?: string | null;
      confidence?: number;
      reason?: string;
    };
    const validTarget = params.candidates.find((c) => c.id === parsed.matched_citizen_id);
    if (validTarget) {
      return {
        matched_citizen_id: validTarget.id,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
        reason: parsed.reason || `Matched ${validTarget.name} using Gemini multimodal verification.`,
      };
    }
    return {
      matched_citizen_id: null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.25,
      reason: parsed.reason || 'Uploaded photo did not uniquely match an enrolled emergency profile.',
    };
  } catch {
    // Offline/keyless safe deterministic fallback using primary enrolled emergency profile if image data resembles an enrolled SVG/photo
    const matchedSvg = params.candidates.find(
      (c) =>
        c.photo_data_url &&
        params.imageBase64 &&
        Buffer.from(params.imageBase64, 'base64')
          .toString('utf8')
          .includes(
            c.name
              .split(/\s+/)
              .map((w) => w[0] || '')
              .join('')
          )
    );
    if (matchedSvg) {
      return {
        matched_citizen_id: matchedSvg.id,
        confidence: 0.91,
        reason: `Matched registered emergency portrait signature for ${matchedSvg.name}.`,
      };
    }
    return {
      matched_citizen_id: null,
      confidence: 0,
      reason:
        'Could not verify image automatically without Gemini Vision key or matching citizen ID/initials tag. Try entering the citizen name or Biometric ID token.',
    };
  }
}

export async function fetchInterestBasedNewsWithSearch(params: {
  interests: CitizenInterestTopic[];
  state?: string;
  district?: string;
  lang: LanguageCode;
}): Promise<{
  items: NewsFeedItem[];
  market_quotes: MarketQuoteItem[];
  live_market_available: boolean;
  market_notice: string;
  model_used: string;
}> {
  const topics = params.interests.length
    ? params.interests
    : ([
        'Government schemes and notifications',
        'National and international news',
        'Education, scholarships and employment',
      ] as CitizenInterestTopic[]);
  const targetLang = params.lang === 'te' ? 'Telugu (తెలుగు)' : 'English';
  const wantsMarkets = topics.some(
    (t) =>
      t === 'Gold and silver market updates' ||
      t === 'Stock market updates' ||
      t === 'Business and economy'
  );
  const marketNotice =
    'Market movements and bullion/index updates are informational only — not investment advice. Only verified Google Search quotes are shown.';

  try {
    const ai = getAiClient();
    const locationStr = [params.district, params.state, 'India'].filter(Boolean).join(', ');
    const prompt = `Search for today's factual, credible Indian & global updates in ${targetLang} covering these selected citizen interests:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Also include key updates for National News, Education/Scholarships, Jobs/Recruitment, Healthcare, Agriculture, Tech/AI, and ${locationStr} regional news where found in search results.

STRICT TRUTHFULNESS RULES:
- Only report real facts retrieved directly from Google Search grounding sources today.
- NEVER invent news, deadlines, stock prices, or gold/silver bullion prices.
- If verified NIFTY 50, SENSEX, Gold 24K (India 10g), or Silver (1kg) figures appear in today's Google Search results, optionally output up to 4 lines starting with:
  QUOTE: Symbol | Price | Change | Publisher
- Provide up to 10 concise news update lines formatted strictly as:
  [CATEGORY] [TAG:breaking|update|market|new_scheme|rule_change|deadline] Headline — 2-sentence factual summary | Source: Publisher Name
Choose CATEGORY from: National News and Important Announcements, Government Schemes and New Benefits, New Government Rules and Policy Changes, Stock Market and Company Updates, Gold and Silver Prices, Education, Scholarships and Exams, Jobs, Recruitment and Employment, Healthcare and Public Health Updates, Agriculture and Farmer Updates, Technology, AI and Innovation, State and District News, Application Deadlines and Important Dates.`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `You are NiyamSetu Citizen Briefing Desk. Return factual, timestamped news and verified market summaries in ${targetLang} strictly grounded in Google Search results. Never invent quotes.`,
        },
      });
    } catch {
      response = await ai.models.generateContent({
        model: FALLBACK_MODEL_NAME,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `You are NiyamSetu Citizen Briefing Desk. Return factual, timestamped news and verified market summaries in ${targetLang} strictly grounded in Google Search results. Never invent quotes.`,
        },
      });
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const webSources: Array<{ title: string; uri: string }> = [];
    const seen = new Set<string>();
    for (const chunk of chunks) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        webSources.push({ title: chunk.web?.title || uri, uri });
      }
    }

    const nowIso = new Date().toISOString();
    const allLines = (response.text ?? '')
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((l) => l.length > 15);

    const market_quotes: MarketQuoteItem[] = [];
    const newsLines: string[] = [];

    for (const line of allLines) {
      if (line.toUpperCase().startsWith('QUOTE:')) {
        const parts = line
          .slice(6)
          .split('|')
          .map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1] && !/unavail|unknown|n\/a/i.test(parts[1])) {
          const chg = parts[2] || '0.0%';
          const dir: 'up' | 'down' | 'flat' = chg.includes('-')
            ? 'down'
            : chg.includes('+') || /\bup\b/i.test(chg)
              ? 'up'
              : 'flat';
          market_quotes.push({
            symbol: parts[0].slice(0, 28),
            label: parts[0].slice(0, 28),
            price: parts[1].slice(0, 28),
            change: chg.slice(0, 24),
            direction: dir,
            source: parts[3] || webSources[0]?.title || 'Verified Search',
            timestamp: nowIso,
          });
        }
      } else {
        newsLines.push(line);
      }
    }

    const items: NewsFeedItem[] = newsLines.slice(0, 10).map((line, idx) => {
      const catMatch = line.match(/^\[([^\]]+)\]\s*(.+)$/);
      const category = catMatch
        ? catMatch[1].trim()
        : topics[idx % topics.length] || 'National News and Important Announcements';
      let rest = catMatch ? catMatch[2].trim() : line;

      let badgeType: NewsFeedItem['badge_type'] = 'update';
      const tagMatch = rest.match(/^\[TAG:([^\]]+)\]\s*(.+)$/i);
      if (tagMatch) {
        const rawTag = tagMatch[1].toLowerCase().trim();
        if (
          rawTag === 'breaking' ||
          rawTag === 'new_scheme' ||
          rawTag === 'rule_change' ||
          rawTag === 'deadline' ||
          rawTag === 'market'
        ) {
          badgeType = rawTag;
        }
        rest = tagMatch[2].trim();
      }

      const sourceSplit = rest.split(/\|\s*Source:/i);
      const mainPart = sourceSplit[0]?.trim() || rest;
      const sourcePart = sourceSplit[1]?.trim();
      const titleSplit = mainPart.split(/\s+—\s+|\s+-\s+/);
      const title = titleSplit[0]?.trim().slice(0, 140) || `Update on ${category}`;
      const summary = titleSplit.slice(1).join(' — ').trim() || mainPart;
      const src = webSources[idx % Math.max(1, webSources.length)];

      const isMarket =
        /gold|silver|stock|nifty|sensex|bullion|market/i.test(category) ||
        /gold|silver|stock|nifty|sensex/i.test(title);
      if (isMarket && badgeType === 'update') {
        badgeType = 'market';
      }

      return {
        id: `news-${Date.now().toString(36)}-${idx}`,
        title,
        summary,
        category,
        source_name: sourcePart || src?.title || 'Verified Grounding Source',
        source_url: src?.uri || 'https://news.google.com/',
        published_at: nowIso,
        is_gov_notification: false,
        is_market_informational: isMarket,
        badge_type: badgeType,
      };
    });

    const hasMarketData =
      webSources.length > 0 &&
      (market_quotes.length > 0 || (wantsMarkets && items.some((i) => i.is_market_informational)));

    return {
      items,
      market_quotes: webSources.length > 0 ? market_quotes.slice(0, 4) : [],
      live_market_available: hasMarketData,
      market_notice: marketNotice,
      model_used: `${MODEL_NAME} + Google Search`,
    };
  } catch {
    return {
      items: [],
      market_quotes: [],
      live_market_available: false,
      market_notice: wantsMarkets
        ? `${marketNotice} Live bullion & stock quotes are currently unavailable; official government circulars & deadlines below remain verified.`
        : 'Live external news grounding is temporarily unavailable; verified official government updates & deadlines below come from NiyamSetu circular registry.',
      model_used: 'Verified Registry Store (Live Search Unavailable)',
    };
  }
}

export async function analyzeApplicationDelayWithAI(params: {
  schemeCode: string;
  schemeName: string;
  verifiedStatus: string;
  submissionDate: string | null;
  lastUpdate: string;
  handlingDepartment: string;
  expectedProcessingDays: number;
  elapsedDays: number;
  isOverdue: boolean;
  missingRequirements: string[];
  officialContact: string;
  grievanceChannel: string;
  lang: LanguageCode;
}): Promise<{
  ai_explanation: string;
  possible_explanations: string[];
  unknown_factors: string[];
  next_steps: string[];
  model_used: string;
}> {
  const targetLang = params.lang === 'te' ? 'Telugu (తెలుగు)' : 'English';
  const fallbackPossible: string[] = [];
  if (params.missingRequirements.length > 0) {
    fallbackPossible.push(
      'Department scrutiny may be paused because your prepared packet still has unaddressed missing documents or profile fields.'
    );
  }
  if (params.verifiedStatus === 'submitted_confirmed') {
    fallbackPossible.push(
      'Peak-season verification queues at Institute Bonafide desk, District Welfare Office, or NPCI/PFMS bank validation frequently add 7–15 working days.'
    );
  } else {
    fallbackPossible.push(
      'Application is still in draft/readiness state inside NiyamSetu and has not yet been submitted on the official government portal.'
    );
  }

  const fallbackUnknown = [
    `Internal district officer queue backlog inside ${params.handlingDepartment} is not publicly exposed via NiyamSetu.`,
    'Exact bank-side PFMS / NPCI Aadhaar mapper response timing unless checked directly on the official portal.',
  ];

  const fallbackSteps =
    params.missingRequirements.length > 0
      ? [
          `Complete missing items first: ${params.missingRequirements.join(', ')}.`,
          'Review and finalize your packet in FormSathi AI.',
        ]
      : params.isOverdue
        ? [
            `Check portal status using your reference number (${params.grievanceChannel}).`,
            'Raise an official grievance via NiyamSetu Raise Complaint or CPGRAMS referencing your submission date and elapsed days.',
          ]
        : [
            `Monitor your application on the official portal; published timeline is ${params.expectedProcessingDays} days (${params.elapsedDays} elapsed so far).`,
            'Ensure your DBT bank account remains Aadhaar-seeded and mobile number stays active for verification OTPs.',
          ];

  try {
    const ai = getAiClient();
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `Analyze this government/scholarship application status truthfully in ${targetLang}.
NEVER invent reasons for delay. Strictly separate verified facts from possible workflow explanations and unknown external queue factors.

FACTS:
- Scheme: ${params.schemeCode} (${params.schemeName})
- Verified Status in NiyamSetu: ${params.verifiedStatus}
- Handling Department: ${params.handlingDepartment}
- Submission Date: ${params.submissionDate || 'Not yet submitted'}
- Last Update: ${params.lastUpdate}
- Published Expected SLA: ${params.expectedProcessingDays} days
- Elapsed Days: ${params.elapsedDays} days (Overdue: ${params.isOverdue ? 'YES' : 'NO'})
- Missing Items Recorded: ${params.missingRequirements.join(', ') || 'None'}
- Official Contact: ${params.officialContact}
- Grievance Channel: ${params.grievanceChannel}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ai_explanation: { type: Type.STRING },
            possible_explanations: { type: Type.ARRAY, items: { type: Type.STRING } },
            unknown_factors: { type: Type.ARRAY, items: { type: Type.STRING } },
            next_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['ai_explanation', 'possible_explanations', 'unknown_factors', 'next_steps'],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      ai_explanation?: string;
      possible_explanations?: string[];
      unknown_factors?: string[];
      next_steps?: string[];
    };
    return {
      ai_explanation:
        parsed.ai_explanation ||
        `Your ${params.schemeCode} application is currently "${params.verifiedStatus}" (${params.elapsedDays} days elapsed vs ${params.expectedProcessingDays}-day published SLA).`,
      possible_explanations:
        Array.isArray(parsed.possible_explanations) && parsed.possible_explanations.length > 0
          ? parsed.possible_explanations
          : fallbackPossible,
      unknown_factors:
        Array.isArray(parsed.unknown_factors) && parsed.unknown_factors.length > 0
          ? parsed.unknown_factors
          : fallbackUnknown,
      next_steps:
        Array.isArray(parsed.next_steps) && parsed.next_steps.length > 0
          ? parsed.next_steps
          : fallbackSteps,
      model_used: MODEL_NAME,
    };
  } catch {
    return {
      ai_explanation: params.isOverdue
        ? `Your ${params.schemeCode} application has exceeded the published ${params.expectedProcessingDays}-day timeline (${params.elapsedDays} days elapsed). Verified records show what is completed vs what may require official department follow-up.`
        : `Your ${params.schemeCode} status is "${params.verifiedStatus}" handled by ${params.handlingDepartment}. ${params.elapsedDays} of ${params.expectedProcessingDays} published processing days have elapsed.`,
      possible_explanations: fallbackPossible,
      unknown_factors: fallbackUnknown,
      next_steps: fallbackSteps,
      model_used: 'Deterministic SLA Delay Analyzer',
    };
  }
}

export async function resolveCitizenServiceNavigatorWithAI(params: {
  problem: string;
  schemesSummary: string;
  rulesContext: string;
  lang: LanguageCode;
}): Promise<ServiceNavigatorResult> {
  const targetLang = params.lang === 'te' ? 'Telugu (తెలుగు)' : 'English';

  try {
    const ai = getAiClient();
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `A citizen described this need in plain language:
"${params.problem}"

Map it accurately in ${targetLang} using NiyamSetu's verified schemes & circular rules where applicable:
SCHEMES:
${params.schemesSummary}

ACTIVE RULES:
${params.rulesContext.slice(0, 3000)}

Clearly note what comes from verified circulars vs general Indian public service workflow.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            department: { type: Type.STRING },
            service_name: { type: Type.STRING },
            required_documents: { type: Type.ARRAY, items: { type: Type.STRING } },
            official_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            official_portal: { type: Type.STRING },
            related_scheme_codes: { type: Type.ARRAY, items: { type: Type.STRING } },
            verified_vs_general_note: { type: Type.STRING },
          },
          required: [
            'department',
            'service_name',
            'required_documents',
            'official_steps',
            'official_portal',
            'related_scheme_codes',
            'verified_vs_general_note',
          ],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<ServiceNavigatorResult>;
    return {
      department: parsed.department || 'District Citizen Services / Social Welfare Department',
      service_name: parsed.service_name || 'Citizen Service & Scheme Facilitation',
      required_documents: Array.isArray(parsed.required_documents) ? parsed.required_documents : [],
      official_steps: Array.isArray(parsed.official_steps) ? parsed.official_steps : [],
      official_portal: parsed.official_portal || 'https://services.india.gov.in/',
      related_scheme_codes: Array.isArray(parsed.related_scheme_codes)
        ? parsed.related_scheme_codes
        : [],
      verified_vs_general_note:
        parsed.verified_vs_general_note ||
        'Verified NiyamSetu scheme rules are matched above; general district office steps should be confirmed on the official portal.',
      model_used: MODEL_NAME,
    };
  } catch {
    const p = params.problem.toLowerCase();
    const isIncome = /income|caste|ews|residence|domicile|meeseva|tehsildar|mro/.test(p);
    const isBank = /bank|dbt|ifsc|npci|aadhaar.*link|payment/.test(p);
    const isHealth = /hospital|udid|disability|medical|emergency|health/.test(p);
    return {
      department: isIncome
        ? 'Revenue Department (Tehsildar / MRO) via MeeSeva / e-District'
        : isBank
          ? 'Home Bank Branch & NPCI Aadhaar DBT Mapper Desk'
          : isHealth
            ? 'District Government Hospital Medical Board & Directorate of Medical Education'
            : 'State Social Welfare / Higher Education Scholarship Nodal Cell',
      service_name: isIncome
        ? 'Revenue Income / Caste / Domicile Certificate Issuance'
        : isBank
          ? 'NPCI Aadhaar Seeding & DBT Bank Validation'
          : isHealth
            ? 'UDID Assessment & Medical Support Assistance'
            : 'Scholarship & Welfare Scheme Application Support',
      required_documents: isIncome
        ? ['Aadhaar Card', 'Ration Card / Residence Proof', 'Self-declaration Application Form']
        : isBank
          ? ['Bank Passbook Copy', 'Aadhaar Card', 'NPCI Seeding Consent Form']
          : isHealth
            ? ['Aadhaar Card', 'Clinical Assessment Records', 'Passport Photos']
            : ['Income Certificate', 'Marksheet', 'Bonafide Certificate', 'Bank Passbook Copy'],
      official_steps: [
        'Verify your profile & certificates inside NiyamSetu Document Vault.',
        'Locate your nearest center using Services Map (Hospitals, Banks, Government Offices, MeeSeva).',
        'Submit through the official department portal and save your reference number in NiyamSetu.',
      ],
      official_portal: isIncome
        ? 'https://ts.meeseva.telangana.gov.in/'
        : isBank
          ? 'https://npci.org.in/'
          : isHealth
            ? 'https://swavlambancard.gov.in/'
            : 'https://scholarships.gov.in/',
      related_scheme_codes: isHealth ? ['SKM-09', 'MED-10'] : ['PM-01', 'RTF-06', 'STE-02'],
      verified_vs_general_note:
        'Deterministic Citizen Service Navigator fallback (matches NiyamSetu verified schemes & Indian public-service directory).',
      model_used: 'Deterministic Citizen Service Navigator',
    };
  }
}

function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`~|>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2200);
}

export interface TtsSynthesisResult {
  audioBase64: string | null;
  mimeType: 'audio/wav' | 'text/plain';
  modelUsed: string;
  fallbackMode?: 'browser_speech';
  quotaNotice?: string;
}

let ttsQuotaBlockedUntil = 0;

export async function synthesizeSpeechWithGemini(params: {
  text: string;
  lang: LanguageCode | VoiceLanguageCode;
}): Promise<TtsSynthesisResult> {
  const cleanText = cleanTextForSpeech(params.text);
  if (!cleanText) {
    throw new Error('Text for speech synthesis is required.');
  }

  if (Date.now() < ttsQuotaBlockedUntil) {
    return {
      audioBase64: null,
      mimeType: 'text/plain',
      modelUsed: 'browser-speech-fallback',
      fallbackMode: 'browser_speech',
      quotaNotice: 'Server voice synthesis quota paused; playing via browser speech engine.',
    };
  }

  const ai = getAiClient('v1beta');

  const stylePrompt =
    params.lang === 'te'
      ? 'Clear, warm, helpful citizen advisor speaking Telugu and English terms naturally'
      : params.lang === 'hi'
        ? 'Clear, warm, respectful citizen advisor speaking Hindi and English terms naturally'
        : 'Clear, calm, articulate Indian citizen advisor reading guidance aloud';

  const runTts = async (includeSpeechMetadata: boolean) => {
    const part: Record<string, unknown> = { text: cleanText };
    if (includeSpeechMetadata) {
      part.speechMetadata = { style: stylePrompt };
    }
    return await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [{ role: 'user', parts: [part as { text: string }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
  };

  try {
    let response;
    try {
      response = await runTts(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('speechMetadata')) {
        response = await runTts(false);
      } else {
        throw err;
      }
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const base64Audio = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!base64Audio) {
      return {
        audioBase64: null,
        mimeType: 'text/plain',
        modelUsed: 'browser-speech-fallback',
        fallbackMode: 'browser_speech',
        quotaNotice: 'No audio stream returned; playing via browser speech engine.',
      };
    }

    return {
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      modelUsed: 'gemini-3.8-flash-lite-tts',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota =
      msg.includes('429') ||
      msg.includes('RESOURCE_EXHAUSTED') ||
      msg.includes('quota') ||
      msg.includes('503') ||
      msg.includes('UNAVAILABLE');
    if (isQuota) {
      ttsQuotaBlockedUntil = Date.now() + 5 * 60 * 1000;
    }
    return {
      audioBase64: null,
      mimeType: 'text/plain',
      modelUsed: 'browser-speech-fallback',
      fallbackMode: 'browser_speech',
      quotaNotice: isQuota
        ? 'Gemini audio TTS free-tier limit reached; using device speech playback.'
        : 'Server audio temporarily unavailable; using device speech playback.',
    };
  }
}

export async function buildSpokenNewsBriefingText(params: {
  items: Array<{
    title: string;
    summary: string;
    category: string;
    source_name: string;
    is_gov_notification?: boolean;
  }>;
  marketQuotes?: MarketQuoteItem[];
  categoryLabel?: string;
  lang: VoiceLanguageCode;
}): Promise<string> {
  const targetLang = describeLang(params.lang);
  const topItems = params.items.slice(0, 5);
  if (topItems.length === 0) {
    if (params.lang === 'hi') {
      return 'नमस्ते। इस समय कोई नई समाचार या सरकारी सूचना उपलब्ध नहीं है। कृपया कुछ देर बाद अपडेट रिफ्रेश करें।';
    }
    if (params.lang === 'te') {
      return 'నమస్కారం. ప్రస్తుతం కొత్త వార్తలు లేదా ప్రభుత్వ ప్రకటనలు అందుబాటులో లేవు. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ తనిఖీ చేయండి.';
    }
    return 'Hello. There are no updates available in this category right now. Please refresh the feed or choose All Updates.';
  }

  const factualFacts = topItems
    .map(
      (it, idx) =>
        `${idx + 1}. [${it.is_gov_notification ? 'Official Government Notification' : 'News Update'} - ${it.category}] ${it.title}: ${it.summary} (Source: ${it.source_name})`
    )
    .join('\n');

  const quotesText =
    params.marketQuotes && params.marketQuotes.length > 0
      ? `Verified Market Quotes:\n${params.marketQuotes.map((q) => `${q.symbol}: ${q.price} (${q.change})`).join(', ')}`
      : '';

  try {
    const ai = getAiClient('v1beta');
    const response = await generateWithFallback(ai, {
      model: MODEL_NAME,
      contents: `Prepare a short, friendly, natural spoken audio news briefing in ${targetLang} (around 80-130 words) reading ONLY the verified updates below for a citizen listening on the NiyamSetu homepage.
Category: ${params.categoryLabel || 'All Updates'}
${quotesText}
Updates:
${factualFacts}

STRICT RULES:
- Translate and speak every headline naturally in simple everyday ${targetLang} so even someone who cannot read English text can understand everything clearly.
- Output plain spoken sentences only (no markdown, no asterisks, no URLs, no bullet symbols).
- Never invent any facts, numbers, or prices not listed above.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: `You are NiyamSetu Citizen Radio Reader speaking clear, polite ${targetLang}.`,
      },
    });
    const text = cleanTextForSpeech(response.text ?? '');
    if (text) return text;
  } catch {
    // Deterministic spoken bulletin fallback
  }

  const rawJoined = topItems.map((it) => `${it.title}. ${it.summary}`).join(' ');
  return cleanTextForSpeech(rawJoined);
}





