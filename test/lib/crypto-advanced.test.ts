import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import {
  createTestDbWithSetup,
  loginAsAdmin,
  resetDb,
} from "#test-utils";

describe("crypto advanced", () => {
  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
  });

  afterEach(() => {
    resetDb();
  });

  describe("getPrivateKeyFromSession", () => {
    it("derives private key from session token and wrapped keys", async () => {
      const { getPrivateKeyFromSession } = await import("#lib/crypto.ts");
      const { getWrappedPrivateKey } = await import("#lib/db/settings.ts");
      const { getSession } = await import("#lib/db/sessions.ts");

      // Login to create a session with wrapped data key
      const { cookie } = await loginAsAdmin();
      const tokenMatch = cookie.match(/__Host-session=([^;]+)/);
      const sessionToken = tokenMatch![1]!;

      const session = await getSession(sessionToken);
      expect(session).not.toBeNull();
      expect(session!.wrapped_data_key).not.toBeNull();

      const wrappedPrivateKey = await getWrappedPrivateKey();
      expect(wrappedPrivateKey).not.toBeNull();

      // This should successfully derive the RSA private key
      const privateKey = await getPrivateKeyFromSession(
        sessionToken,
        session!.wrapped_data_key!,
        wrappedPrivateKey!,
      );
      expect(privateKey).toBeDefined();
      expect(privateKey.type).toBe("private");
    });
  });

  describe("generateKeyPair", () => {
    it("produces valid RSA key pair as JWK strings", async () => {
      const { generateKeyPair } = await import("#lib/crypto.ts");
      const { publicKey, privateKey } = await generateKeyPair();
      expect(publicKey.length).toBeGreaterThan(0);
      expect(privateKey.length).toBeGreaterThan(0);
      const pubJwk = JSON.parse(publicKey);
      const privJwk = JSON.parse(privateKey);
      expect(pubJwk.kty).toBe("RSA");
      expect(privJwk.kty).toBe("RSA");
    });
  });

  describe("encryptWithKey / decryptWithKey", () => {
    it("round-trips plaintext with a CryptoKey", async () => {
      const { encryptWithKey, decryptWithKey } = await import("#lib/crypto.ts");
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );
      const ciphertext = await encryptWithKey("hello world", key);
      expect(ciphertext.startsWith("enc:1:")).toBe(true);
      const plaintext = await decryptWithKey(ciphertext, key);
      expect(plaintext).toBe("hello world");
    });
  });
});
