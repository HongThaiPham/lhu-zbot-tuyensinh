declare module 'node-zalo-bot' {
  interface ZaloBotOptions {
    readonly polling?: boolean | { readonly autoStart?: boolean };
    readonly webHook?: unknown;
    readonly baseApiUrl?: string;
    readonly filepath?: boolean;
    readonly badRejection?: boolean;
    readonly testEnvironment?: boolean;
    readonly request?: Readonly<Record<string, unknown>>;
  }

  interface ZaloBotErrors {
    readonly BaseError: new (...args: unknown[]) => Error;
    readonly FatalError: new (...args: unknown[]) => Error;
    readonly ParseError: new (...args: unknown[]) => Error;
    readonly ZaloError: new (...args: unknown[]) => Error;
  }

  class ZaloBot {
    public static readonly errors: ZaloBotErrors;

    public constructor(token: string, options: ZaloBotOptions);
    public getMe(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
    public getUpdates(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
    public sendMessage(
      chatId: string | number,
      text: string,
      options?: Readonly<Record<string, unknown>>,
    ): Promise<unknown>;
    public setWebHook(
      url: string,
      options?: Readonly<Record<string, unknown>>,
    ): Promise<unknown>;
    public deleteWebHook(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
    public getWebHookInfo(options?: Readonly<Record<string, unknown>>): Promise<unknown>;
  }

  export = ZaloBot;
}
