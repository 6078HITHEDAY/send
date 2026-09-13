import { asset, brandedAsset } from './assets.ts';
import { WEB_UI } from './globals.ts';

const SIZE = 32;
const LOADER_WIDTH = 5;

function drawCircle(
  context: CanvasRenderingContext2D,
  color: string,
  percent: number
) {
  const radius = (SIZE - LOADER_WIDTH) * 0.5;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2 * percent, false);
  context.strokeStyle = color;
  context.lineCap = 'square';
  context.lineWidth = LOADER_WIDTH;
  context.stroke();
}

function drawNewFavicon(progressRatio: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }
  context.translate(SIZE * 0.5, SIZE * 0.5);
  context.rotate(-Math.PI * 0.5);
  drawCircle(context, '#efefef', 1);
  drawCircle(context, WEB_UI.COLORS.PRIMARY, progressRatio);
  return canvas.toDataURL();
}

/** Draws the transfer progress into the 32px favicon. */
export function updateFavicon(progressRatio: number) {
  const link = document.querySelector<HTMLLinkElement>(
    "link[rel='icon'][sizes='32x32']"
  );
  if (!link) {
    return;
  }
  const progress = progressRatio * 100;
  if (progress === 0 || progress === 100) {
    link.type = 'image/png';
    link.href = brandedAsset(
      WEB_UI.CUSTOM_ASSETS.favicon_32px,
      'favicon-32x32.png'
    );
    return;
  }
  link.href = drawNewFavicon(progressRatio) || asset('favicon-32x32.png');
}
