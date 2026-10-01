export interface ZaloHttpClient {
  getMe(token: string): Promise<unknown>;
}
