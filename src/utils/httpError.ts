// src/utils/httpError.ts
// HTTP/2 responses often carry an empty statusText, so `Server error: ` alone
// tells the user nothing. Prefer the JSON error body (OpenAI-style
// `{ error: { message } }` or plain `{ message }`), fall back to status.

export async function httpErrorDetail(response: Response): Promise<string | null> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === 'object') {
      const err = (data as { error?: unknown }).error;
      if (typeof err === 'string' && err) return err.slice(0, 200);
      if (err && typeof err === 'object') {
        const msg = (err as { message?: unknown }).message;
        if (typeof msg === 'string' && msg) return msg.slice(0, 200);
      }
      const message = (data as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message.slice(0, 200);
    }
  } catch {
    // Not a JSON body — fall through to status text.
  }
  return null;
}

/** Host part of a base URL for run-config snapshots; raw value on failure. */
export function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export async function httpError(prefix: string, response: Response): Promise<Error> {
  const detail = await httpErrorDetail(response);
  const status = `${response.status} ${response.statusText}`.trim();
  if (detail) return new Error(`${prefix}: ${detail}`);
  return new Error(status !== String(response.status) ? `${prefix}: ${status}` : prefix);
}
