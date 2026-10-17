'use client';
// Idea images: shrunk and re-encoded in the browser before upload (≈1600 px and a ≈480 px thumbnail, WebP or JPEG),
// which keeps storage tiny and drops GPS and other hidden data from photos. They live in the private bucket
// "idea-images" (see supabase/migrations/…052_idea_images.sql) and are shown through signed URLs.
import { supabaseBrowser } from '@/lib/supabase/browser';

const BUCKET = 'idea-images';
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const FULL = 1600, THUMB = 480;

export type PreparedImage = { full: Blob; thumb: Blob; ext: 'webp' | 'jpg' };

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
}

async function encode(src: ImageBitmap, max: number, webp: boolean): Promise<Blob> {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; // transparent PNGs get a white background in JPEG
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  const b = await toBlob(c, webp ? 'image/webp' : 'image/jpeg', webp ? 0.8 : 0.82);
  if (!b) throw new Error('encode');
  return b;
}

/** Checks, shrinks and re-encodes a picked image. Throws 'type', 'size' or 'read'. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('type');
  if (file.size > MAX_INPUT_BYTES) throw new Error('size');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('read'); }
  try {
    // Safari can't encode WebP: it hands back a PNG instead, so fall back to JPEG.
    let full = await encode(bmp, FULL, true);
    const webp = full.type === 'image/webp';
    if (!webp) full = await encode(bmp, FULL, false);
    const thumb = await encode(bmp, THUMB, webp);
    return { full, thumb, ext: webp ? 'webp' : 'jpg' };
  } finally { bmp.close(); }
}

export const thumbPath = (p: string) => p.replace(/(\.[a-z]+)$/, '-t$1');

/** Uploads both sizes to <board>/<uuid>.<ext> and returns the path to save on the idea. */
export async function uploadIdeaImage(boardId: string, img: PreparedImage): Promise<string> {
  const sb = supabaseBrowser();
  const path = `${boardId}/${crypto.randomUUID().replace(/-/g, '')}.${img.ext}`;
  const type = img.ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const a = await sb.storage.from(BUCKET).upload(path, img.full, { contentType: type, cacheControl: '31536000' });
  if (a.error) throw a.error;
  const b = await sb.storage.from(BUCKET).upload(thumbPath(path), img.thumb, { contentType: type, cacheControl: '31536000' });
  if (b.error) throw b.error;
  return path;
}

// Signed URLs (1 hour), remembered so the same image isn't asked for twice.
const cache = new Map<string, { url: string; until: number }>();
export async function signedImageUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
