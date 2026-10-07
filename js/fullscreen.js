// Fullscreen, with the webkit-prefixed API older iPads still need. iPhones can't make a web page
// fullscreen at all; there the game has to be added to the Home Screen (see the manifest), and the
// fullscreen button explains how instead.
const root = document.documentElement;

export const fullscreenSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

// Launched from the Home Screen: already fullscreen, so the button has nothing to do.
export const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;

export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

// Must run inside a tap or click: browsers only allow fullscreen from a user gesture.
export function toggleFullscreen() {
  if (!fullscreenSupported) return;
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  // the prefixed version returns nothing instead of a promise
  Promise.resolve(request.call(root, { navigationUI: 'hide' }))
    // phones: also try to hold landscape (Android allows it once fullscreen; elsewhere it's a no-op)
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

export function onFullscreenChange(fn) {
  document.addEventListener('fullscreenchange', () => fn(isFullscreen()));
  document.addEventListener('webkitfullscreenchange', () => fn(isFullscreen()));
}
