// Next.js calls this when a page change starts (links, router.push/replace, back/forward).
// NavProgress listens for the event and shows the loading bar.
export function onRouterTransitionStart(url: string, navigationType: 'push' | 'replace' | 'traverse') {
  window.dispatchEvent(new CustomEvent('bx:nav-start', { detail: { url, type: navigationType } }));
}
