import qrcode from 'qrcode-generator';

/**
 * `qrcode-generator` is the upstream package for the copy of it that used to be
 * vendored in `app/qrcode.js`, so the output is unchanged.
 */
export function QrCode({ url }: { url: string }) {
  const gen = qrcode(0, 'L');
  gen.addData(url);
  gen.make();
  return (
    <span
      // biome-ignore lint/security/noDangerouslySetInnerHtml: generated SVG
      dangerouslySetInnerHTML={{ __html: gen.createSvgTag({ scalable: true }) }}
    />
  );
}
