/**
 * Runtime env for server-side Nodedr submit proxy. Never use NEXT_PUBLIC_* for keys.
 */

export type NodedrSubmitRuntimeConfig = {
  publicKey: string;
  secretKey?: string;
};

function trimEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

/**
 * Returns config if a valid public key is set; otherwise null (route should503).
 */
export function getNodedrSubmitConfig(): NodedrSubmitRuntimeConfig | null {
  const publicKey = trimEnv('NODEDR_SUBMIT_PUBLIC_KEY') || trimEnv('NODEDR_PUBLIC_KEY');
  if (!publicKey.startsWith('pk_')) {
    return null;
  }

  const rawSecret = trimEnv('NODEDR_SUBMIT_SECRET_KEY');
  const secretKey = rawSecret.startsWith('sk_') ? rawSecret : undefined;

  return { publicKey, secretKey };
}
