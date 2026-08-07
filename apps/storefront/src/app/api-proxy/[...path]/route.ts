export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const REQUEST_HEADERS_TO_DROP = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const RESPONSE_HEADERS_TO_DROP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding"
]);

function targetUrl(request: Request, path: string[]): string {
  const base = new URL(API_URL.endsWith("/") ? API_URL : `${API_URL}/`);
  const target = new URL(path.join("/"), base);
  target.search = new URL(request.url).search;
  return target.toString();
}

function requestHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const name of REQUEST_HEADERS_TO_DROP) headers.delete(name);
  return headers;
}

function responseHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  for (const name of RESPONSE_HEADERS_TO_DROP) nextHeaders.delete(name);
  return nextHeaders;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const init: RequestInit = {
    method: request.method,
    headers: requestHeaders(request),
    redirect: "manual"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl(request, path), init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response.headers)
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return proxy(request, context);
}
