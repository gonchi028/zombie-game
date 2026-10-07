// Tiny DOM helpers shared by the menus, HUD and the how-to-play guide.

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Copy a sprite canvas into the DOM, scaled in "game pixels" so it stays crisp at any window size.
export function pix(src, scale = 1, cls = '') {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = `px ${cls}`;
  c.style.width = `calc(var(--s) * ${src.width * scale})`;
  c.style.height = `calc(var(--s) * ${src.height * scale})`;
  return c;
}
