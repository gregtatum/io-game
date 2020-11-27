// @ts-check
import { BinaryWriter, BinaryReader } from '../client/shared/utils.js';

describe('binary writer', () => {
  it('writes bytes', () => {
    const writer = new BinaryWriter();
    writer.writeByte(3);
    writer.writeByte(5);
    writer.writeByte(7);
    expect([...writer.finalize()]).toEqual([3, 5, 7]);
  });

  it('writes uint32s', () => {
    const writer = new BinaryWriter();
    writer.writeUint32(0x00112233);
    writer.writeUint32(0x44556677);
    // prettier-ignore
    expect([...writer.finalize()]).toEqual([
      0x33, 0x22, 0x11, 0x00,
      0x77, 0x66, 0x55, 0x44,
    ]);
  });

  it('writes floats', () => {
    const writer = new BinaryWriter();
    writer.writeFloat32(1.234);
    expect([...writer.finalize()]).toEqual([0xb6, 0xf3, 0x9d, 0x3f]);
  });

  it('writes mixed size types floats', () => {
    const writer = new BinaryWriter();
    writer.writeByte(0xaa);
    writer.writeUint32(0x00112233);
    writer.writeByte(0xbb);
    writer.writeUint32(0x44556677);

    // prettier-ignore
    expect([...writer.finalize()]).toEqual([
      0xaa,
      0x33, 0x22, 0x11, 0x00,
      0xbb,
      0x77, 0x66, 0x55, 0x44,
    ]);
  });
});

describe('binary reader', () => {
  it('reads a variety of values', () => {
    const writer = new BinaryWriter();
    writer.writeByte(0xaa);
    writer.writeTag('tick');
    writer.writeUint32(0x00112233);
    writer.writeByte(0xbb);
    writer.writeUint32(0x44556677);
    writer.writeFloat32(1.234);
    writer.writeFloat64(5.678);
    writer.writeInt8(17);
    writer.writeUint8(0xdd);
    writer.writeInt16(0xee);
    writer.writeUint16(0xff);
    writer.writeInt32(0x11);
    writer.writeUint32(0x22);

    const reader = new BinaryReader(writer.finalize());
    // prettier-ignore
    expect([
      reader.readByte(),
      reader.readTag(),
      reader.readUint32(),
      reader.readByte(),
      reader.readUint32(),
      reader.readFloat32(),
      reader.readFloat64(),
      reader.readInt8(),
      reader.readUint8(),
      reader.readInt16(),
      reader.readUint16(),
      reader.readInt32(),
      reader.readUint32(),
    ]).toEqual([
      0xaa,
      'tick',
      0x00112233,
      0xbb,
      0x44556677,
      1.2339999675750732,
      5.678,
      17,
      0xdd,
      0xee,
      0xff,
      0x11,
      0x22
    ]);
  });
});
