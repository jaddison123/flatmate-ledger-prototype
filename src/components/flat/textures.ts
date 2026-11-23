// Text in the 3D flat (whiteboard, TV, doormat, name plates) is drawn on a 2D canvas and used
// as a texture. That keeps it in the scene (it zooms with everything else) and needs no font
// files: it uses the same system fonts as the page.
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

export const HEADING_FONT = 'Impact, "Arial Narrow", sans-serif';
export const BODY_FONT = '"Arial Narrow", Arial, sans-serif';

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * A texture drawn by `draw`, redrawn when `key` changes and freed when no longer used.
 * `key` should capture everything `draw` reads.
 */
export function useCanvasTexture(width: number, height: number, key: string, draw: Draw): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, width, height);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 4;
    return result;
    // `draw` is a new function each render; `key` says when its output actually changes.
  }, [width, height, key]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Shortens `text` with an ellipsis so it fits `maxWidth` in the current font. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}
