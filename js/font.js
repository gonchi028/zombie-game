// Tiny 3x5 bitmap font for crisp in-world text. Each glyph = 5 rows, each row an octal digit (3 bits).
const GLYPHS = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755',
  I: '72227', J: '11152', K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644',
  Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
  Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616',
  6: '34652', 7: '71222', 8: '25252', 9: '25316', '+': '02720', '-': '00700', '!': '22202',
  '.': '00002', ':': '02020', ';': '02024', '/': '11244', '%': '51245', x: '05250', ' ': '00000', '?': '61202',
};

const cache = new Map();

function glyphCanvas(ch, color) {
  const key = ch + color;
  let c = cache.get(key);
  if (c) return c;
  const rows = GLYPHS[ch] || GLYPHS['?'];
  c = document.createElement('canvas');
  c.width = 3;
  c.height = 5;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let y = 0; y < 5; y++) {
    const bits = parseInt(rows[y], 8);
    for (let x = 0; x < 3; x++) if (bits & (4 >> x)) g.fillRect(x, y, 1, 1);
  }
  cache.set(key, c);
  return c;
}

export function textWidth(str) {
  return str.length * 4 - 1;
}

export function drawText(ctx, str, x, y, color = '#fff', align = 'left', shadow = '#000') {
  str = String(str).toUpperCase().replace(/X(?=\d)/g, 'x');
  const w = textWidth(str);
  let sx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  y = Math.round(y);
  for (const ch of str) {
    if (ch !== ' ') {
      if (shadow) ctx.drawImage(glyphCanvas(ch, shadow), sx + 1, y + 1);
      ctx.drawImage(glyphCanvas(ch, color), sx, y);
    }
    sx += 4;
  }
}
