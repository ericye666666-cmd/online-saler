const METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const MAX_ASSET_BYTES = 250 * 1024 * 1024;

type TokenResponse = { access_token?: string };

export function affiliateAssetBucket() {
  return process.env.PRODUCT_IMAGE_BUCKET?.trim() || null;
}

export async function uploadAffiliateAsset(objectName: string, contentType: string, body: Buffer) {
  const bucket = affiliateAssetBucket();
  if (!bucket) return null;
  if (!body.length || body.length > MAX_ASSET_BYTES) throw new Error("Affiliate asset must be between 1 byte and 250 MB.");
  const tokenResponse = await fetch(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
  if (!tokenResponse.ok) throw new Error("Cloud Storage access token could not be obtained.");
  const token = await tokenResponse.json() as TokenResponse;
  if (!token.access_token) throw new Error("Cloud Storage access token was empty.");

  const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  url.searchParams.set("uploadType", "media");
  url.searchParams.set("name", objectName);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
    body: new Uint8Array(body).buffer,
  });
  if (!response.ok) throw new Error(`Affiliate asset upload failed with status ${response.status}.`);
  return `gs://${bucket}/${objectName}`;
}
