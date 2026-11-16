import type { SourceSample } from '../src/domain/types';
import type { LlmClient } from './llm';
import type { UsageBudget } from './budget';

export interface RetrievedSample {
  sample: SourceSample;
  score: number;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** What a sample "is about": the incoming message it answered, plus the owner's reply. */
const documentText = (sample: SourceSample) => `${sample.contactText}\n${sample.ownerText}`;

/**
 * Semantic memory over the owner's writing samples.
 * Sample vectors are computed once in one batch; query vectors are cached by text.
 */
export class StyleRetriever {
  private sampleVectors = new Map<string, number[]>();
  private queryCache = new Map<string, number[]>();
  private indexing?: Promise<void>;

  constructor(private readonly llm: LlmClient, private readonly budget: UsageBudget, private readonly samples: SourceSample[]) {}

  private ensureIndex() {
    if (!this.indexing) {
      this.indexing = (async () => {
        const reason = this.budget.acquire();
        if (reason) throw new Error(reason);
        const { vectors, usage } = await this.llm.embed(this.samples.map(documentText));
        this.budget.record(usage.totalTokens);
        this.samples.forEach((sample, index) => this.sampleVectors.set(sample.id, vectors[index]));
      })().catch(error => { this.indexing = undefined; throw error; });
    }
    return this.indexing;
  }

  private async queryVector(text: string) {
    const cached = this.queryCache.get(text);
    if (cached) return cached;
    const reason = this.budget.acquire();
    if (reason) throw new Error(reason);
    const { vectors, usage } = await this.llm.embed([text]);
    this.budget.record(usage.totalTokens);
    if (this.queryCache.size > 500) this.queryCache.delete(this.queryCache.keys().next().value!);
    this.queryCache.set(text, vectors[0]);
    return vectors[0];
  }

  /**
   * Best samples among those the repository exposes for this contact and channel.
   * Evidence never crosses people, and a sample hidden by the repository is never used.
   */
  async retrieve(query: string, contactId: string, channel: SourceSample['channel'], allowedIds: Set<string>, limit = 3): Promise<RetrievedSample[]> {
    await this.ensureIndex();
    const vector = await this.queryVector(query);
    return this.samples
      .filter(sample => sample.contactId === contactId && sample.channel === channel && allowedIds.has(sample.id))
      .map(sample => ({ sample, score: cosine(vector, this.sampleVectors.get(sample.id) ?? []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
