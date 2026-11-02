/**
 * The round editor's shape, and turning it into what the API takes.
 *
 * A round with any content is kept, named or not. Dropping an unnamed round
 * would silently throw away questions someone had just typed.
 */
export const emptyRound = () => ({ name: '', questionText: '', tips: '' });

const lines = (text) => text.split('\n').map((t) => t.trim()).filter(Boolean);

export function hasContent(round) {
  return Boolean(round.name.trim() || round.questionText.trim() || round.tips.trim());
}

/**
 * @param {number} firstNumber  what the first of these rounds counts as, for the fallback name
 * @param {Map} topics          question text to topic, so an edited post keeps its topics
 */
export function toApiRounds(rounds, { firstNumber = 1, topics } = {}) {
  return rounds.filter(hasContent).map((r, i) => ({
    name: r.name.trim() || `Round ${firstNumber + i}`,
    questions: lines(r.questionText).map((text) => {
      const topic = topics?.get(text);
      return { text, ...(topic && { topic }) };
    }),
    tips: r.tips.trim() || undefined,
  }));
}
