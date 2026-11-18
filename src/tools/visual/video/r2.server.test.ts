import { describe, expect, it } from "vitest";
import {
  buildR2VideoKey,
  isR2VideoKeyForStudy,
  createR2PresignedUrl,
  createR2VideoUploadSession,
  readR2Config,
  resolveR2PlaybackUrl,
  type R2Config,
} from "./r2.server";

const testConfig: R2Config = {
  accountId: "cf1234567890abcdef",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  bucket: "neuro-videos",
};

describe("almacenamiento de video en Cloudflare R2 (AWS SigV4)", () => {
  it("lee y valida la configuración desde variables de entorno", () => {
    expect(readR2Config({})).toBeNull();
    const cfg = readR2Config({
      CLOUDFLARE_R2_ACCOUNT_ID: "acc-1",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "key-1",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "sec-1",
      CLOUDFLARE_R2_BUCKET: "bucket-1",
      CLOUDFLARE_R2_PUBLIC_BASE_URL: "https://cdn.example.com/",
    });
    expect(cfg).toEqual({
      accountId: "acc-1",
      accessKeyId: "key-1",
      secretAccessKey: "sec-1",
      bucket: "bucket-1",
      publicBaseUrl: "https://cdn.example.com",
    });
  });

  it("construye claves deterministas por estudio/pieza y rechaza IDs no UUID", () => {
    const key = buildR2VideoKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "video/mp4",
    );
    expect(key).toBe(
      "studies/11111111-1111-4111-8111-111111111111/videos/22222222-2222-4222-8222-222222222222.mp4",
    );
    expect(() =>
      buildR2VideoKey("../bad", "22222222-2222-4222-8222-222222222222", "video/mp4"),
    ).toThrow(/UUID/);
  });

  it("genera URLs prefirmadas PUT y GET deterministas con región auto para Cloudflare R2", () => {
    const fixedNow = new Date("2026-11-12T18:00:00.000Z");
    const putUrl = createR2PresignedUrl({
      config: testConfig,
      method: "PUT",
      key: "studies/11111111-1111-4111-8111-111111111111/videos/22222222-2222-4222-8222-222222222222.mp4",
      expiresInSeconds: 900,
      now: fixedNow,
    });

    const parsed = new URL(putUrl);
    expect(parsed.host).toBe("cf1234567890abcdef.r2.cloudflarestorage.com");
    expect(parsed.pathname).toBe(
      "/neuro-videos/studies/11111111-1111-4111-8111-111111111111/videos/22222222-2222-4222-8222-222222222222.mp4",
    );
    expect(parsed.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(parsed.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20261112/auto/s3/aws4_request",
    );
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20261112T180000Z");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(parsed.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("usa publicBaseUrl cuando existe CDN de Cloudflare R2 y firma GET cuando es privado", () => {
    const fixedNow = new Date("2026-11-12T18:00:00.000Z");
    const sessionPrivate = createR2VideoUploadSession(
      {
        studyId: "11111111-1111-4111-8111-111111111111",
        assetId: "22222222-2222-4222-8222-222222222222",
        mimeType: "video/webm",
        byteLength: 12_000_000,
      },
      testConfig,
      fixedNow,
    );
    expect(sessionPrivate.playbackUrl).toContain(
      "r2.cloudflarestorage.com/neuro-videos/",
    );
    expect(sessionPrivate.playbackUrl).toContain("X-Amz-Signature=");

    const cdnUrl = resolveR2PlaybackUrl({
      config: { ...testConfig, publicBaseUrl: "https://videos.example.com" },
      key: sessionPrivate.storageKey,
      now: fixedNow,
    });
    expect(cdnUrl).toBe(
      "https://videos.example.com/studies/11111111-1111-4111-8111-111111111111/videos/22222222-2222-4222-8222-222222222222.webm",
    );
  });
});


it("limita claves firmadas al estudio y rechaza dominios públicos sin HTTPS", () => {
  const study = "11111111-1111-4111-8111-111111111111";
  const asset = "22222222-2222-4222-8222-222222222222";
  expect(isR2VideoKeyForStudy(buildR2VideoKey(study, asset, "video/mp4"), study)).toBe(true);
  expect(isR2VideoKeyForStudy(buildR2VideoKey(study, asset, "video/mp4"), asset)).toBe(false);
  expect(isR2VideoKeyForStudy(`studies/${study}/videos/../../secret.mp4`, study)).toBe(false);
  expect(readR2Config({ CLOUDFLARE_R2_ACCOUNT_ID: "test", CLOUDFLARE_R2_BUCKET: "test", CLOUDFLARE_R2_ACCESS_KEY_ID: "test", CLOUDFLARE_R2_SECRET_ACCESS_KEY: "test", CLOUDFLARE_R2_PUBLIC_BASE_URL: "example.test" })).toBeNull();
});
