import { Buffer } from "buffer";
import { concatHex, encodeAbiParameters, parseAbiParameters, sha256 } from "viem";

import { decode } from "cborg";
/**
 * Extracts r and s integers from Android's ASN.1 DER-encoded WebAuthn signature
 */
export function parseDERSignature(signatureBytes: Uint8Array): { r: bigint; s: bigint } {
  const buf = Buffer.from(signatureBytes);

  if (buf[0] !== 0x30) throw new Error("Invalid ASN.1 signature: expected sequence marker 0x30");
  if (buf[2] !== 0x02) throw new Error("Invalid ASN.1 signature: expected integer marker 0x02 for r");

  const rLength = buf[3];
  const rStart = 4;
  const rEnd = rStart + rLength;
  const rHex = Buffer.from(buf.subarray(rStart, rEnd)).toString("hex");
  const r = BigInt("0x" + rHex);

  const sMarkerPos = rEnd;
  if (buf[sMarkerPos] !== 0x02) throw new Error("Invalid ASN.1 signature: expected integer marker 0x02 for s");
  
  const sLength = buf[sMarkerPos + 1];
  const sStart = sMarkerPos + 2;
  const sEnd = sStart + sLength;
  const sHex = Buffer.from(buf.subarray(sStart, sEnd)).toString("hex");
  const s = BigInt("0x" + sHex);

  return { r, s };
}

/**
 * Converts a hex string (e.g. bytes32 userOpHash) to an unpadded Base64URL string for WebAuthn challenges.
 */
export function hexToBase64Url(hex: `0x${string}`): string {
  const rawHash = hex.replace(/^0x/, "");
  return Buffer.from(rawHash, "hex").toString("base64url").replace(/=+$/, "");
}

/**
 * Converts a Base64URL string returned by WebAuthn into a Uint8Array.
 */
export function base64UrlToUint8Array(base64url: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64url, "base64url"));
}

/**
 * Encodes the 5 parameters required by PasskeyAccount._verification
 */
export function packPasskeySignature(params: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  userOpHash: `0x${string}`;
  r: bigint;
  s: bigint;
}): `0x${string}` {
  const { authenticatorData, clientDataJSON, userOpHash, r, s } = params;

  // 1. Convert clientDataJSON to string to find the exact offset of the hash
  const clientDataString = Buffer.from(clientDataJSON).toString("utf8");
  
  // 2. Base64URL encode the hash to match what the phone signs
  const rawHash = userOpHash.replace(/^0x/, "");
  const base64UrlHash = Buffer.from(rawHash, "hex").toString("base64url").replace(/=+$/, "");

  // 3. Find the offset
  const challengeOffset = clientDataString.indexOf(base64UrlHash);
  if (challengeOffset === -1) {
    throw new Error("Replay protection failed: userOpHash not found in clientDataJSON");
  }

  // 4. ABI-encode strictly matching your PasskeyAccount.sol logic
  return encodeAbiParameters(
    parseAbiParameters("bytes, bytes, uint256, uint256, uint256"),
    [
      `0x${Buffer.from(authenticatorData).toString("hex")}`,
      `0x${Buffer.from(clientDataJSON).toString("hex")}`,
      BigInt(challengeOffset),
      r,
      s,
    ]
  );
}


export function extractPublicKeyCoordinates(attestationObject: string | Uint8Array): { x: `0x${string}`, y: `0x${string}` } {
  // 1. Parse the incoming object into a Buffer
  const attObjBuffer = typeof attestationObject === "string"
    ? Buffer.from(attestationObject, "base64url") 
    : Buffer.from(attestationObject);

  // 2. Decode the outer CBOR map
  const decodedAttObj = decode(attObjBuffer);
  
  // cborg returns Uint8Array, so we wrap it back into a Buffer for easy reading
  const authData = Buffer.from(decodedAttObj.authData);

  // 3. Verify the "Attested Credential Data" flag (Bit 6) is set
  const flags = authData[32];
  if ((flags & 0x40) === 0) {
    throw new Error("Attested credential data is missing from authData");
  }

  // 4. Calculate the dynamic byte offset to find the public key
  const credIdLen = authData.readUInt16BE(53);
  const publicKeyStart = 55 + credIdLen;
  const publicKeyBuffer = authData.subarray(publicKeyStart);

  // 5. Decode the COSE Key (CBOR format)
  // We MUST pass { useMaps: true } because COSE maps use negative integer keys (-2, -3)
  const coseKey = decode(publicKeyBuffer, { useMaps: true });

  const xBuffer = coseKey.get(-2);
  const yBuffer = coseKey.get(-3);

  if (!xBuffer || !yBuffer) {
    throw new Error("Failed to extract coordinates. Ensure the passkey uses the P-256 (ES256) curve.");
  }

  return {
    x: `0x${Buffer.from(xBuffer).toString("hex")}`,
    y: `0x${Buffer.from(yBuffer).toString("hex")}`
  };
}

// ============================================================================
// Trustless P-256 (secp256r1) Public Key Recovery from WebAuthn Assertions
// Allows recovering (x, y) on any device even if the backend server crashes!
// ============================================================================
const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_A = P256_P - 3n;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const P256_GX = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n;
const P256_GY = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;

type Point = [bigint, bigint] | null;

function mod(a: bigint, m: bigint = P256_P): bigint {
  const res = a % m;
  return res >= 0n ? res : res + m;
}

function modPow(base: bigint, exp: bigint, m: bigint = P256_P): bigint {
  let res = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) res = (res * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return res;
}

function modInv(a: bigint, m: bigint = P256_P): bigint {
  return modPow(a, m - 2n, m);
}

function pointAdd(p1: Point, p2: Point): Point {
  if (!p1) return p2;
  if (!p2) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (x1 === x2) {
    if (mod(y1 + y2) === 0n) return null;
    const lam = mod((3n * x1 * x1 + P256_A) * modInv(2n * y1));
    const x3 = mod(lam * lam - 2n * x1);
    return [x3, mod(lam * (x1 - x3) - y1)];
  }
  const lam = mod((y2 - y1) * modInv(x2 - x1));
  const x3 = mod(lam * lam - x1 - x2);
  return [x3, mod(lam * (x1 - x3) - y1)];
}

function pointMul(p: Point, k: bigint): Point {
  let res: Point = null;
  let cur: Point = p;
  let scalar = mod(k, P256_N);
  while (scalar > 0n) {
    if ((scalar & 1n) === 1n) res = pointAdd(res, cur);
    cur = pointAdd(cur, cur);
    scalar >>= 1n;
  }
  return res;
}

/**
 * Recovers the 2 candidate P-256 public keys Q = r^-1 * (s*R - e*G) directly from a WebAuthn assertion.
 * Matches PasskeyAccount.sol: messageHash = sha256(abi.encodePacked(authenticatorData, sha256(clientDataJSON)))
 */
export function recoverWebAuthnPublicKeyCandidates(params: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): { x: `0x${string}`; y: `0x${string}` }[] {
  const { authenticatorData, clientDataJSON, signature } = params;
  const { r, s } = parseDERSignature(signature);

  const authHex = `0x${Buffer.from(authenticatorData).toString("hex")}` as `0x${string}`;
  const clientDataHash = sha256(clientDataJSON);
  const messageHashHex = sha256(concatHex([authHex, clientDataHash]));
  const e = BigInt(messageHashHex);

  const xR = r;
  const rhs = mod(modPow(xR, 3n) + P256_A * xR + P256_B);
  const yR = modPow(rhs, (P256_P + 1n) / 4n);

  const rInv = modInv(r, P256_N);
  const negEG = pointMul([P256_GX, P256_GY], P256_N - mod(e, P256_N));

  const candidates: { x: `0x${string}`; y: `0x${string}` }[] = [];
  for (const candY of [yR, mod(-yR)]) {
    const sR = pointMul([xR, candY], s);
    const sum = pointAdd(sR, negEG);
    const q = pointMul(sum, rInv);
    if (q) {
      candidates.push({
        x: `0x${q[0].toString(16).padStart(64, "0")}`,
        y: `0x${q[1].toString(16).padStart(64, "0")}`,
      });
    }
  }
  return candidates;
}
