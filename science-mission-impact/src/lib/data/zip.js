import { crc32, deflateRawSync } from 'node:zlib';

/**
 * A one-file ZIP archive (deflate, UTF-8 name). The timestamp is the snapshot date, so an
 * unchanged snapshot zips to identical bytes and an unchanged checksum.
 * ponytail: no ZIP64; fine below 4 GB per file, far above the corpus's ~45 MB.
 */
export function zipOne(name, text, isoDate) {
	const data = Buffer.from(text, 'utf8');
	const packed = deflateRawSync(data); // default level: level 9 saves 0.5% for ~40% more time
	const crc = crc32(data);
	const nameBytes = Buffer.from(name, 'utf8');
	const [year, month, day] = isoDate.split('-').map(Number);
	const dosDate = ((year - 1980) << 9) | (month << 5) | day;
	// version needed, flags (bit 11: UTF-8 name), method 8, time, date, crc, sizes, name length
	const common = (b, at) => {
		b.writeUInt16LE(20, at);
		b.writeUInt16LE(0x0800, at + 2);
		b.writeUInt16LE(8, at + 4);
		b.writeUInt16LE(0, at + 6);
		b.writeUInt16LE(dosDate, at + 8);
		b.writeUInt32LE(crc, at + 10);
		b.writeUInt32LE(packed.length, at + 14);
		b.writeUInt32LE(data.length, at + 18);
		b.writeUInt16LE(nameBytes.length, at + 22);
	};
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	common(local, 4);
	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4); // version made by
	common(central, 6);
	// extra, comment, disk, attributes and the local header's offset (0) stay zero
	const centralSize = central.length + nameBytes.length;
	const centralOffset = local.length + nameBytes.length + packed.length;
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(1, 8);
	end.writeUInt16LE(1, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(centralOffset, 16);
	return Buffer.concat([local, nameBytes, packed, central, nameBytes, end]);
}
