import { jsPDF } from 'jspdf'
import type { Project } from '../types'
import {
  getSeatPositions,
  getTableHalfW,
  getTableHalfH,
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
  const { room, tables, guests, shapes = [], texts = [] } = project
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
            ? `<g transform="rotate(${-table.rotation}, ${pos.x}, ${pos.y})">` +
              `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" ` +
              `font-size="${SEAT_R * 0.85}" fill="white" font-family="Arial, sans-serif" font-weight="bold">` +
              `${escapeXml(getInitials(guestNameMap[seat.id]))}</text>` +
              `</g>`
            : ''
        return (
          `<circle cx="${pos.x}" cy="${pos.y}" r="${SEAT_R}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>` +
          textEl
        )
      })
      .join('')

    const label =
      `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" ` +
      `font-size="13" fill="#475569" font-family="Arial, sans-serif" font-weight="600">` +
      `${escapeXml(table.label)}</text>`

    return `<g transform="translate(${cx},${cy}) rotate(${table.rotation})">${body}${seatEls}${label}</g>`
  })

  const shapeEls = shapes.map((shape) => {
    const cx = shape.x * EXPORT_PPF + PAD
    const cy = shape.y * EXPORT_PPF + PAD
    const halfW = (shape.widthFt / 2) * EXPORT_PPF
    const halfH = (shape.heightFt / 2) * EXPORT_PPF
    const body = shape.type === 'circle'
      ? `<circle r="${halfW}" fill="${shape.color}" stroke="none" opacity="0.85"/>`
      : `<rect x="${-halfW}" y="${-halfH}" width="${halfW * 2}" height="${halfH * 2}" rx="3" fill="${shape.color}" stroke="none" opacity="0.85"/>`
    const labelEl = shape.label
      ? `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="13" fill="white" font-family="Arial, sans-serif" font-weight="600">${escapeXml(shape.label)}</text>`
      : ''
    return `<g transform="translate(${cx},${cy}) rotate(${shape.rotation})">${body}${labelEl}</g>`
  })

  const textEls = texts.map((text) => {
    const tx = text.x * EXPORT_PPF + PAD
    const ty = text.y * EXPORT_PPF + PAD
    return (
      `<g transform="translate(${tx},${ty}) rotate(${text.rotation})">` +
      `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${text.fontSize}" fill="#374151" font-family="Arial, sans-serif" font-weight="500">` +
      `${escapeXml(text.text)}</text>` +
      `</g>`
    )
  })

  const roomRect =
    `<rect x="${PAD}" y="${PAD}" width="${room.widthFt * EXPORT_PPF}" height="${room.heightFt * EXPORT_PPF}" ` +
    `fill="white" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="10 5"/>`

  const roomW = room.widthFt * EXPORT_PPF
  const floorPlanEl = room.floorPlan
    ? `<g transform="translate(${PAD},${PAD}) scale(${roomW / room.floorPlan.viewBox.width})" opacity="${room.floorPlan.opacity}" pointer-events="none">` +
      `<g transform="${room.floorPlan.svgTransform}">` +
      room.floorPlan.paths.map((p) => `<path d="${p.d}" fill="#374151" stroke="none"/>`).join('') +
      `</g></g>`
    : ''

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#f1f5f9"/>` +
    roomRect +
    floorPlanEl +
    shapeEls.join('') +
    textEls.join('') +
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

// ── Guest list exports ────────────────────────────────────────────────────────

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string | null | undefined): string {
  const s = value ?? ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildSeatLookup(project: Project): Record<string, { tableLabel: string; seatNumber: number }> {
  const map: Record<string, { tableLabel: string; seatNumber: number }> = {}
  for (const table of project.tables) {
    for (const seat of table.seats) {
      map[seat.id] = { tableLabel: table.label, seatNumber: seat.index + 1 }
    }
  }
  return map
}

export function exportGuestsCSV(project: Project): void {
  const seatLookup = buildSeatLookup(project)
  const rows = ['name,group,notes,TableLabel,SeatNumber']
  for (const g of project.guests) {
    const info = g.seatId ? seatLookup[g.seatId] : undefined
    rows.push(
      [
        csvCell(g.name),
        csvCell(g.group),
        csvCell(g.notes),
        csvCell(info?.tableLabel ?? ''),
        info ? String(info.seatNumber) : '',
      ].join(',')
    )
  }
  triggerDownload('guests.csv', rows.join('\n'), 'text/csv')
}

export function exportGuestsJSON(project: Project): void {
  const seatLookup = buildSeatLookup(project)
  const data = project.guests.map((g) => {
    const info = g.seatId ? seatLookup[g.seatId] : undefined
    return {
      name: g.name,
      group: g.group ?? null,
      notes: g.notes ?? null,
      table: info?.tableLabel ?? null,
      seat: info?.seatNumber ?? null,
    }
  })
  triggerDownload('guests.json', JSON.stringify(data, null, 2), 'application/json')
}

export function exportGuestsPlaintext(project: Project): void {
  const seatLookup = buildSeatLookup(project)

  // Group assigned guests by table label, then by seat number
  const byTable = new Map<string, { seatNumber: number; name: string }[]>()
  const unassigned: string[] = []

  for (const g of project.guests) {
    const info = g.seatId ? seatLookup[g.seatId] : undefined
    if (info) {
      const list = byTable.get(info.tableLabel) ?? []
      list.push({ seatNumber: info.seatNumber, name: g.name })
      byTable.set(info.tableLabel, list)
    } else {
      unassigned.push(g.name)
    }
  }

  // Sort tables by label, seats by number within each table
  const lines: string[] = []
  for (const [label, seats] of [...byTable.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(label)
    for (const s of seats.sort((a, b) => a.seatNumber - b.seatNumber)) {
      lines.push(`  Seat ${s.seatNumber}: ${s.name}`)
    }
    lines.push('')
  }

  if (unassigned.length > 0) {
    lines.push('Unassigned')
    for (const name of unassigned) lines.push(`  ${name}`)
  }

  // Remove trailing blank line if present
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  triggerDownload('guests.txt', lines.join('\n'), 'text/plain')
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
