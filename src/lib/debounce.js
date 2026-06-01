export function debounce(fn, ms) {
    let timer = null;
    const debounced = (...args) => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    };
    debounced.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return debounced;
}
