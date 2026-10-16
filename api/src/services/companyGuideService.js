/**
 * AI prep guides: one LLM-written summary of every published experience for
 * a company — the round pattern, what each round focuses on, and the tips
 * seniors repeat — so a junior reads one page instead of twenty posts.
 *
 * WHAT THE MODEL DOES AND DOES NOT DECIDE
 * Counts are facts, so they are computed here, never asked of the model:
 * how many experiences, the outcomes, and the most-asked topics (from the
 * `topic` field on each question, which exists for exactly this). The model
 * only writes what needs language: the overview, the per-round focus and the
 * tips. Every round and tip must cite the experiences it came from by number,
 * and numbers that don't exist are dropped, so each claim can be checked.
 *
 * Author identity never reaches the prompt: only the interview content is sent.
 */
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { notFound, aiUnavailable } from '../errors/AppError.js';
import { createGemini } from '../lib/gemini.js';
import { companyRepository } from '../repositories/companyRepository.js';
import { experienceRepository } from '../repositories/experienceRepository.js';
import { companyGuideRepository } from '../repositories/companyGuideRepository.js';

const TOP_TOPICS = 8;

const SYSTEM = `You write interview preparation guides for college students, from interview experiences shared by seniors.
Use ONLY the experiences provided. Never add outside knowledge about the company.
Each experience is numbered, e.g. [1]. Every round and tip must list the numbers of the experiences it is based on in "sources".
Be specific: name the kinds of questions, topics and formats that actually appeared. Plain text, no markdown.`;

// The JSON shape the model must return (Gemini responseSchema, an OpenAPI subset).
const GUIDE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overview: { type: 'STRING', description: '2-3 sentences: the overall process and what it rewards.' },
    rounds: {
      type: 'ARRAY',
      description: 'The typical rounds, in order.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          focus: { type: 'STRING', description: 'One or two sentences on what this round tests.' },
          sources: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['name', 'focus', 'sources'],
      },
    },
    tips: {
      type: 'ARRAY',
      description: 'Up to 5 concrete preparation tips.',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          sources: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['text', 'sources'],
      },
    },
  },
  required: ['overview', 'rounds', 'tips'],
};

export function buildPrompt(companyName, experiences) {
  const blocks = experiences.map((e, i) => {
    const rounds = e.rounds
      .map((r, j) => {
        const questions = r.questions
          .map((q) => `    - ${q.text}${q.topic ? ` (topic: ${q.topic})` : ''}`)
          .join('\n');
        return `  Round ${j + 1}: ${r.name}\n${questions}${r.tips ? `\n    Tips: ${r.tips}` : ''}`;
      })
      .join('\n');
    return `[${i + 1}] ${e.role}, ${e.driveType}, ${e.interviewYear}, outcome: ${e.outcome}\n${rounds}`;
  });
  return `Company: ${companyName}\n\nExperiences:\n\n${blocks.join('\n\n')}`;
}

/** Facts the page shows next to the AI text, computed rather than generated. */
export function computeStats(experiences) {
  const outcomes = {};
  const topics = new Map();
  for (const e of experiences) {
    outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1;
    for (const r of e.rounds) {
      for (const q of r.questions) {
        const topic = q.topic?.trim();
        if (!topic) continue;
        const key = topic.toLowerCase();
        const entry = topics.get(key) ?? { name: topic, count: 0 };
        entry.count += 1;
        topics.set(key, entry);
      }
    }
  }
  const topTopics = [...topics.values()].sort((a, b) => b.count - a.count).slice(0, TOP_TOPICS);
  return { experienceCount: experiences.length, outcomes, topTopics };
}

/** Changes whenever an experience behind the guide is added, edited or removed. */
export function fingerprintOf(experiences) {
  const parts = experiences.map((e) => `${e._id}:${new Date(e.updatedAt).getTime()}`);
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/** Keep only citations that point at a real experience, as 1-based numbers. */
function cleanSources(sources, count) {
  return [...new Set((sources ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= count))];
}

function shapeGuide(raw, count) {
  return {
    overview: String(raw.overview ?? '').trim(),
    rounds: (raw.rounds ?? []).map((r) => ({
      name: String(r.name ?? '').trim(),
      focus: String(r.focus ?? '').trim(),
      sources: cleanSources(r.sources, count),
    })),
    tips: (raw.tips ?? []).slice(0, 5).map((t) => ({
      text: String(t.text ?? '').trim(),
      sources: cleanSources(t.sources, count),
    })),
  };
}

export function createCompanyGuideService({ llm }) {
  // Two readers opening a fresh company at once share one generation.
  const inFlight = new Map();

  async function generate(company, experiences, fingerprint) {
    if (!llm) throw aiUnavailable('AI guides are not configured on this server.');
    let result;
    try {
      result = await llm.generateJson({
        system: SYSTEM,
        prompt: buildPrompt(company.name, experiences),
        schema: GUIDE_SCHEMA,
      });
    } catch {
      throw aiUnavailable();
    }
    return companyGuideRepository.save(company._id, {
      fingerprint,
      guide: shapeGuide(result.data, experiences.length),
      sourceIds: experiences.map((e) => e._id),
      model: result.model,
      generatedAt: new Date(),
    });
  }

  return {
    async getGuide(slug) {
      const company = await companyRepository.findBySlug(slug);
      if (!company) throw notFound('That company does not exist.');

      const experiences = await experienceRepository.findPublishedForGuide(company.slug);
      if (experiences.length === 0) throw notFound('No published experiences for this company yet.');

      const fingerprint = fingerprintOf(experiences);
      let stored = await companyGuideRepository.findByCompany(company._id);
      const cached = stored?.fingerprint === fingerprint;

      if (!cached) {
        if (!inFlight.has(slug)) {
          inFlight.set(slug, generate(company, experiences, fingerprint).finally(() => inFlight.delete(slug)));
        }
        stored = await inFlight.get(slug);
      }

      return {
        company: { name: company.name, slug: company.slug },
        ...stored.guide,
        stats: computeStats(experiences),
        // Citation n points at sources[n - 1].
        sources: experiences.map((e, i) => ({
          n: i + 1,
          id: e._id.toString(),
          role: e.role,
          interviewYear: e.interviewYear,
          outcome: e.outcome,
        })),
        model: stored.model,
        generatedAt: stored.generatedAt,
        cached,
      };
    },
  };
}

export const companyGuideService = createCompanyGuideService({
  llm: createGemini({
    apiKey: env.GEMINI_API_KEY,
    models: env.GEMINI_MODELS.split(',').map((m) => m.trim()).filter(Boolean),
  }),
});
