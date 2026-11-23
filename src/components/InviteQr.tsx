// A QR code for the house invite link, so housemates in the same room can scan instead of
// pasting. The encoder (`qrcode-generator`) is loaded only when the code is first shown.
import { useEffect, useState } from "react";

const QUIET_ZONE = 4; // blank modules round the edge; scanners need them

/** One SVG path with a 1×1 square per dark module (much lighter than a <rect> each). */
async function qrPath(text: string): Promise<{ size: number; path: string }> {
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "M"); // 0 = smallest version that fits; M = medium error correction
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE},${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { size: count + QUIET_ZONE * 2, path };
}

export default function InviteQr({ link }: { link: string }) {
  const [code, setCode] = useState<{ link: string; size: number; path: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    qrPath(link)
      .then((result) => {
        if (!cancelled) setCode({ link, ...result });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (failed) return <p className="dialog-note">The QR code couldn’t be made. Copy the link instead.</p>;
  if (!code || code.link !== link) return <div className="invite-qr invite-qr-loading" role="status">Making the code…</div>;
  return (
    // Always dark on white, even in dark mode: many scanners can't read light-on-dark codes.
    <svg
      className="invite-qr"
      viewBox={`0 0 ${code.size} ${code.size}`}
      role="img"
      aria-label="QR code of the invite link"
      shapeRendering="crispEdges"
    >
      <rect width={code.size} height={code.size} fill="#fff" />
      <path d={code.path} fill="#111" />
    </svg>
  );
}
