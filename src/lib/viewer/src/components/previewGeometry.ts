export type PreviewOverlayGeometryInput = {
  elementRect: DOMRect;
  iframeRect: DOMRect;
  canvasRect: DOMRect;
  iframeViewportWidth: number;
  iframeViewportHeight: number;
};

export function computePreviewOverlayRect({
  elementRect,
  iframeRect,
  canvasRect,
  iframeViewportWidth,
  iframeViewportHeight,
}: PreviewOverlayGeometryInput) {
  const scaleX = iframeViewportWidth > 0 ? iframeRect.width / iframeViewportWidth : 1;
  const scaleY = iframeViewportHeight > 0 ? iframeRect.height / iframeViewportHeight : 1;
  const borderCompensation = 2;

  return {
    left: Math.max(iframeRect.left - canvasRect.left + (elementRect.left * scaleX) - borderCompensation / 2, 0),
    top: Math.max(iframeRect.top - canvasRect.top + (elementRect.top * scaleY) - borderCompensation / 2, 0),
    width: elementRect.width * scaleX + borderCompensation,
    height: elementRect.height * scaleY + borderCompensation,
  };
}
