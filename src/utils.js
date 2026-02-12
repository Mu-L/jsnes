export function copyArrayElements(src, srcPos, dest, destPos, length) {
  for (let i = 0; i < length; ++i) {
    dest[destPos + i] = src[srcPos + i];
  }
}

export function copyArray(src) {
  return src.slice(0);
}

export function fromJSON(obj, state) {
  for (let i = 0; i < obj.JSON_PROPERTIES.length; i++) {
    const prop = obj.JSON_PROPERTIES[i];
    const current = obj[prop];
    const value = state[prop];
    if (ArrayBuffer.isView(current) && Array.isArray(value)) {
      // Typed arrays: copy data in-place instead of replacing the array,
      // since JSON.parse produces plain arrays not typed arrays.
      current.set(value);
    } else {
      obj[prop] = value;
    }
  }
}

export function toJSON(obj) {
  const state = {};
  for (let i = 0; i < obj.JSON_PROPERTIES.length; i++) {
    const prop = obj.JSON_PROPERTIES[i];
    const value = obj[prop];
    // Typed arrays must be converted to plain arrays for JSON.stringify,
    // which otherwise serializes them as objects ({0: v, 1: v, ...}).
    state[prop] = ArrayBuffer.isView(value) ? Array.from(value) : value;
  }
  return state;
}
