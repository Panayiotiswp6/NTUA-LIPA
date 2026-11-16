/** Keeps a shared, limited API allowance safe: a token ceiling plus a sliding one-minute rate limit. */
export class UsageBudget {
  private spent = 0;
  private calls: number[] = [];

  constructor(private readonly tokenLimit: number, private readonly perMinute: number, private readonly now = () => Date.now()) {}

  /** Reserve one model call. Returns the reason when the call must not happen. */
  acquire(): string | null {
    if (this.spent >= this.tokenLimit) return 'token-budget-exhausted';
    const cutoff = this.now() - 60_000;
    this.calls = this.calls.filter(time => time > cutoff);
    if (this.calls.length >= this.perMinute) return 'rate-limited';
    this.calls.push(this.now());
    return null;
  }

  record(tokens: number) {
    this.spent += Math.max(0, tokens);
  }

  snapshot() {
    return { tokensSpent: this.spent, tokenLimit: this.tokenLimit, perMinute: this.perMinute };
  }
}
