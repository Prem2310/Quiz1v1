/** Turns a thrown error (typically an ApiError from the generated client) into
 * a short, user-facing message. Never leaks stack traces or raw JSON. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof Error && error.message) {
    // ApiError messages are already "HTTP 4xx: <detail>" — trim the prefix for a cleaner toast.
    const withoutStatus = error.message.replace(/^HTTP \d+[^:]*:\s*/, "");
    return withoutStatus || fallback;
  }
  return fallback;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /fetch/i.test(error.message);
}

export function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;
}
