import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import sharp from "sharp";
import {
  OpenAIProductDisplayImageProvider,
  productDisplayImagePrompt,
  shadowSideFor,
  shoeDisplayImagePrompt,
  SHOE_DISPLAY_PROMPT_VERSION,
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
  it("uses the fidelity-focused model and high quality by default", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_IMAGE_EDIT_MODEL;
    delete process.env.OPENAI_IMAGE_EDIT_QUALITY;
    let submittedForm: FormData | undefined;
    globalThis.fetch = (async (_input, init) => {
      submittedForm = init?.body as FormData;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated-png").toString("base64") }]
      }), { status: 200 });
    }) as typeof fetch;

    const provider = new OpenAIProductDisplayImageProvider();
    assert.equal(provider.isConfigured(), true);
    const result = await provider.generate({
      body: Buffer.from("source"), contentType: "image/png", filename: "source.png"
    });

    assert.equal(submittedForm?.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(submittedForm?.get("quality"), "high");
    assert.equal(submittedForm?.get("size"), "1024x1024");
    assert.equal(submittedForm?.has("input_fidelity"), false, "Do not send unsupported legacy fidelity parameters to GPT Image 2.5.");
    assert.equal(result.body.toString(), "generated-png");
    assert.equal(result.processorVersion, `gpt-image-2.5-sunburst:${PRODUCT_DISPLAY_PROMPT_VERSION}:high`);
  });

  it("sends a portrait photo as a square with room left for the contact shadow", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let submittedForm: FormData | undefined;
    globalThis.fetch = (async (_input, init) => {
      submittedForm = init?.body as FormData;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated-png").toString("base64") }]
      }), { status: 200 });
    }) as typeof fetch;
    const portrait = await sharp({ create: { width: 960, height: 1280, channels: 3, background: "#b8c0cc" } })
      .jpeg()
      .toBuffer();

    await new OpenAIProductDisplayImageProvider().generate({
      body: portrait, contentType: "image/jpeg", filename: "hoodie.jpg"
    });

    const uploaded = submittedForm?.get("image[]") as Blob;
    const metadata = await sharp(Buffer.from(await uploaded.arrayBuffer())).metadata();
    assert.equal(metadata.width, metadata.height, "the model should receive a square");
    assert.equal(metadata.height, 1600, "the photo's long side should take 80% of that square");
  });

  it("scales a full-size phone photo down before squaring it, so the job stays inside the container's memory", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let submittedForm: FormData | undefined;
    globalThis.fetch = (async (_input, init) => {
      submittedForm = init?.body as FormData;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated-png").toString("base64") }]
      }), { status: 200 });
    }) as typeof fetch;
    const phonePhoto = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#b8c0cc" } })
      .jpeg()
      .toBuffer();

    await new OpenAIProductDisplayImageProvider().generate({
      body: phonePhoto, contentType: "image/jpeg", filename: "sweater.jpg"
    });

    const uploaded = submittedForm?.get("image[]") as Blob;
    const metadata = await sharp(Buffer.from(await uploaded.arrayBuffer())).metadata();
    assert.equal(metadata.width, metadata.height);
    assert.equal(metadata.width, 1920, "a 1536px photo at 80% of the square, not the 5000px square the full photo needed");
  });

  it("puts each item's shadow on one side, the same side every time it is regenerated", () => {
    const sides = Array.from({ length: 200 }, (_, index) => shadowSideFor(`image-${index}.png`));
    const left = sides.filter((side) => side === "left").length;
    assert.ok(left > 60 && left < 140, `catalogue should mix both sides, got ${left} left of 200`);
    assert.equal(shadowSideFor("abc.png"), shadowSideFor("abc.png"));
    const prompt = productDisplayImagePrompt("left");
    assert.match(prompt, /falling to the left of the garment/);
    assert.match(prompt, /no shadow on the right side/);
    assert.doesNotMatch(prompt, /just around the garment/);
  });

  it("honors an explicit model and quality override", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_IMAGE_EDIT_MODEL = "gpt-image-2";
    process.env.OPENAI_IMAGE_EDIT_QUALITY = "medium";
    let submittedForm: FormData | undefined;
    globalThis.fetch = (async (_input, init) => {
      submittedForm = init?.body as FormData;
      return new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("generated-png").toString("base64") }]
      }), { status: 200 });
    }) as typeof fetch;

    const result = await new OpenAIProductDisplayImageProvider().generate({
      body: Buffer.from("source"), contentType: "image/png", filename: "source.png"
    });

    assert.equal(submittedForm?.get("model"), "gpt-image-2");
    assert.equal(submittedForm?.get("quality"), "medium");
    assert.equal(result.processorVersion, `gpt-image-2:${PRODUCT_DISPLAY_PROMPT_VERSION}:medium`);
  });

  it("requires the shared OpenAI API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProductDisplayImageProvider();

    assert.equal(provider.isConfigured(), false);
    await assert.rejects(
      provider.generate({ body: Buffer.from("image"), contentType: "image/png", filename: "white.png" }),
      /OPENAI_API_KEY is not configured/
    );
  });

  it("sends an original-preserving edit prompt and returns the edited PNG", async () => {
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
    assert.equal(submittedForm.get("prompt"), productDisplayImagePrompt(shadowSideFor("white.jpg")));
    assert.ok(submittedForm.get("image[]") instanceof Blob);
    assert.equal(await (submittedForm.get("image[]") as Blob).text(), "white-background-source", "The uploaded source must reach the provider unchanged.");
    assert.match(String(submittedForm.get("prompt")), /Do not flatten, straighten, symmetrize/);
    assert.match(String(submittedForm.get("prompt")), /retain it rather than fabricating the hidden garment/);
    assert.match(String(submittedForm.get("prompt")), /including small lettering and non-Latin text/);
    assert.doesNotMatch(String(submittedForm.get("prompt")), /level the shoulders|straighten both legs|Reduce only large/);
    assert.equal(result.body.toString(), "generated-png");
    assert.equal(result.contentType, "image/png");
    assert.equal(result.provider, "openai-image-edit");
    assert.equal(result.processorVersion, `gpt-image-test:${PRODUCT_DISPLAY_PROMPT_VERSION}:high`);
    assert.equal(result.widthPx, 1024);
    assert.equal(result.heightPx, 1024);
  });

  it("generates adult and kids shoe pairs from the original image with a shoe fidelity prompt", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    let submittedForm: FormData | undefined;
    globalThis.fetch = (async (_input, init) => {
      submittedForm = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("pair").toString("base64") }] }));
    }) as typeof fetch;
    const result = await new OpenAIProductDisplayImageProvider().generate({
      body: Buffer.from("original-pair"), contentType: "image/jpeg", filename: "pair.jpg", category: "SHOES"
    });
    assert.equal(submittedForm?.get("prompt"), shoeDisplayImagePrompt(shadowSideFor("pair.jpg")));
    assert.match(String(submittedForm?.get("prompt")), /Keep both original shoes fully visible/);
    assert.match(String(submittedForm?.get("prompt")), /Do not repair, clean away, hide/);
    assert.match(String(submittedForm?.get("prompt")), /mirror or duplicate one shoe/);
    assert.equal(await (submittedForm?.get("image[]") as Blob).text(), "original-pair");
    assert.match(result.processorVersion, new RegExp(SHOE_DISPLAY_PROMPT_VERSION));
  });

  it("does not silently downgrade or retry when the configured image model is unavailable", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_IMAGE_EDIT_MODEL;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "Model access unavailable" } }), { status: 403 });
    }) as typeof fetch;
    await assert.rejects(new OpenAIProductDisplayImageProvider().generate({
      body: Buffer.from("original"), contentType: "image/jpeg", filename: "original.jpg"
    }), /Model access unavailable/);
    assert.equal(calls, 1);
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
