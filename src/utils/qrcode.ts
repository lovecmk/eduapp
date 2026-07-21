// 순수 TypeScript QR 코드 인코더 — 외부 의존성 없음.
// 고전 라이브러리(Kazuhiko Arase, MIT)를 이 앱에 맞게 TypeScript 로 이식하고
// 한글이 깨지지 않도록 입력을 UTF-8 바이트로 인코딩하도록 보완했다.
//
// 사용: const matrix = generateQR('https://...', 'M'); // boolean[][] (true=검은 모듈)
// 렌더는 src/components/ui/QRCode.tsx 가 react-native-svg 로 그린다.

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

const EC_LEVEL: Record<ErrorCorrectionLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };
const MODE_8BIT_BYTE = 1 << 2;

// ── GF(256) 로그/지수 테이블 ──────────────────────────────────────────────
const EXP_TABLE = new Array<number>(256);
const LOG_TABLE = new Array<number>(256);
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

function glog(n: number): number {
  if (n < 1) throw new Error(`glog(${n})`);
  return LOG_TABLE[n];
}
function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP_TABLE[n];
}

// ── 다항식(RS) ───────────────────────────────────────────────────────────
class Polynomial {
  num: number[];
  constructor(num: number[], shift: number) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  get(i: number) {
    return this.num[i];
  }
  get length() {
    return this.num.length;
  }
  multiply(e: Polynomial): Polynomial {
    const num = new Array<number>(this.length + e.length - 1).fill(0);
    for (let i = 0; i < this.length; i++) {
      for (let j = 0; j < e.length; j++) {
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
      }
    }
    return new Polynomial(num, 0);
  }
  mod(e: Polynomial): Polynomial {
    if (this.length - e.length < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = this.num.slice();
    for (let i = 0; i < e.length; i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  }
}

function errorCorrectPolynomial(ecLength: number): Polynomial {
  let a = new Polynomial([1], 0);
  for (let i = 0; i < ecLength; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
  return a;
}

// ── 비트 버퍼 ────────────────────────────────────────────────────────────
class BitBuffer {
  buffer: number[] = [];
  length = 0;
  put(num: number, len: number) {
    for (let i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1);
  }
  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= 0x80 >>> this.length % 8;
    this.length++;
  }
}

// ── RS 블록 테이블(버전 1~40 × L/M/Q/H) ──────────────────────────────────
// 각 항목: [블록수, 총코드워드, 데이터코드워드, (2그룹이면 반복)]
const RS_BLOCK_TABLE: number[][] = [
  [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
  [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
  [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
  [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
  [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
  [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
  [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
  [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
  [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
  [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
  [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
  [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
  [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
  [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
  [5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12],
  [5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
  [1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
  [5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
  [3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
  [3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
  [4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
  [2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
  [4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
  [6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
  [8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
  [10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
  [8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
  [3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
  [7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
  [5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
  [13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
  [17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
  [17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
  [13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
  [12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
  [6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
  [17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
  [4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
  [20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
  [19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16],
];

interface RSBlock {
  totalCount: number;
  dataCount: number;
}

// RS 블록 테이블은 L,M,Q,H 순으로 배열돼 있으나, QR 규격의 오류정정 수치 코드는
// M=0,L=1,H=2,Q=3 이라 순서가 다르다. 수치 코드 → 테이블 행 오프셋으로 변환한다.
const EC_TABLE_OFFSET: Record<number, number> = { 1: 0, 0: 1, 3: 2, 2: 3 };

function getRSBlocks(typeNumber: number, ecLevel: number): RSBlock[] {
  const rsBlock = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + EC_TABLE_OFFSET[ecLevel]];
  if (!rsBlock) throw new Error(`bad rs block @ v${typeNumber}/ec${ecLevel}`);
  const list: RSBlock[] = [];
  const groups = rsBlock.length / 3;
  for (let i = 0; i < groups; i++) {
    const count = rsBlock[i * 3];
    const totalCount = rsBlock[i * 3 + 1];
    const dataCount = rsBlock[i * 3 + 2];
    for (let j = 0; j < count; j++) list.push({ totalCount, dataCount });
  }
  return list;
}

// ── 얼라인먼트 패턴 좌표 ─────────────────────────────────────────────────
const PATTERN_POSITION_TABLE: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

function bchDigit(data: number): number {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}
function bchTypeInfo(data: number): number {
  let d = data << 10;
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((data << 10) | d) ^ G15_MASK;
}
function bchTypeNumber(data: number): number {
  let d = data << 12;
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
  return (data << 12) | d;
}

function lengthInBits(type: number): number {
  // 8bit byte 모드 기준 문자수 지시자 비트폭.
  if (type < 10) return 8;
  if (type < 27) return 16;
  return 16;
}

function maskFn(pattern: number, i: number, j: number): boolean {
  switch (pattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default: throw new Error(`bad mask:${pattern}`);
  }
}

// ── UTF-8 인코딩(한글 지원) ──────────────────────────────────────────────
function toUtf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 서로게이트 페어(이모지 등)
      const hi = code;
      const lo = str.charCodeAt(++i);
      code = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

const PAD0 = 0xec;
const PAD1 = 0x11;

class QRCodeModel {
  typeNumber: number;
  ecLevel: number;
  modules: (boolean | null)[][] = [];
  moduleCount = 0;
  private dataBytes: number[];
  private dataCache: number[] | null = null;

  constructor(text: string, ecLevel: number) {
    this.dataBytes = toUtf8Bytes(text);
    this.ecLevel = ecLevel;
    this.typeNumber = this.pickTypeNumber();
  }

  private totalDataCount(type: number): number {
    return getRSBlocks(type, this.ecLevel).reduce((sum, b) => sum + b.dataCount, 0);
  }

  private bitLengthFor(type: number): number {
    // 4(모드) + 문자수지시자 + 데이터바이트*8
    return 4 + lengthInBits(type) + this.dataBytes.length * 8;
  }

  private pickTypeNumber(): number {
    for (let type = 1; type <= 40; type++) {
      if (this.bitLengthFor(type) <= this.totalDataCount(type) * 8) return type;
    }
    throw new Error('데이터가 너무 큽니다(QR 용량 초과)');
  }

  isDark(row: number, col: number): boolean {
    return this.modules[row][col] === true;
  }

  make() {
    this.makeImpl(false, this.bestMaskPattern());
  }

  private makeImpl(test: boolean, maskPattern: number) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = Array.from({ length: this.moduleCount }, () =>
      new Array<boolean | null>(this.moduleCount).fill(null),
    );
    this.setupPositionProbe(0, 0);
    this.setupPositionProbe(this.moduleCount - 7, 0);
    this.setupPositionProbe(0, this.moduleCount - 7);
    this.setupPositionAdjust();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache === null) this.dataCache = this.createData();
    this.mapData(this.dataCache, maskPattern);
  }

  private setupPositionProbe(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        const dark =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        this.modules[row + r][col + c] = dark;
      }
    }
  }

  private setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] !== null) continue;
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] !== null) continue;
      this.modules[6][c] = c % 2 === 0;
    }
  }

  private setupPositionAdjust() {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            this.modules[row + r][col + c] =
              Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          }
        }
      }
    }
  }

  private setupTypeNumber(test: boolean) {
    const bits = bchTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  private setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (this.ecLevel << 3) | maskPattern;
    const bits = bchTypeInfo(data);
    for (let v = 0; v < 15; v++) {
      const mod = !test && ((bits >> v) & 1) === 1;
      if (v < 6) this.modules[v][8] = mod;
      else if (v < 8) this.modules[v + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + v][8] = mod;
    }
    for (let h = 0; h < 15; h++) {
      const mod = !test && ((bits >> h) & 1) === 1;
      if (h < 8) this.modules[8][this.moduleCount - h - 1] = mod;
      else if (h < 9) this.modules[8][15 - h - 1 + 1] = mod;
      else this.modules[8][15 - h - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }

  private mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] === null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            }
            if (maskFn(maskPattern, row, col - c)) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }

  private createData(): number[] {
    const rsBlocks = getRSBlocks(this.typeNumber, this.ecLevel);
    const buffer = new BitBuffer();
    buffer.put(MODE_8BIT_BYTE, 4);
    buffer.put(this.dataBytes.length, lengthInBits(this.typeNumber));
    for (const b of this.dataBytes) buffer.put(b, 8);

    const totalDataCount = rsBlocks.reduce((s, b) => s + b.dataCount, 0);
    if (buffer.length > totalDataCount * 8) {
      throw new Error(`code length overflow (${buffer.length}>${totalDataCount * 8})`);
    }
    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    for (;;) {
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.length >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return this.createBytes(buffer, rsBlocks);
  }

  private createBytes(buffer: BitBuffer, rsBlocks: RSBlock[]): number[] {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata: number[][] = new Array(rsBlocks.length);
    const ecdata: number[][] = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcCount; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      offset += dcCount;
      const rsPoly = errorCorrectPolynomial(ecCount);
      const rawPoly = new Polynomial(dcdata[r], rsPoly.length - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.length - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.length - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }
    const totalCodeCount = rsBlocks.reduce((s, b) => s + b.totalCount, 0);
    const data = new Array<number>(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
    }
    return data;
  }

  private lostPoint(): number {
    const count = this.moduleCount;
    let lost = 0;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        let sameCount = 0;
        const dark = this.isDark(row, col);
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || count <= row + r) continue;
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || count <= col + c) continue;
            if (r === 0 && c === 0) continue;
            if (dark === this.isDark(row + r, col + c)) sameCount++;
          }
        }
        if (sameCount > 5) lost += 3 + sameCount - 5;
      }
    }
    for (let row = 0; row < count - 1; row++) {
      for (let col = 0; col < count - 1; col++) {
        let c = 0;
        if (this.isDark(row, col)) c++;
        if (this.isDark(row + 1, col)) c++;
        if (this.isDark(row, col + 1)) c++;
        if (this.isDark(row + 1, col + 1)) c++;
        if (c === 0 || c === 4) lost += 3;
      }
    }
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count - 6; col++) {
        if (
          this.isDark(row, col) && !this.isDark(row, col + 1) && this.isDark(row, col + 2) &&
          this.isDark(row, col + 3) && this.isDark(row, col + 4) && !this.isDark(row, col + 5) &&
          this.isDark(row, col + 6)
        ) lost += 40;
      }
    }
    for (let col = 0; col < count; col++) {
      for (let row = 0; row < count - 6; row++) {
        if (
          this.isDark(row, col) && !this.isDark(row + 1, col) && this.isDark(row + 2, col) &&
          this.isDark(row + 3, col) && this.isDark(row + 4, col) && !this.isDark(row + 5, col) &&
          this.isDark(row + 6, col)
        ) lost += 40;
      }
    }
    let darkCount = 0;
    for (let col = 0; col < count; col++) {
      for (let row = 0; row < count; row++) if (this.isDark(row, col)) darkCount++;
    }
    const ratio = Math.abs((100 * darkCount) / count / count - 50) / 5;
    lost += ratio * 10;
    return lost;
  }

  private bestMaskPattern(): number {
    let minLost = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i);
      const lost = this.lostPoint();
      if (i === 0 || lost < minLost) {
        minLost = lost;
        pattern = i;
      }
    }
    return pattern;
  }
}

/**
 * 텍스트를 QR 모듈 행렬(boolean[][], true=검정)로 인코딩한다.
 * @param text 인코딩할 문자열(UTF-8, 한글 지원)
 * @param ecLevel 오류정정 레벨(기본 M). 로고를 얹으려면 H 권장.
 */
export function generateQR(text: string, ecLevel: ErrorCorrectionLevel = 'M'): boolean[][] {
  const model = new QRCodeModel(text, EC_LEVEL[ecLevel]);
  model.make();
  return model.modules.map((row) => row.map((cell) => cell === true));
}
