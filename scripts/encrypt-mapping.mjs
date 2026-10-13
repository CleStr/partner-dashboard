// Verschlüsselt variable_mapping.json + type_overrides.json (Compamedia-IP)
// mit AES-GCM. Der Schlüssel wird per PBKDF2 aus dem Zugangscode abgeleitet
// und liegt NIE im Quelltext oder Bundle.
//
// Aufruf:  node scripts/encrypt-mapping.mjs <ZUGANGSCODE>
//          oder: ACCESS_CODE=<ZUGANGSCODE> node scripts/encrypt-mapping.mjs
// Umgebungsvariablen:
//   ACCESS_CODE   Zugangscode (Alternative zum CLI-Argument)
//   MAPPING_SRC   Pfad zur variable_mapping.json (Default: ../uploads/)
//   OVERRIDES_SRC Pfad zur type_overrides.json
//   OUT           Ausgabeordner (Default: ../public/encrypted)
//
// Die verschlüsselten Dateien sind zur Build-Zeit öffentlich (public/),
// der Schutz ist die AES-GCM-Verschlüsselung selbst.

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PBKDF2_ITERATIONS = 600_000;
const SALT_LEN = 16;
const IV_LEN = 12;

const accessCode = process.argv[2] ?? process.env.ACCESS_CODE;
if (!accessCode || accessCode.length < 8) {
  console.error('Fehler: Zugangscode als Argument oder ACCESS_CODE angeben (min. 8 Zeichen).');
  console.error('Aufruf: node scripts/encrypt-mapping.mjs <ZUGANGSCODE>');
  process.exit(1);
}

const mappingSrc = resolve(
  __dirname,
  process.env.MAPPING_SRC ?? '../../uploads/variable_mapping.json'
);
const overridesSrc = resolve(
  __dirname,
  process.env.OVERRIDES_SRC ?? '../../uploads/type_overrides.json'
);
const outDir = resolve(__dirname, process.env.OUT ?? '../public/encrypted');

async function deriveKey(code, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

async function encryptFile(src, label) {
  const plaintext = readFileSync(src);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(accessCode, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext
    )
  );
  // Binärformat: [salt(16)][iv(12)][ciphertext]
  const blob = new Uint8Array(SALT_LEN + IV_LEN + ciphertext.length);
  blob.set(salt, 0);
  blob.set(iv, SALT_LEN);
  blob.set(ciphertext, SALT_LEN + IV_LEN);
  const outPath = resolve(outDir, label);
  writeFileSync(outPath, blob);
  console.log(`Verschlüsselt: ${src} -> ${outPath} (${blob.length} Bytes)`);
}

mkdirSync(outDir, { recursive: true });
await encryptFile(mappingSrc, 'mapping.bin');
await encryptFile(overridesSrc, 'overrides.bin');
console.log('Fertig. Zugangscode nicht committen!');
