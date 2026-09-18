import axios from 'axios';

/**
 * The single axios instance.
 *
 * `withCredentials: true` is what sends the session cookie on a cross-origin
 * request. Without it the browser silently omits the cookie and every
 * authenticated call returns 401 while looking perfectly correct in the
 * network tab — a classic hour-long debugging session.
 */
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/v1`,
  withCredentials: true,
  timeout: 20_000,
});

/**
 * Unwrap the API's envelope so components never touch `res.data.data`, and
 * turn its error shape into an Error with the fields attached.
 */
export async function get(path, config) {
  const res = await api.get(path, config);
  return res.data;
}

export async function post(path, body, config) {
  const res = await api.post(path, body, config);
  return res.data;
}

export async function patch(path, body, config) {
  const res = await api.patch(path, body, config);
  return res.data;
}

/** Turn an axios failure into something a form can render. */
export function toFormError(err) {
  const payload = err?.response?.data?.error;

  return {
    message: payload?.message ?? 'Something went wrong. Please try again.',
    fields: payload?.fields ?? {},
    code: payload?.code,
    // Shown to the user so they can quote it — the other half of the
    // requestId the server stamps on every log line.
    requestId: err?.response?.data?.requestId,
    status: err?.response?.status,
  };
}

export const SIGN_IN_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/v1/auth/google`;
