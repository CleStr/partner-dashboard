// Runtime-Entschlüsselung des AES-GCM-verschlüsselten Mappings.
// Der Schlüssel wird per PBKDF2 aus dem eingegebenen Zugangscode abgeleitet.
// Falscher Code => AES-GCM-Auth-Tag schlägt fehl => sauberer Fehler.

const PBKDF2_ITERATIONS = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;

export async function decryptBundle(
  blob: ArrayBuffer,
  accessCode: string
): Promise<Uint8Array> {
  const data = new Uint8Array(blob);
  if (data.length < SALT_LEN + IV_LEN + 16) {
    throw new Error('Ungültiges verschlüsseltes Bundle.');
  }
  const salt = data.slice(0, SALT_LEN);
  const iv = data.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = data.slice(SALT_LEN + IV_LEN);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(accessCode),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error('Zugangscode falsch.');
  }
}

export async function decryptJson<T>(
  blob: ArrayBuffer,
  accessCode: string
): Promise<T> {
  const bytes = await decryptBundle(blob, accessCode);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}
