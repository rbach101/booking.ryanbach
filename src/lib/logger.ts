/**
 * Development-only logger. No-op in production to avoid console noise.
 */
const isDev = import.meta.env.DEV;

export const devLog = (...args: unknown[]) => {
  if (isDev) {
    console.log(...args);
  }
};

export const devWarn = (...args: unknown[]) => {
  if (isDev) {
    console.warn(...args);
  }
};
