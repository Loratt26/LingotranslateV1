export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };

  debounced.cancel = (): void => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  return debounced as T & { cancel: () => void };
}
