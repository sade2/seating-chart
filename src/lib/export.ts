import { jsPDF } from 'jspdf'
import type { Project } from '../types'
import {
  getSeatPositions,
  getTableHalfW,
  getTableHalfH,
  getLabelY,
  SEAT_SCREEN_R,
} from './tableGeometry'

// Export at 2× the screen PPF (20) for crisp output
const EXPORT_PPF = 40
const SEAT_R = SEAT_SCREEN_R * (EXPORT_PPF / 20)  // 16px
const PAD = 48  // px padding around room

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
}

function buildExportSVG(project: Project): { svg: string; width: number; height: number } {
  const { room, tables, guests } = project
  const W = room.widthFt * EXPORT_PPF + PAD * 2
  const H = room.heightFt * EXPORT_PPF + PAD * 2

  const guestNameMap: Record<string, string> = {}
  for (const g of guests) {
    if (g.seatId) guestNameMap[g.seatId] = g.name
  }

  const tableEls = tables.map((table) => {
    const cx = table.x * EXPORT_PPF + PAD
    const cy = table.y * EXPORT_PPF + PAD
    const halfW = getTableHalfW(table, EXPORT_PPF)
    const halfH = getTableHalfH(table, EXPORT_PPF)
    const seatPositions = getSeatPositions(table, EXPORT_PPF)
    const labelY = getLabelY(table, EXPORT_PPF)

    const body =
      table.type === 'round'
        ? `<circle r="${halfW}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>`
        : `<rect x="${-halfW}" y="${-halfH}" width="${halfW * 2}" height="${halfH * 2}" rx="3" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>`

    const seatEls = seatPositions
      .map((pos, i) => {
        const seat = table.seats[i]
        if (!seat) return ''
        const isOccupied = seat.guestId !== null
        const fill = isOccupied ? '#6366f1' : '#d1d5db'
        const stroke = '#9ca3af'
        const textEl =
          isOccupied && guestNameMap[seat.id]
            ? `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" ` +
              `font-size="${SEAT_R * 0.85}" fill="white" font-family="Arial, sans-serif" font-weight="bold">` +
              `${escapeXml(getInitials(guestNameMap[seat.id]))}</text>`
            : ''
        return (
          `<circle cx="${pos.x}" cy="${pos.y}" r="${SEAT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>` +
          textEl
        )
      })
      .join('')

    const label =
      `<text x="0" y="${labelY}" text-anchor="middle" ` +
      `font-size="11" fill="#64748b" font-family="Arial, sans-serif">` +
      `${escapeXml(table.label)}</text>`

    return `<g transform="translate(${cx},${cy}) rotate(${table.rotation})">${body}${seatEls}${label}</g>`
  })

  const roomRect =
    `<rect x="${PAD}" y="${PAD}" width="${room.widthFt * EXPORT_PPF}" height="${room.heightFt * EXPORT_PPF}" ` +
    `fill="white" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 5"/>`

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#f1f5f9"/>` +
    roomRect +
    tableEls.join('') +
    `</svg>`

  return { svg, width: W, height: H }
}

function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // 2× for retina-quality output
      canvas.width = width * 2
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error('Failed to render SVG for export'))
    img.src = dataUrl
  })
}

export async function exportToPNG(project: Project): Promise<void> {
  const { svg, width, height } = buildExportSVG(project)
  const canvas = await svgToCanvas(svg, width, height)
  const dataUrl = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'seating-chart.png'
  a.click()
}

export async function exportToPDF(project: Project): Promise<void> {
  const { svg, width, height } = buildExportSVG(project)
  const canvas = await svgToCanvas(svg, width, height)
  const imgData = canvas.toDataURL('image/png')

  const landscape = width >= height
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 15

  // Title
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.setTextColor(30, 41, 59)   // slate-800
  pdf.text(project.name, margin, margin + 6)

  // Date
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(100, 116, 139)  // slate-500
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  pdf.text(dateStr, margin, margin + 13)

  // Image — fill the remaining page area, centred
  const imgTop = margin + 20
  const imgAreaW = pageW - margin * 2
  const imgAreaH = pageH - imgTop - margin
  const aspect = width / height
  let imgW = imgAreaW
  let imgH = imgW / aspect
  if (imgH > imgAreaH) {
    imgH = imgAreaH
    imgW = imgH * aspect
  }
  const imgX = margin + (imgAreaW - imgW) / 2

  pdf.addImage(imgData, 'PNG', imgX, imgTop, imgW, imgH)
  pdf.save('seating-chart.pdf')
}
