import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  OpenAIProductDisplayImageProvider,
  PRODUCT_DISPLAY_IMAGE_PROMPT,
  PRODUCT_DISPLAY_PROMPT_VERSION
} from "./openai-product-display-image.provider";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_IMAGE_EDIT_MODEL;
const originalQuality = process.env.OPENAI_IMAGE_EDIT_QUALITY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restore("OPENAI_API_KEY", originalApiKey);
  restore("OPENAI_IMAGE_EDIT_MODEL", originalModel);
  restore("OPENAI_IMAGE_EDIT_QUALITY", originalQuality);
});

describe("OpenAIProductDisplayImageProvider", () => {
  it("requires the shared OpenAI API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProductDisplayImageProvider();

    assert.equal(provider.isConfigured(), false);
    await assert.rejects(
      provider.generate({ body: Buffer.from("image"), contentType: "image/png", filename: "white.png" }),
      /OPENAI_API_KEY is not configured/
    );
  });

  it("sends a high-fidelity catalog arrangement prompt and returns the edited PNG", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_IMAGE_EDIT_MODEL = "gpt-image-test";
    process.env.OPENAI_IMAGE_EDIT_QUALITY = "high";
    let requestUrl = "";
    let form: FormData | null = null;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      form = init?.body as FormData;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated-png").toString("base64") }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const result = await new OpenAIProductDisplayImageProvider().generate({
      body: Buffer.from("white-background-source"),
      contentType: "image/jpeg",
      filename: "white.jpg"
    });

    assert.equal(requestUrl, "https://api.openai.com/v1/images/edits");
    const submittedForm = form as unknown as FormData;
    assert.ok(submittedForm);
    assert.equal(submittedForm.get("model"), "gpt-image-test");
    assert.equal(submittedForm.get("quality"), "high");
    assert.equal(submittedForm.get("size"), "1024x1024");
    assert.equal(submittedForm.get("prompt"), PRODUCT_DISPLAY_IMAGE_PROMPT);
    assert.ok(submittedForm.get("image[]") instanceof Blob);
    assert.equal(result.body.toString(), "generated-png");
    assert.equal(result.contentType, "image/png");
    assert.equal(result.provider, "openai-image-edit");
    assert.equal(result.processorVersion, `gpt-image-test:${PRODUCT_DISPLAY_PROMPT_VERSION}:high`);
    assert.equal(result.widthPx, 1024);
    assert.equal(result.heightPx, 1024);
  });

  it("rejects a successful response without image bytes", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{}] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

    await assert.rejects(
      new OpenAIProductDisplayImageProvider().generate({
        body: Buffer.from("source"),
        contentType: "image/png",
        filename: "source.png"
      }),
      /returned no image data/
    );
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
