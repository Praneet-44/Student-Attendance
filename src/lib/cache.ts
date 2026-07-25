export function withTimeout<T>(promise: PromiseLike<T>, ms: number = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function getLocalCache<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`sams_cache_${key}`);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export function setLocalCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`sams_cache_${key}`, JSON.stringify(data));
  } catch {
    // ignore quota limits
  }
}
