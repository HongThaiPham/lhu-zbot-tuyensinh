export interface ZaloSdkClient {
  getMe(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface ZaloSdkFactory {
  create(token: string): ZaloSdkClient;
}
