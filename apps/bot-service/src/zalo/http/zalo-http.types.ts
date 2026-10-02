export interface GetUpdatesRequestOptions {
  readonly timeoutSeconds: number;
  readonly signal?: AbortSignal;
}

export interface SetWebhookRequest {
  readonly url: string;
  readonly secret_token: string;
}

export interface ZaloHttpClient {
  getMe(token: string): Promise<unknown>;
  getUpdates(token: string, options: GetUpdatesRequestOptions): Promise<unknown>;
  setWebhook(token: string, request: SetWebhookRequest): Promise<unknown>;
  testWebhook(token: string): Promise<unknown>;
  deleteWebhook(token: string): Promise<unknown>;
  getWebhookInfo(token: string): Promise<unknown>;
}
