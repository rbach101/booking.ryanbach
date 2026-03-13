/**
 * Validates and performs a safe redirect to prevent XSS via window.location.href.
 * Only allows HTTPS URLs and known OAuth/payment domains.
 */

const ALLOWED_DOMAINS = [
  'checkout.stripe.com',
  'billing.stripe.com',
  'accounts.google.com',
];

export function safeRedirect(url: string): void {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      console.error('Blocked redirect to non-HTTPS URL:', parsed.protocol);
      throw new Error('Invalid redirect URL');
    }

    // Check against allowed domains
    const isAllowed = ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      console.error('Blocked redirect to untrusted domain:', parsed.hostname);
      throw new Error('Redirect to untrusted domain blocked');
    }

    window.location.href = url;
  } catch (e) {
    if (e instanceof TypeError) {
      // new URL() failed — malformed URL
      console.error('Blocked redirect to malformed URL');
    }
    throw e;
  }
}

/**
 * Validates a URL string for use as an image source.
 * Allows HTTPS URLs and relative paths only.
 */
export function sanitizeImageUrl(url: string): string | null {
  if (!url || !url.trim()) return null;

  // Allow relative paths (e.g. /images/foo.png)
  if (url.startsWith('/') && !url.startsWith('//')) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
