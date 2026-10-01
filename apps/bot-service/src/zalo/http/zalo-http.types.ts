export interface GetUpdatesRequestOptions {
  readonly timeoutSeconds: number;
  readonly signal?: AbortSignal;
}

export interface ZaloHttpClient {
  getMe(token: string): Promise<unknown>;
  getUpdates(token: string, options: GetUpdatesRequestOptions): Promise<unknown>;
}
