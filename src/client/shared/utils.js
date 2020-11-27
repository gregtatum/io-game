// @ts-check

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

const broadcastTags = {
  tick: 0,
};
const byteToBroadcastTag = new Map();
for (const [key, value] of Object.entries(broadcastTags)) {
  byteToBroadcastTag.set(value, key);
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
   * @param {keyof typeof broadcastTags} tag
   */
  writeTag(tag) {
    this.writeByte(broadcastTags[tag]);
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
   * @param {Uint8Array} buffer
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
   * @returns {keyof typeof broadcastTags}
   */
  readTag() {
    const number = this.readByte();
    const tag = byteToBroadcastTag.get(number);
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
