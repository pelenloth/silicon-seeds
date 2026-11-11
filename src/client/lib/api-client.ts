export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

function capMessage(msg: string): string {
  return msg.trim().slice(0, 300);
}

function parseIssues(
  issues: unknown,
): { message: string; fields?: Record<string, string> } | null {
  if (!Array.isArray(issues) || issues.length === 0) return null;
  const fields: Record<string, string> = {};
  let firstMsg = "";
  for (const item of issues) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const msg = typeof rec.message === "string" ? rec.message : "";
      if (!firstMsg && msg) firstMsg = msg;
      if (Array.isArray(rec.path) && msg) {
        const key = rec.path.map(String).join(".");
        if (key && !Object.hasOwn(fields, key)) fields[key] = msg;
      }
    }
  }
  if (!firstMsg) return null;
  return {
    message: capMessage(firstMsg),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

export function parseApiError(
  status: number,
  bodyText: string,
): { message: string; fields?: Record<string, string> } {
  const fallback = { message: `Request failed (${status})` };
  const trimmed = bodyText.trim();
  if (!trimmed) return fallback;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.error === "string" && obj.error.trim()) {
        const fields: Record<string, string> = {};
        if (
          obj.fields &&
          typeof obj.fields === "object" &&
          !Array.isArray(obj.fields)
        ) {
          for (const [k, v] of Object.entries(
            obj.fields as Record<string, unknown>,
          )) {
            if (typeof v === "string") fields[k] = v;
          }
        }
        return {
          message: capMessage(obj.error),
          ...(Object.keys(fields).length > 0 ? { fields } : {}),
        };
      }
      if (obj.error && typeof obj.error === "object") {
        const errObj = obj.error as Record<string, unknown>;
        const fromIssues = parseIssues(errObj.issues);
        if (fromIssues) return fromIssues;
        if (typeof errObj.message === "string") {
          try {
            const innerIssues = JSON.parse(errObj.message);
            const fromInner = parseIssues(innerIssues);
            if (fromInner) return fromInner;
          } catch {}
          if (errObj.message.trim()) {
            return { message: capMessage(errObj.message) };
          }
        }
      }
      if (typeof obj.message === "string" && obj.message.trim()) {
        return { message: capMessage(obj.message) };
      }
    }
    return fallback;
  } catch {
    if (/<[a-zA-Z]/.test(trimmed)) return fallback;
    return { message: capMessage(trimmed) };
  }
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

async function handleResponse<T>(
  r: Response,
  signal?: AbortSignal,
): Promise<T> {
  let text: string;
  try {
    text = await r.text();
  } catch (err) {
    if (isAbortError(err, signal)) throw err;
    throw new ApiError(0, "Cannot reach the server");
  }
  if (!r.ok) {
    const parsed = parseApiError(r.status, text);
    throw new ApiError(r.status, parsed.message, parsed.fields);
  }
  if (r.status === 204 || !text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(r.status, "Unexpected response from the server");
  }
}

export async function apiGet<T>(
  path: string,
  init?: { signal?: AbortSignal },
): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      headers: { Accept: "application/json" },
      signal: init?.signal,
    });
  } catch (err) {
    if (isAbortError(err, init?.signal)) throw err;
    throw new ApiError(0, "Cannot reach the server");
  }
  return handleResponse<T>(r, init?.signal);
}

export async function apiSend<T = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: object | FormData,
  init?: { signal?: AbortSignal },
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (isFormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers,
      body: payload,
      signal: init?.signal,
    });
  } catch (err) {
    if (isAbortError(err, init?.signal)) throw err;
    throw new ApiError(0, "Cannot reach the server");
  }
  return handleResponse<T>(r, init?.signal);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiSend<T>("POST", path, body as object | FormData | undefined);
}

export type MediaType = "image" | "video" | "audio";

export type MediaItem = {
  filename: string;
  subfolder: string;
  mediaType: MediaType;
  src?: string;
  created_at?: string;
  job_id?: string;
  job_name?: string | null;
  event_id?: string;
  meta_id?: string;
};

export type GalleryItem = {
  meta_id: string;
  event_id: string;
  filename: string;
  subfolder: string;
  type: "input" | "output" | "temp";
  created_at: string;
  job_id: string;
  job_name?: string | null;
  mediaType: "image" | "video" | "audio" | null;
};

export type EventRow = {
  id: string;
  created_at: string;
  job_id: string;
  mode: string;
  status: string;
  priority: number;
  type: string;
  text: string | null;
  prompt: string | null;
  filename: string | null;
  start_img: string | null;
  end_img: string | null;
  duration: number | null;
  lyrics: string | null;
  audio_settings: string | null;
  index: number | null;
  claimed_at: string | null;
  attempt_count: number;
  error: string | null;
};

export function getAssetPath(subfolder: string, filename: string): string {
  const clean = subfolder.endsWith("/") ? subfolder.slice(0, -1) : subfolder;
  if (!clean || clean.trim() === "") return `/assets/${filename}`;
  return `/assets/${clean}/${filename}`;
}

export function mediaUrl(item: MediaItem): string {
  return item.src ?? getAssetPath(item.subfolder, item.filename);
}

export function thumbUrl(
  item: { subfolder: string; filename: string },
  width: 96 | 320 | 640,
): string {
  const segments = [
    ...item.subfolder.split("/").filter(Boolean),
    item.filename,
  ];
  return `/thumbs/${segments.map(encodeURIComponent).join("/")}?w=${width}`;
}
