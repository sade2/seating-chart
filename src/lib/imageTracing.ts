import { loadFromCanvas } from 'potrace-wasm'

const MAX_SIZE = 4000

export async function traceImage(
  file: File,
  threshold: number,
): Promise<{ paths: { d: string }[]; viewBox: { width: number; height: number }; svgTransform: string }> {
  const bitmap = await createImageBitmap(file)

  // Resize if too large to prevent memory issues
  let w = bitmap.width
  let h = bitmap.height
  if (w > MAX_SIZE || h > MAX_SIZE) {
    const scale = MAX_SIZE / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  // Grayscale + threshold to clean B&W
  const imageData = ctx.getImageData(0, 0, w, h)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const v = gray < threshold ? 0 : 255
    data[i] = data[i + 1] = data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)

  const svgString = await loadFromCanvas(canvas)

  // Potrace outputs paths in its own coordinate space (10× pixel size, Y-flipped).
  // The <g transform> in the output SVG maps back to image-pixel space.
  // We store that transform so renderers can apply it correctly.
  const svgTransform = extractGroupTransform(svgString)
  const paths = extractPaths(svgString)

  return { paths, viewBox: { width: w, height: h }, svgTransform }
}

function extractGroupTransform(svg: string): string {
  const match = svg.match(/<g[^>]*transform="([^"]+)"/)
  return match ? match[1] : 'scale(1)'
}

function extractPaths(svg: string): { d: string }[] {
  const paths: { d: string }[] = []
  const regex = /\bd="([^"]+)"/g
  let match
  while ((match = regex.exec(svg)) !== null) {
    paths.push({ d: match[1] })
  }
  return paths
}
