/** Thin fetch wrapper: same-origin, credentials included (session cookie). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

async function readError(res: Response, fallback: string): Promise<never> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await res.json().catch(() => null)) as
      | { message?: unknown; error?: unknown }
      | null;
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : fallback;
    throw new ApiError(message, res.status, payload);
  }

  const text = await res.text().catch(() => '');
  throw new ApiError(text || fallback, res.status, text);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) await readError(res, `GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await readError(res, `${method} ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}
