// @ts-check

/**
 * @typedef {import('types').BroadcastTag} BroadcastTag
 */

/**
 * Provide a growable array of values. It works like rust's Vec. This is to attempt
 * to mitigate the costs of using native arrays and structured cloning. Hopefully
 * the locality of typed arrays will help here.
 *
 * @template {import("types").TypedArray} ArrayType
 */
export class GrowableArray {
  /**
   * @param {ArrayType} dataType
   * @param {number} capacity
   */
  constructor(dataType, capacity) {
    this.dataType = dataType;
    this.length = 0;
    this.capacity = capacity;
    this._array = new dataType(capacity);
  }

  /**
   * @param {number} value
   */
  push(value) {
    if (this.length === this.capacity) {
      this.capacity *= 2;
      const newArray = new this.dataType(this.capacity);
      for (let i = 0; i < this._array.length; i++) {
        // Copy over the values.
        newArray[i] = this._array[i];
      }
      this._array = newArray;
    }
    this._array[this.length] = value;
    this.length++;
  }

  reset() {
    this.length = 0;
  }

  /**
   * @returns {InstanceType<ArrayType>}
   */
  getCopy() {
    // @ts-ignore - Not sure why this is happening.
    return this._array.slice(0, this.length);
  }
}

/**
 * @type {BroadcastTag[]}
 */
const broadcastTags = ['broadcast-tick', 'player-update'];
/** @type {Map<BroadcastTag, number>}  */
const broadcastTagToIndex = new Map();
for (let tagIndex = 0; tagIndex < broadcastTags.length; tagIndex++) {
  broadcastTagToIndex.set(broadcastTags[tagIndex], tagIndex);
}

/**
 * Access, read, and write byte information from a Uint8Array in a variety of formats.
 *
 * @template {import("types").TypedArray} ArrayType
 */
class ByteAccessor {
  /**
   * @param {ArrayType} dataType
   */
  constructor(dataType) {
    this.array = new dataType(1);
    this.bytes = new Uint8Array(this.array.buffer);
  }

  /**
   * @param {GrowableArray<typeof Uint8Array>} growableBuffer
   * @param {number} value
   */
  write(growableBuffer, value) {
    this.array[0] = value;
    for (const byte of this.bytes) {
      growableBuffer.push(byte);
    }
  }

  /**
   * @returns {number}
   */
  byteSize() {
    return this.bytes.length;
  }

  /**
   * @param {Uint8Array} buffer
   * @param {number} byteOffset
   * @returns {number} value
   */
  read(buffer, byteOffset) {
    // Copy the bytes to the local ArrayBuffer.
    for (let i = 0; i < this.bytes.length; i++) {
      this.bytes[i] = buffer[i + byteOffset];
    }
    return this.array[0];
  }
}

export class BinaryWriter {
  /**
   * @private
   */
  data = new GrowableArray(Uint8Array, 1024);
  int8 = new ByteAccessor(Int8Array);
  uint8 = new ByteAccessor(Uint8Array);
  int16 = new ByteAccessor(Int16Array);
  uint16 = new ByteAccessor(Uint16Array);
  int32 = new ByteAccessor(Int32Array);
  uint32 = new ByteAccessor(Uint32Array);
  float32 = new ByteAccessor(Float32Array);
  float64 = new ByteAccessor(Float64Array);

  /**
   * Gets a copy of the data, and resets the internal buffer to length 0, without
   * de-allocating any memory.
   */
  finalize() {
    const data = this.data.getCopy();
    this.data.reset();
    return data;
  }

  /**
   * This tags the message type so the client can know how to process the message.
   *
   * @param {BroadcastTag} tag
   */
  writeTag(tag) {
    this.writeByte(ensureExists(broadcastTagToIndex.get(tag)));
  }

  /** @param {number} byte */
  writeByte(byte) {
    this.data.push(byte);
  }

  /** @param {number} value */
  writeInt8(value) {
    this.int8.write(this.data, value);
  }

  /** @param {number} value */
  writeUint8(value) {
    this.uint8.write(this.data, value);
  }

  /** @param {number} value */
  writeInt16(value) {
    this.int16.write(this.data, value);
  }

  /** @param {number} value */
  writeUint16(value) {
    this.uint16.write(this.data, value);
  }

  /** @param {number} value */
  writeInt32(value) {
    this.int32.write(this.data, value);
  }

  /** @param {number} value */
  writeUint32(value) {
    this.uint32.write(this.data, value);
  }

  /** @param {number} value */
  writeFloat32(value) {
    this.float32.write(this.data, value);
  }

  /** @param {number} value */
  writeFloat64(value) {
    this.float64.write(this.data, value);
  }
}

export class BinaryReader {
  /**
   * @param {Uint8Array | Buffer} buffer
   */
  constructor(buffer) {
    /** @private */
    this.buffer = buffer;
  }
  byteOffset = 0;
  int8 = new ByteAccessor(Int8Array);
  uint8 = new ByteAccessor(Uint8Array);
  int16 = new ByteAccessor(Int16Array);
  uint16 = new ByteAccessor(Uint16Array);
  int32 = new ByteAccessor(Int32Array);
  uint32 = new ByteAccessor(Uint32Array);
  float32 = new ByteAccessor(Float32Array);
  float64 = new ByteAccessor(Float64Array);

  /**
   * This tags the message type so the client can know how to process the message.
   *
   * @returns {BroadcastTag}
   */
  readTag() {
    const number = this.readByte();
    const tag = broadcastTags[number];
    if (!tag) {
      throw new Error('Unable to find a tag given the byte: ' + number);
    }
    return tag;
  }

  /** @returns {number} */
  readByte() {
    const value = this.buffer[this.byteOffset];
    this.byteOffset++;
    return value;
  }

  /** @returns {number} */
  readInt8() {
    const value = this.int8.read(this.buffer, this.byteOffset);
    this.byteOffset += this.int8.byteSize();
    return value;
  }

  /** @returns {number} */
  readUint8() {
    const value = this.uint8.read(this.buffer, this.byteOffset);
    this.byteOffset += this.uint8.byteSize();
    return value;
  }

  /** @returns {number} */
  readInt16() {
    const value = this.int16.read(this.buffer, this.byteOffset);
    this.byteOffset += this.int16.byteSize();
    return value;
  }

  /** @returns {number} */
  readUint16() {
    const value = this.uint16.read(this.buffer, this.byteOffset);
    this.byteOffset += this.uint16.byteSize();
    return value;
  }

  /** @returns {number} */
  readInt32() {
    const value = this.int32.read(this.buffer, this.byteOffset);
    this.byteOffset += this.int32.byteSize();
    return value;
  }

  /** @returns {number} */
  readUint32() {
    const value = this.uint32.read(this.buffer, this.byteOffset);
    this.byteOffset += this.uint32.byteSize();
    return value;
  }

  /** @returns {number} */
  readFloat32() {
    const value = this.float32.read(this.buffer, this.byteOffset);
    this.byteOffset += this.float32.byteSize();
    return value;
  }

  /** @returns {number} */
  readFloat64() {
    const value = this.float64.read(this.buffer, this.byteOffset);
    this.byteOffset += this.float64.byteSize();
    return value;
  }
}

/** @type {{[name: string]: boolean}} */
const hasRunOnce = {};

/**
 * @param {string} name
 * @param {() => void} fn
 */
export function doOnce(name, fn) {
  if (hasRunOnce[name]) {
    return;
  }
  fn();
  hasRunOnce[name] = true;
}

{
  // Test that this system is big endian.
  const uint16 = new Uint16Array(1);
  uint16[0] = 0xaabb;
  const uint8 = new Uint8Array(uint16.buffer);
  if (uint8[0] !== 0xbb) {
    throw new Error(
      'The binary messaging system assumes big endian. Little endian support needs to ' +
        'be added to support this system.'
    );
  }
}

/**
 * @template T
 * @param {T | null | undefined} item
 * @param {string} [message]
 * @returns {T}
 */
export function ensureExists(item, message) {
  if (item === null) {
    throw new Error(
      message || 'Attempted to get a value assumed non-null, but it was null.'
    );
  }
  if (item === undefined) {
    throw new Error(
      message || 'Attempted to get a defined value, but it was undefined.'
    );
  }
  return item;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function setDebugGlobal(key, value) {
  console.log('Global: ' + key);
  // @ts-ignore
  window[key] = value;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

/**
 * @param {number} p
 * @param {number} q
 * @param {number} t
 */
function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * @param {number} h
 * @param {number} s
 * @param {number} l
 */
export function hsl(h, s, l) {
  var r, g, b;

  // achromatic
  if (s === 0) {
    r = g = b = l;
  } else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  var r255 = (r * 255) | 0;
  var g255 = (g * 255) | 0;
  var b255 = (b * 255) | 0;

  return (r255 << 16) | (g255 << 8) | b255;
}
