import OpenAI from 'openai';
import type { ServerConfig } from './config';

export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
}
export interface ChatRequest {
  system: string;
  user: string;
  schema: JsonSchema;
  maxTokens: number;
  reasoningEffort?: ServerConfig['reasoningEffort'];
}
export interface Usage {
  totalTokens: number;
}

/** The only surface the suggestion service needs. Tests replace it with a fake. */
export interface LlmClient {
  readonly chatModel: string;
  readonly embeddingModel: string;
  chatJson<T>(request: ChatRequest): Promise<{ data: T; usage: Usage }>;
  embed(texts: string[]): Promise<{ vectors: number[][]; usage: Usage }>;
}

export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  readonly chatModel: string;
  readonly embeddingModel: string;

  constructor(private readonly config: ServerConfig) {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
      timeout: config.requestTimeoutMs,
      maxRetries: 1,
    });
    this.chatModel = config.chatModel;
    this.embeddingModel = config.embeddingModel;
  }

  async chatJson<T>(request: ChatRequest) {
    const completion = await this.client.chat.completions.create({
      model: this.chatModel,
      reasoning_effort: request.reasoningEffort ?? this.config.reasoningEffort,
      max_completion_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: request.schema.name, strict: true, schema: request.schema.schema } },
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error(`Empty completion (finish_reason: ${completion.choices[0]?.finish_reason ?? 'unknown'})`);
    return { data: JSON.parse(content) as T, usage: { totalTokens: completion.usage?.total_tokens ?? 0 } };
  }

  async embed(texts: string[]) {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      dimensions: this.config.embeddingDimensions,
    });
    const vectors = [...response.data].sort((a, b) => a.index - b.index).map(item => item.embedding);
    return { vectors, usage: { totalTokens: response.usage?.total_tokens ?? 0 } };
  }
}
