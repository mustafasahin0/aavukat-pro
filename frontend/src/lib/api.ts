import { fetchAuthSession } from '@aws-amplify/core';

/**
 * Get the current Cognito JWT token from AWS Amplify Auth
 */
async function getJwtToken(): Promise<string> {
  // fetch auth session
  const session = await fetchAuthSession();
  const { idToken, accessToken } = session.tokens ?? {}; // Prioritize idToken

  // List possible token shapes and narrow them safely
  // Try idToken first, then accessToken
  const candidates: unknown[] = [idToken, accessToken];

  for (const candidate of candidates) {
    if (!candidate) continue;

    // direct string token
    if (typeof candidate === 'string') {
      return candidate;
    }

    // object token with methods/properties
    if (typeof candidate === 'object' && candidate !== null) {
      const obj = candidate as { getJwtToken?: () => string; jwtToken?: string; toString?: () => string };
      if (typeof obj.getJwtToken === 'function') {
        const tokenValue = obj.getJwtToken();
        if (tokenValue) return tokenValue;
      }
      if (typeof obj.jwtToken === 'string' && obj.jwtToken) {
        return obj.jwtToken;
      }
      // Add a fallback to toString()
      if (typeof obj.toString === 'function') {
        const tokenValue = obj.toString();
        // Ensure toString() actually returns a string and it's not the default [object Object]
        if (tokenValue && typeof tokenValue === 'string' && tokenValue !== '[object Object]') {
          return tokenValue;
        }
      }
    }
  }
  // If no token found, throw an error instead of returning an empty string
  throw new Error('Authentication token not found. Please ensure you are logged in.');
}

/**
 * Wrapper around fetch to call the Django REST API with Authorization header
 * @param path - API path after /api
 * @param options - fetch options
 */
export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getJwtToken();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'API request failed');
  }
  return res.json();
} 