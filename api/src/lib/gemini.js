/**
 * A minimal Google Gemini client — plain fetch, no SDK, one method.
 *
 * WHY STRUCTURED OUTPUT
 * The guide is rendered as UI (round list, tips, citations), not pasted as a
 * blob of text. Asking the model for JSON matching a schema (responseSchema)
 * means the response either parses into exactly that shape or fails loudly —
 * the frontend never has to scrape markdown.
 *
 * WHY A MODEL LIST
 * Free-tier models are regularly overloaded (503) or rate limited (429). Each
 * is tried in turn; only those transient failures move on, since a bad
 * request would fail identically everywhere.
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 25_000;

export class LlmError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export function createGemini({ apiKey, models, fetchImpl = fetch }) {
  if (!apiKey) return null;

  async function call(model, { system, prompt, schema }) {
    const res = await fetchImpl(`${BASE_URL}/models/${model}:generateContent`, {
      method: 'POST',
      // The key travels in a header, never the URL, so it cannot reach a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new LlmError(res.status, body.error?.message ?? `Gemini failed (${res.status})`);
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new LlmError(502, 'Gemini returned malformed JSON');
    }
  }

  return {
    /** Returns { data, model }: the parsed JSON and the model that wrote it. */
    async generateJson(request) {
      let lastError;
      for (const model of models) {
        try {
          return { data: await call(model, request), model };
        } catch (err) {
          const transient = err.name === 'TimeoutError' || err.status === 429 || err.status >= 500;
          if (!transient) throw err;
          lastError = err;
        }
      }
      throw lastError;
    },
  };
}
