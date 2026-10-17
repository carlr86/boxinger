#!/usr/bin/env python3
"""Export an HTML piece to PNG at an exact size.

Usage:
  python3 render.py pieza.html pieza.png --width 1080 --height 1080 [--scale 2] [--wait 8000]

Uses Google Chrome / Chromium in headless mode, or Playwright when no browser binary is found.
The page should set `body { width: <width>px; height: <height>px; margin: 0 }` so nothing scrolls.
"""
import argparse
import os
import shutil
import subprocess
import sys

CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge',
]


def find_browser():
    for c in CANDIDATES:
        path = c if os.path.isabs(c) else shutil.which(c)
        if path and os.path.exists(path):
            return path
    return None


def with_chrome(browser, html, out, w, h, scale, wait):
    cmd = [browser, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
           f'--window-size={w},{h}', f'--force-device-scale-factor={scale}',
           f'--virtual-time-budget={wait}', '--allow-file-access-from-files',
           f'--screenshot={out}', 'file://' + html]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    return os.path.exists(out)


def with_playwright(html, out, w, h, scale, wait):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=scale)
        page.goto('file://' + html)
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(min(wait, 3000))
        page.screenshot(path=out)
        b.close()
    return os.path.exists(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('html')
    ap.add_argument('out')
    ap.add_argument('--width', type=int, required=True)
    ap.add_argument('--height', type=int, required=True)
    ap.add_argument('--scale', type=float, default=1)
    ap.add_argument('--wait', type=int, default=8000, help='ms to let fonts and images load')
    a = ap.parse_args()
    html, out = os.path.abspath(a.html), os.path.abspath(a.out)
    if os.path.exists(out):
        os.remove(out)  # so a failed render never leaves an old image behind
    browser = find_browser()
    ok = with_chrome(browser, html, out, a.width, a.height, a.scale, a.wait) if browser else False
    if not ok:
        ok = with_playwright(html, out, a.width, a.height, a.scale, a.wait)
    if not ok:
        sys.exit('No pude exportar: instalá Google Chrome o Chromium, o `pip install playwright && playwright install chromium`.')
    print(f'{out} ({int(a.width * a.scale)} x {int(a.height * a.scale)})')


if __name__ == '__main__':
    main()
