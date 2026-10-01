export function getTrustProxySetting(trustProxyEnabled: boolean): false | 1 {
  return trustProxyEnabled ? 1 : false;
}
