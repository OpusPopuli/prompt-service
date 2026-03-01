import { createHash, createHmac } from 'node:crypto';
import { BASE_URL, API_KEY, ADMIN_API_KEY } from './config';

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
}

interface HttpResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

async function request(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<HttpResponse> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return { status: res.status, body, headers: res.headers };
}

function withAuth(token: string, headers?: Record<string, string>) {
  return { ...headers, Authorization: `Bearer ${token}` };
}

// Raw requests (no auth)
export const get = (path: string, opts?: RequestOptions) =>
  request('GET', path, opts);
export const post = (path: string, opts?: RequestOptions) =>
  request('POST', path, opts);
export const patch = (path: string, opts?: RequestOptions) =>
  request('PATCH', path, opts);
export const del = (path: string, opts?: RequestOptions) =>
  request('DELETE', path, opts);

// API key auth (node endpoints)
export const apiGet = (path: string, opts?: RequestOptions) =>
  get(path, { ...opts, headers: withAuth(API_KEY, opts?.headers) });
export const apiPost = (path: string, opts?: RequestOptions) =>
  post(path, { ...opts, headers: withAuth(API_KEY, opts?.headers) });

// Admin key auth
export const adminGet = (path: string, opts?: RequestOptions) =>
  get(path, { ...opts, headers: withAuth(ADMIN_API_KEY, opts?.headers) });
export const adminPost = (path: string, opts?: RequestOptions) =>
  post(path, { ...opts, headers: withAuth(ADMIN_API_KEY, opts?.headers) });
export const adminPatch = (path: string, opts?: RequestOptions) =>
  patch(path, { ...opts, headers: withAuth(ADMIN_API_KEY, opts?.headers) });
export const adminDelete = (path: string, opts?: RequestOptions) =>
  del(path, { ...opts, headers: withAuth(ADMIN_API_KEY, opts?.headers) });

// HMAC-signed requests (node HMAC auth)
export function hmacPost(
  path: string,
  body: unknown,
  apiKey: string,
  nodeId: string,
): Promise<HttpResponse> {
  const method = 'POST';
  const bodyStr = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash('sha256').update(bodyStr).digest('hex');
  const signatureString = `${timestamp}\n${method}\n${path}\n${bodyHash}`;
  const signature = createHmac('sha256', apiKey)
    .update(signatureString)
    .digest('base64');

  return request(method, path, {
    body,
    headers: {
      'x-hmac-signature': signature,
      'x-hmac-timestamp': timestamp,
      'x-hmac-key-id': nodeId,
    },
  });
}
