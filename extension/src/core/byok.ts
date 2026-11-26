import { ByokOptions, ByokTranslationResult } from './types';

function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join('[REDACTED]');
}

function parseAssertionLines(rawText: string): string[] {
  const cleaned = rawText
    .replace(/^```[a-zA-Z]*\r?\n/, '')
    .replace(/\r?\n```$/, '')
    .trim();
  return cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('```'));
}

export async function translateScriptWithByok(
  scriptText: string,
  opts: ByokOptions
): Promise<ByokTranslationResult> {
  const apiKey = (opts.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('BYOK API key is required. ReqBridge never embeds or pays for AI keys.');
  }
  const cleanScript = (scriptText || '').trim();
  if (!cleanScript) {
    throw new Error('Input test script cannot be empty.');
  }

  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Math.max(500, opts.timeoutMs ?? 20000);
  const target = opts.target ?? 'http-assert';
  const systemPrompt =
    target === 'node-test'
      ? 'Convert the Postman/Bruno JS test script into concise Node.js assert statements, one per line, no markdown fences.'
      : 'Convert the Postman/Bruno JS test script into concise ReqBridge # @assert lines (e.g. # @assert status == 200), one per line, no markdown fences.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let rawOutput = '';
    let model = opts.model || (opts.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');

    if (opts.provider === 'gemini') {
      const base = (opts.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: cleanScript }] }],
          generationConfig: { temperature: 0 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(redactSecret(`Gemini API error HTTP ${res.status}: ${errBody}`, apiKey));
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      rawOutput = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
    } else {
      const base = (opts.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
      const url = `${base}/v1/chat/completions`;
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: cleanScript },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(redactSecret(`OpenAI-compatible API error HTTP ${res.status}: ${errBody}`, apiKey));
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (data.model) model = data.model;
      rawOutput = data.choices?.[0]?.message?.content || '';
    }

    const assertions = parseAssertionLines(rawOutput);
    return { assertions, rawOutput, model, provider: opts.provider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecret(msg, apiKey));
  } finally {
    clearTimeout(timer);
  }
}
