# SPEC_v2.md

## Overview

This document specifies eight features for v2 of the seating chart app. The codebase is React + TypeScript + Vite with Zustand (`src/store/projectStore.ts`), Dexie/IndexedDB (`src/db/index.ts`), and an SVG pan/zoom canvas (`src/components/canvas/CanvasView.tsx`). All state mutations must call `persist(updated)` (the pattern already used in `projectStore.ts`) immediately after updating Zustand state. Implement prompts in the order listed; each assumes the previous is complete.

---

## Prompt 1 — Table Label Centered + Deselect on Re-click

### Files to edit
- `src/components/canvas/TableShape.tsx`
- `src/components/canvas/CanvasView.tsx`
- `src/lib/export.ts`

### 1.1 — Center label inside table body (TableShape.tsx)

In `TableShape.tsx`, locate the `<text>` element that renders `table.label`. Currently it uses `y={labelY}` (which places it below the table). Make the following changes:

- Change `y={labelY}` to `y={0}`.
- Add `dominantBaseline="central"` (this vertically centers text at y=0, which is the table's center in local coordinates).
- Keep `textAnchor="middle"`.
- Change `fontSize` from `{11 / zoom}` to `{13 / zoom}`.
- Add `fontWeight="600"`.
- Change `fill` from `"#64748b"` to `"#475569"`.

Remove the `const labelY = getLabelY(table, pixelsPerFoot)` line from the component — it is no longer used here. Do **not** delete `getLabelY` from `tableGeometry.ts`.

### 1.2 — Center label in export SVG (export.ts)

In `src/lib/export.ts`, inside `buildExportSVG`, locate the label string construction:

```typescript
const label =
  `<text x="0" y="${labelY}" text-anchor="middle" ` +
  `font-size="11" fill="#64748b" font-family="Arial, sans-serif">` +
  `${escapeXml(table.label)}</text>`
```

Replace it with:

```typescript
const label =
  `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" ` +
  `font-size="13" fill="#475569" font-family="Arial, sans-serif" font-weight="600">` +
  `${escapeXml(table.label)}</text>`
```

Also remove the `const labelY = getLabelY(table, EXPORT_PPF)` line from inside the `tables.map` callback since it is no longer used. The `getLabelY` import at the top of `export.ts` can be removed too if it is no longer referenced anywhere in that file.

### 1.3 — Deselect on re-click (CanvasView.tsx)

In `CanvasView.tsx`, find the two inner functions `handleTableClick` and `handleSeatClick` near the bottom of the component.

**handleTableClick**: change to:
```typescript
function handleTableClick(tableId: string) {
  if (pendingGuestId) return
  if (selectedTableId === tableId) {
    setSelectedTable(null)
  } else {
    setSelectedTable(tableId)
  }
}
```

**handleSeatClick**: change the non-assignment branch to:
```typescript
// at the end, where it currently calls setSelectedSeat(seatId):
if (selectedSeatId === seatId && !pendingGuestId) {
  setSelectedSeat(null)
} else {
  setSelectedSeat(seatId)
}
```

The assignment branch (when `pendingGuestId` is set) is unchanged.

---

## Prompt 2 — Table Inspector Redesign

### Files to edit
- `src/components/panels/InspectorPanel.tsx`

### Context

The current `TableInspector` shows: Label (editable), Type (read-only), Size (read-only), Seats (read-only), Delete button. Replace the entire `TableInspector` function with the layout described below. The `EmptyInspector` and `SeatInspector` components are unchanged in this prompt.

### 2.1 — Props and state

`TableInspector` receives `{ table: Table }`. It needs access to the full project for guest lookups. Add these store selectors at the top:

```typescript
const project = useProjectStore((s) => s.project)
const updateTable = useProjectStore((s) => s.updateTable)
const deleteTable = useProjectStore((s) => s.deleteTable)
const unassignSeat = useProjectStore((s) => s.unassignSeat)
const setSelectedTable = useProjectStore((s) => s.setSelectedTable)
const setSelectedSeat = useProjectStore((s) => s.setSelectedSeat)
```

Local state:
```typescript
const [label, setLabel] = useState(table.label)
const [confirmDelete, setConfirmDelete] = useState(false)
const [confirmUnassignAll, setConfirmUnassignAll] = useState(false)
```

Reset `label` when `table.id` changes (the `key={selectedTable.id}` on the parent already handles this via remounting, so no explicit effect is needed).

Build a `guestMap`: `Record<string, Guest>` mapping guest id → guest, built from `project.guests`.

`occupiedSeats` = `table.seats.filter(s => s.guestId !== null)`.

### 2.2 — Warning banner

Add a warning banner section **above** the label field. In this prompt, render the banner only as a placeholder that checks for a `warnings` prop. The actual warning computation is wired in Prompt 4. For now, accept an optional `warnings?: string[]` prop (default `[]`) and render:

```tsx
{warnings.length > 0 && (
  <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
    {warnings.map((w, i) => (
      <p key={i} className="text-xs text-amber-700">{w}</p>
    ))}
  </div>
)}
```

### 2.3 — Label field

Same behavior as v1: text input, saves on blur, Enter blurs. No change to the `handleLabelBlur` logic.

### 2.4 — Guests section

Below the label field, render a section with:

- Header row: `<p>Guests</p>` and a count badge `"{occupiedSeats.length} / {table.seats.length} seated"` (small grey text).
- A scrollable list (max-height `180px`, `overflow-y-auto`) of all seats ordered by `seat.index` ascending. For each seat:
  - If `seat.guestId !== null`: show the guest name as a clickable `<button>` (text-sm, text-slate-800, truncated). On click: call `setSelectedSeat(seat.id)` — this switches the inspector to `SeatInspector` for that seat. On the right side of the row, show an "Unassign" `<button>` (text-xs, text-slate-500, hover:text-red-600) that calls `unassignSeat(seat.id)` immediately (no confirmation).
  - If `seat.guestId === null`: show greyed-out "Empty" text (`text-xs text-slate-300`). No unassign button.

### 2.5 — Rotate Guests buttons

Below the guest list, render two small icon buttons side by side, only when `occupiedSeats.length > 0`:

```tsx
<div className="flex items-center gap-2 px-4 py-2">
  <span className="text-xs text-slate-400 flex-1">Rotate guests</span>
  <button onClick={handleRotateCCW} title="Rotate counterclockwise" ...>
    {/* CCW circular arrow SVG */}
  </button>
  <button onClick={handleRotateCW} title="Rotate clockwise" ...>
    {/* CW circular arrow SVG */}
  </button>
</div>
```

Use inline SVG circular arrow icons (24x24 viewBox, strokeWidth 2, rounded caps). A counterclockwise arc: `<path d="M20 12a8 8 0 01-8 8 8 8 0 01-8-8 8 8 0 018-8" />` with an arrowhead pointing left. Mirror for clockwise.

**handleRotateCW**: `new seat[i].guestId = old seat[(i - 1 + n) % n].guestId`.
**handleRotateCCW**: `new seat[i].guestId = old seat[(i + 1) % n].guestId`.

Both directions: build the new seats array by mapping over `table.seats` with the rotated guestIds. For each guest whose seatId changes, update `guest.seatId` accordingly. Collect all changed guests and update them. Then call `updateTable(table.id, { seats: newSeats })` and update affected guests via `updateGuest` for each (or use a single `updateTable` call that replaces the seats array — whichever fits the existing store pattern). Persist via the existing pattern.

If `occupiedSeats.length === 0`, both handlers are no-ops.

Implementation detail: after building `newSeats`, compute `guestUpdates`: for each seat where `guestId` changed, find the guest and set `guest.seatId = newSeats[i].id`. Build the full updated project inline (same pattern as `assignSeat` in the store) rather than calling `updateTable` + multiple `updateGuest` calls individually, to avoid multiple Dexie writes. Add a new store action `rotateSeats(tableId: string, direction: 'cw' | 'ccw'): Promise<void>` to `projectStore.ts` that performs this atomically.

### 2.6 — Edit Table button

Below the rotate buttons, a button:

```tsx
<button
  onClick={() => setEditTableOpen(true)}
  className="mx-4 mb-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  Edit Table
</button>
```

Add `const [editTableOpen, setEditTableOpen] = useState(false)` to local state. The `EditTableModal` component is implemented in Prompt 5. For now, render `{editTableOpen && <div />}` as a placeholder.

### 2.7 — Unassign All

Below the Edit Table button, only when `occupiedSeats.length > 0`:

```tsx
<button
  onClick={() => setConfirmUnassignAll(true)}
  className="mx-4 text-xs text-slate-400 hover:text-red-500 underline"
>
  Unassign all guests
</button>
```

When `confirmUnassignAll` is true, render a modal overlay (use the existing `Modal` component from `src/components/ui/Modal.tsx`):

```tsx
<Modal title={`Unassign all guests from ${table.label}?`} onClose={() => setConfirmUnassignAll(false)}>
  <div className="space-y-3">
    <p className="text-sm text-slate-600">
      {occupiedSeats.length} guest{occupiedSeats.length !== 1 ? 's' : ''} will be unassigned.
    </p>
    <div className="flex justify-end gap-2">
      <button onClick={() => setConfirmUnassignAll(false)} ...>Cancel</button>
      <button onClick={handleUnassignAll} ...>Unassign All</button>
    </div>
  </div>
</Modal>
```

`handleUnassignAll`: clear `guestId` from all seats in the table; clear `seatId` from all affected guests. Build the full updated project in a single operation and persist once. Add a store action `unassignAllSeats(tableId: string): Promise<void>` to `projectStore.ts`.

### 2.8 — Delete Table button

Keep the same behavior as v1. Render at the bottom (`mt-auto`). The existing inline confirmation with occupied-count warning is unchanged.

### 2.9 — Remove from inspector

Do not render the read-only Type, Size, and seat-count fields that were in v1. Those fields will appear inside the Edit Table Modal (Prompt 5).

---

## Prompt 3 — Seat Inspector "View Table" + Assigned Guest Click Navigation

### Files to edit
- `src/components/panels/InspectorPanel.tsx`
- `src/components/canvas/CanvasView.tsx`
- `src/pages/ProjectPage.tsx`
- `src/components/panels/GuestListPanel.tsx`

### 3.1 — "View Table" back-link in SeatInspector

In `InspectorPanel.tsx`, update `SeatInspector` to accept `{ seat: Seat; tableLabel: string; tableId: string }` (add `tableId`). Update the call site in `InspectorPanel` to pass `seatTable.id`.

At the very top of `SeatInspector`'s returned JSX (before the Table section), add:

```tsx
<div className="border-b border-slate-100 px-4 py-2">
  <button
    onClick={() => {
      setSelectedTable(seat.tableId)
      setSelectedSeat(null)
    }}
    className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600"
  >
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2L3 6l4 4" />
    </svg>
    {tableLabel}
  </button>
</div>
```

Add `setSelectedTable` and `setSelectedSeat` from the store inside `SeatInspector`. Clicking this button calls `setSelectedTable(seat.tableId)` then `setSelectedSeat(null)` — because `setSelectedTable` in the store already sets `selectedSeatId: null`, a single call to `setSelectedTable` is sufficient.

### 3.2 — CanvasView imperative handle

Convert `CanvasView` from a default export function to a `forwardRef` component. Define:

```typescript
export interface CanvasViewHandle {
  panToSeat: (seatId: string) => void
}
```

Export this interface from `CanvasView.tsx`.

Change the component signature:

```typescript
const CanvasView = forwardRef<CanvasViewHandle, object>(function CanvasView(_props, ref) {
  // ... existing body ...
})
export default CanvasView
```

Inside the component, add `useImperativeHandle(ref, () => ({ panToSeat }), [])`.

Implement `panToSeat`:

```typescript
function panToSeat(seatId: string) {
  const proj = useProjectStore.getState().project
  if (!proj) return
  // Find the table and seat
  let foundTable: Table | null = null
  let seatIndex = -1
  for (const t of proj.tables) {
    const idx = t.seats.findIndex((s) => s.id === seatId)
    if (idx !== -1) { foundTable = t; seatIndex = idx; break }
  }
  if (!foundTable || seatIndex === -1) return
  const pxPerFt = proj.room.pixelsPerFoot
  const seatPositions = getSeatPositions(foundTable, pxPerFt)
  const seatPos = seatPositions[seatIndex]
  if (!seatPos) return
  // Convert seat local coordinates to world coordinates
  const rad = (foundTable.rotation * Math.PI) / 180
  const localX = seatPos.x
  const localY = seatPos.y
  const worldX = foundTable.x * pxPerFt + localX * Math.cos(rad) - localY * Math.sin(rad)
  const worldY = foundTable.y * pxPerFt + localX * Math.sin(rad) + localY * Math.cos(rad)
  // Center in viewport
  const svg = svgRef.current
  if (!svg) return
  const { width, height } = svg.getBoundingClientRect()
  const currentZoom = zoomRef.current
  setPan({
    x: width / 2 - worldX * currentZoom,
    y: height / 2 - worldY * currentZoom,
  })
}
```

Do not change zoom. Since `panToSeat` is defined inside the component body it can access `svgRef`, `zoomRef`, `setPan`. Pass a stable reference via `useCallback` with `[]` deps, or define it directly in `useImperativeHandle`'s factory — either is acceptable.

### 3.3 — Wire the ref in ProjectPage

In `ProjectPage.tsx`:

```typescript
import CanvasView, { type CanvasViewHandle } from '../components/canvas/CanvasView'
// ...
const canvasRef = useRef<CanvasViewHandle>(null)
```

Pass it to the canvas:

```tsx
<CanvasView ref={canvasRef} />
```

Add a callback for GuestListPanel:

```typescript
const handlePanToSeat = useCallback((seatId: string) => {
  canvasRef.current?.panToSeat(seatId)
}, [])
```

Pass it as a prop to GuestListPanel:

```tsx
<GuestListPanel onPanToSeat={handlePanToSeat} />
```

### 3.4 — Assigned guest click in GuestListPanel

`GuestListPanel` receives `{ onPanToSeat: (seatId: string) => void }` as a prop.

In the `onRowClick` handler inside `GuestListPanel`, update the branch that currently returns early for assigned guests:

```typescript
onRowClick={() => {
  if (guest.seatId !== null) {
    // Assigned: pan to seat and select it in inspector
    setPendingGuest(null)
    setSelectedSeat(guest.seatId)
    onPanToSeat(guest.seatId)
  } else {
    setPendingGuest(pendingGuestId === guest.id ? null : guest.id)
  }
}}
```

Add `setSelectedSeat` from the store in `GuestListPanel`. Update `GuestRow`'s `cursor` style: for assigned guests change from `cursor: 'default'` to `cursor: 'pointer'` since clicking now does something.

---

## Prompt 4 — Table Warning System

### Files to edit / create
- `src/lib/warnings.ts` (new file)
- `src/components/canvas/TableShape.tsx`
- `src/components/canvas/CanvasView.tsx`
- `src/components/panels/InspectorPanel.tsx`

### 4.1 — Warning computation (src/lib/warnings.ts)

Create `src/lib/warnings.ts`:

```typescript
import type { Table, Room } from '../types'
import { TABLE_PRESETS } from '../types'

export function getTableWarnings(table: Table, room: Room): string[] {
  const warnings: string[] = []

  // Out-of-bounds check (axis-aligned bounding box, ignores rotation)
  const halfW =
    table.type === 'rectangular'
      ? table.sizeFt / 2
      : table.sizeFt / 2
  const halfH =
    table.type === 'rectangular'
      ? (table.widthFt ?? 2.5) / 2
      : table.sizeFt / 2

  const oob =
    table.x - halfW < 0 ||
    table.x + halfW > room.widthFt ||
    table.y - halfH < 0 ||
    table.y + halfH > room.heightFt

  if (oob) warnings.push('Table is partially outside the room boundary')

  // Over-capacity check
  const preset = TABLE_PRESETS.find(
    (p) => p.type === table.type && p.sizeFt === table.sizeFt
  )
  if (preset && table.seats.length > preset.maxSeats) {
    warnings.push(`Seat count exceeds recommended maximum of ${preset.maxSeats} for this table size`)
  }

  return warnings
}
```

### 4.2 — Pass warnings to TableShape (CanvasView.tsx + TableShape.tsx)

In `CanvasView.tsx`, import `getTableWarnings`. In the render, for each table compute `warnings` before passing to `TableShape`:

```tsx
{project.tables.map((table) => {
  const warnings = getTableWarnings(table, project.room)
  return (
    <TableShape
      key={table.id}
      ...existingProps...
      warnings={warnings}
    />
  )
})}
```

In `TableShape.tsx`, add `warnings: string[]` to `TableShapeProps`. When `warnings.length > 0`:

1. Add a `<defs>` block inside the table's `<g>` with a drop-shadow filter:

```tsx
{warnings.length > 0 && (
  <defs>
    <filter id={`warn-${table.id}`} x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation={5 / zoom} floodColor="#ef4444" floodOpacity="0.7" />
    </filter>
  </defs>
)}
```

2. Apply the filter only to the table body shape (the `<circle>` or `<rect>` for the table, not the seats). Add `filter={warnings.length > 0 ? \`url(#warn-${table.id})\` : undefined}` to both the `<circle>` and `<rect>` elements that render the table body.

3. Render a warning indicator at the top-right of the table bounding box:

```tsx
{warnings.length > 0 && (
  <text
    x={table.type === 'round' ? halfW * 0.7 : halfW + 4 / zoom}
    y={table.type === 'round' ? -halfW * 0.7 : -halfH - 4 / zoom}
    fontSize={12 / zoom}
    fill="#ef4444"
    textAnchor="middle"
    dominantBaseline="central"
    style={{ pointerEvents: 'none', userSelect: 'none' }}
  >
    ⚠
  </text>
)}
```

### 4.3 — Warning banner in TableInspector (InspectorPanel.tsx)

In `InspectorPanel`, compute warnings for the selected table:

```typescript
import { getTableWarnings } from '../../lib/warnings'
// inside the InspectorPanel component, where selectedTable is resolved:
const tableWarnings = selectedTable ? getTableWarnings(selectedTable, project.room) : []
```

Pass `warnings={tableWarnings}` to `<TableInspector>`. The banner placeholder added in Prompt 2 now receives real data.

Update `TableInspector` props: `{ table: Table; warnings: string[] }`.

---

## Prompt 5 — Edit Table Modal

### Files to edit / create
- `src/components/panels/InspectorPanel.tsx` (wire modal open state)
- `src/components/modals/EditTableModal.tsx` (new file)
- `src/store/projectStore.ts` (new store action)

### 5.1 — Store action: replaceTable

Add to `projectStore.ts`:

```typescript
replaceTable: async (tableId: string, newTableData: Partial<Table>, guestUpdates: { guestId: string; seatId: string | null }[]) => Promise<void>
```

Implementation:
- Map over `project.tables`: replace the matching table with `{ ...table, ...newTableData }`.
- Map over `project.guests`: apply seatId changes from `guestUpdates` (match by `guestId`).
- Set and persist.

### 5.2 — EditTableModal component (src/components/modals/EditTableModal.tsx)

This is a single modal that progresses through two views: **Configure** and **Conflict Resolution**.

**Props:**
```typescript
interface EditTableModalProps {
  table: Table
  onClose: () => void
}
```

**Local state:**
```typescript
type ModalView = 'configure' | 'conflict'

const [view, setView] = useState<'configure' | 'conflict'>('configure')
const [draftLabel, setDraftLabel] = useState(table.label)
const [draftPreset, setDraftPreset] = useState<TablePreset>(
  TABLE_PRESETS.find(p => p.type === table.type && p.sizeFt === table.sizeFt) ?? TABLE_PRESETS[0]
)
const [draftCount, setDraftCount] = useState(table.seats.length)
// For conflict resolution:
const [seatsToUnassign, setSeatsToUnassign] = useState<Set<string>>(new Set())
```

#### Configure view

**Label field:** text input, pre-filled with `draftLabel`. No auto-save — saved only when the modal's Save button is clicked.

**Preset selector:** A grid of selectable cards grouped by type (Round / Rectangular / Square), using `PRESET_GROUPS` (same grouping as in `ProjectPage.tsx`). Each card shows:
- Preset label (e.g. "Round 5ft")
- Seat range: "{min}–{max} seats"

Selected card styling: `border-indigo-400 bg-indigo-50`. Unselected: `border-slate-200 bg-white hover:border-slate-300`.

On selecting a different preset: set `draftPreset = preset`, set `draftCount = preset.recommendedSeats`.

Below the grid, show a suggestion line:
- If `draftCount === draftPreset.recommendedSeats`: `<p className="text-xs text-slate-400">Recommended: {draftPreset.recommendedSeats} seats</p>`
- If `draftCount !== draftPreset.recommendedSeats`: `<p className="text-xs text-amber-600">Suggested: {draftCount < draftPreset.recommendedSeats ? 'increase' : 'decrease'} to {draftPreset.recommendedSeats}</p>`

**Seat count adjuster:** `−` and `+` buttons with current `draftCount` displayed between them. Floor: 1. No ceiling enforced by the buttons (allow going above maxSeats). Show inline warnings:
- If `draftCount > draftPreset.maxSeats`: amber text "⚠ Exceeds recommended maximum of {draftPreset.maxSeats} for this table size"
- If `draftCount < draftPreset.minSeats`: amber text "⚠ Below recommended minimum of {draftPreset.minSeats} for this table size"

**Save button** (`"Save Changes"`, primary indigo): On click, run conflict detection:

```typescript
function computeDisplacedSeats(): Seat[] {
  // Seats that exist in current table but won't exist after resize
  return table.seats.filter((s, i) => i >= draftCount && s.guestId !== null)
}
```

If `displaced.length > 0`:
- Pre-populate `seatsToUnassign` with the IDs of displaced seats.
- Set `view = 'conflict'`.

If `displaced.length === 0`: call `applyChanges([])` directly.

**Cancel button**: calls `onClose()`.

#### Conflict Resolution view

**Header:** "N guest(s) must be unassigned to apply these changes."

**Required unassignment count** (`N`): equals `displaced.length` (computed before transitioning to this view — store it in a `const [requiredUnassignCount, setRequiredUnassignCount] = useState(0)` that is set before switching views).

**Seat checklist:** Show all currently occupied seats (all seats in `table.seats` where `guestId !== null`). Each row:
- Seat number: `Seat {seat.index + 1}`
- Guest name
- Checkbox: checked if `seatsToUnassign.has(seat.id)`

Rules:
- Exactly `requiredUnassignCount` seats must be checked. If the user tries to uncheck a seat that would bring the count below `requiredUnassignCount`, prevent the uncheck.
- If the user tries to check more than `requiredUnassignCount`, prevent the check.
- Show validation state: if `seatsToUnassign.size !== requiredUnassignCount`, disable "Apply Changes" and show "Select exactly N seat(s) to unassign."

**"Apply Changes" button**: enabled only when `seatsToUnassign.size === requiredUnassignCount`. On click, call `applyChanges(Array.from(seatsToUnassign))`.

**"Back" button**: sets `view = 'configure'`.

#### applyChanges(seatIdsToUnassign: string[])

```typescript
async function applyChanges(seatIdsToUnassign: string[]) {
  const clearSet = new Set(seatIdsToUnassign)
  const guestUpdates: { guestId: string; seatId: string | null }[] = []

  // Build new seats array
  const newSeats: Seat[] = []
  for (let i = 0; i < draftCount; i++) {
    const oldSeat = table.seats[i]
    if (oldSeat) {
      if (clearSet.has(oldSeat.id)) {
        // Clear this seat; schedule guest update
        if (oldSeat.guestId) guestUpdates.push({ guestId: oldSeat.guestId, seatId: null })
        newSeats.push({ ...oldSeat, guestId: null })
      } else {
        newSeats.push(oldSeat) // preserve id and guestId
      }
    } else {
      // New seat beyond old count
      newSeats.push({ id: crypto.randomUUID(), tableId: table.id, index: i, guestId: null })
    }
  }

  // Any old occupied seats beyond newCount that aren't in clearSet
  // (shouldn't happen after conflict resolution, but guard anyway)
  for (let i = draftCount; i < table.seats.length; i++) {
    const old = table.seats[i]
    if (old.guestId && !clearSet.has(old.id)) {
      guestUpdates.push({ guestId: old.guestId, seatId: null })
    }
  }

  const tableChanges: Partial<Table> = {
    label: draftLabel.trim() || table.label,
    type: draftPreset.type,
    sizeFt: draftPreset.sizeFt,
    widthFt: draftPreset.widthFt,
    seats: newSeats,
  }

  await replaceTable(table.id, tableChanges, guestUpdates)
  onClose()
}
```

Import `replaceTable` from the store.

### 5.3 — Wire modal in InspectorPanel

In `TableInspector`, replace the `{editTableOpen && <div />}` placeholder from Prompt 2 with:

```tsx
{editTableOpen && (
  <EditTableModal
    table={table}
    onClose={() => setEditTableOpen(false)}
  />
)}
```

Import `EditTableModal` from `../../components/modals/EditTableModal`.

---

## Prompt 6 — Project Settings (Rename + Resize Canvas)

### Files to edit / create
- `src/pages/ProjectPage.tsx`
- `src/components/modals/ProjectSettingsModals.tsx` (new file)
- `src/store/projectStore.ts` (new store action)

### 6.1 — Store action: updateRoom

Add to `projectStore.ts`:

```typescript
updateRoom: async (changes: Partial<Room>) => Promise<void>
```

Implementation: maps `project.room` with the changes, updates and persists.

Also add:

```typescript
updateProjectName: async (name: string) => Promise<void>
```

Updates `project.name`, sets `updatedAt`, persists.

### 6.2 — Settings dropdown in toolbar (ProjectPage.tsx)

Add a `SettingsMenu` component to `ProjectPage.tsx` following the same pattern as `InsertMenu` and `ExportMenu` (click-outside closes, ref on wrapper div, `useEffect` for document mousedown listener).

The gear icon SVG (viewBox="0 0 20 20", filled path for a gear/cog). Use a simple 8-tooth gear path or the Heroicons cog SVG.

Position the `SettingsMenu` in the toolbar's left cluster, between the back button and the `<h1>` project title:

```tsx
<button onClick={() => navigate('/')} ...>← back</button>
<SettingsMenu ... />
<h1 ...>{project.name}</h1>
```

Dropdown items (rendered as buttons in the dropdown):

- **Rename Project** → sets `settingsModal = 'rename'`
- **Resize Canvas** → sets `settingsModal = 'resize'`

Add to `ProjectPage` local state:

```typescript
const [settingsModal, setSettingsModal] = useState<null | 'rename' | 'resize'>(null)
```

Render conditionally:

```tsx
{settingsModal === 'rename' && (
  <RenameProjectModal onClose={() => setSettingsModal(null)} />
)}
{settingsModal === 'resize' && (
  <ResizeCanvasModal onClose={() => setSettingsModal(null)} />
)}
```

### 6.3 — RenameProjectModal (src/components/modals/ProjectSettingsModals.tsx)

```typescript
function RenameProjectModal({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const updateProjectName = useProjectStore((s) => s.updateProjectName)
  const [name, setName] = useState(project?.name ?? '')
  // ...
}
```

Renders a `Modal` (title: "Rename Project") with a text input and Save/Cancel buttons. On Save: `updateProjectName(name.trim())` then `onClose()`. Disable Save if name is blank.

### 6.4 — ResizeCanvasModal (src/components/modals/ProjectSettingsModals.tsx)

```typescript
function ResizeCanvasModal({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const updateRoom = useProjectStore((s) => s.updateRoom)
  const [mode, setMode] = useState<'static' | 'ratio'>('static')
  const [widthFt, setWidthFt] = useState(project?.room.widthFt ?? 40)
  const [heightFt, setHeightFt] = useState(project?.room.heightFt ?? 60)
  const [scale, setScale] = useState(1)
  // ...
}
```

**Mode tabs:** Two tab buttons "Static" and "Ratio" at the top of the modal. Active tab: `border-b-2 border-indigo-500 text-indigo-600`. Switching tabs does not reset inputs.

**Static mode:** Two number inputs, min={10}, step={1}. Labels "Width (ft)" and "Height (ft)". Pre-filled with current room dimensions.

**Ratio mode:** One number input "Scale factor" (min=0.1, step=0.1, default 1.0). Below it: `"New size: {Math.round(room.widthFt * scale)} × {Math.round(room.heightFt * scale)} ft"` (computed live). On change, also derive the resulting widthFt/heightFt for the warning computation below.

**Warning note (both modes):** Compute `outOfBoundsCount` — the number of existing tables that would be out of bounds under the new dimensions. Use `getTableWarnings` with a mock room `{ ...room, widthFt: newW, heightFt: newH }` for each table, checking if the "outside boundary" warning appears. Show if `outOfBoundsCount > 0`:

```tsx
<p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
  ⚠ {outOfBoundsCount} table{outOfBoundsCount !== 1 ? 's' : ''} will be outside the new boundary and won't appear in exports.
</p>
```

**Effective new dimensions:** In static mode, `newW = widthFt`, `newH = heightFt`. In ratio mode, `newW = Math.round(room.widthFt * scale)`, `newH = Math.round(room.heightFt * scale)`. Clamp both to min 10.

**Confirm:** calls `updateRoom({ widthFt: newW, heightFt: newH })` then `onClose()`. `pixelsPerFoot` is unchanged.

**Cancel:** calls `onClose()`.

---

## Prompt 7 — Zoom Indicator + Reset Zoom

### Files to edit
- `src/components/canvas/CanvasView.tsx`

### 7.1 — ZoomControls component

Add a `ZoomControls` component below the `ScaleBar` component in `CanvasView.tsx` (or directly inline in the JSX). It is positioned `absolute bottom-4 right-4`:

```tsx
<div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2">
  <span className="text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
  <button
    onClick={handleResetZoom}
    title="Reset zoom to fit"
    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm"
  >
    {/* fit-to-screen icon: two diagonal arrows */}
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
    </svg>
  </button>
</div>
```

The `zoom` value needed here is the `zoom` state from `CanvasView`. Since `ZoomControls` is defined inside the same file and rendered inline, it can access `zoom` and `handleResetZoom` directly via closure or props.

### 7.2 — handleResetZoom

Add `handleResetZoom` as a function inside `CanvasView`:

```typescript
function handleResetZoom() {
  const svg = svgRef.current
  if (!svg || !project) return
  const { width, height } = svg.getBoundingClientRect()
  const { widthFt, heightFt, pixelsPerFoot } = project.room
  const roomW = widthFt * pixelsPerFoot
  const roomH = heightFt * pixelsPerFoot
  const fitZoom = Math.min(1, (width * 0.85) / roomW, (height * 0.85) / roomH)
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom))
  const newPan = {
    x: (width - roomW * newZoom) / 2,
    y: (height - roomH * newZoom) / 2,
  }
  setZoom(newZoom)
  setPan(newPan)
}
```

This is the same formula used in the initial load `useEffect`. No animation — snap immediately.

### 7.3 — Parent div pointer events

The `ZoomControls` sits inside the `relative h-full w-full overflow-hidden bg-slate-100` div. The `ScaleBar` already uses `pointer-events-none`. Change `ZoomControls` wrapper to `pointer-events-auto` so button clicks register. The outer div should remain `pointer-events-none` for the scale bar, so wrap `ZoomControls` separately:

```tsx
{/* Scale bar — bottom left */}
<ScaleBar pixelsPerFoot={effectivePxPerFt} />

{/* Zoom controls — bottom right */}
<div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
  <span className="pointer-events-none text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
  <button
    className="pointer-events-auto ..."
    onClick={handleResetZoom}
  >
    ...
  </button>
</div>
```

---

## Prompt 8 — CSV Import Wizard

### Files to edit
- `src/components/panels/GuestListPanel.tsx`
- `src/components/modals/CsvImportModal.tsx` (new file)

### 8.1 — Replace direct CSV flow with modal

In `GuestListPanel.tsx`:
- Remove the hidden `<input type="file" ref={csvInputRef} ...>` element.
- Remove the `csvInputRef` ref and `handleCSVChange` handler.
- Change the Import CSV button's `onClick` from `() => csvInputRef.current?.click()` to `() => setModal({ type: 'csv' })`.
- Add `{ type: 'csv' }` to the `ModalState` union type.
- Render `{modal.type === 'csv' && <CsvImportModal onClose={...} onImported={(msg) => { setToast(msg); setModal({ type: 'none' }) }} />}`.

The `addGuest` calls move into the modal.

### 8.2 — CsvImportModal (src/components/modals/CsvImportModal.tsx)

**Props:**
```typescript
interface CsvImportModalProps {
  onClose: () => void
  onImported: (toastMessage: string) => void
}
```

**State:**
```typescript
type ImportView = 'upload' | 'preview'
const [view, setView] = useState<'upload' | 'preview'>('upload')
const [isParsing, setIsParsing] = useState(false)
const [dragOver, setDragOver] = useState(false)
const [parsedValid, setParsedValid] = useState<ParsedGuest[]>([])
const [parsedSkipped, setParsedSkipped] = useState(0)
```

Where `ParsedGuest = { name: string; group?: string; notes?: string }`.

Access `project.guests` via `useProjectStore` to build the `existingNames` set for deduplication.

#### Upload view layout

Rendered inside a `Modal` (title: "Import Guests from CSV").

**Section 1 — Instructions:**

```tsx
<p className="text-sm text-slate-600 mb-3">
  Upload a CSV file with your guest list. The following columns are supported:
</p>
<table className="w-full text-xs border-collapse mb-4">
  <thead>
    <tr className="border-b border-slate-200">
      <th className="text-left py-1 pr-3 font-semibold text-slate-600">Column</th>
      <th className="text-left py-1 pr-3 font-semibold text-slate-600">Required</th>
      <th className="text-left py-1 font-semibold text-slate-600">Description</th>
    </tr>
  </thead>
  <tbody className="text-slate-500">
    <tr><td className="py-1 pr-3 font-mono">name</td><td>Yes</td><td>Guest's full name</td></tr>
    <tr><td className="py-1 pr-3 font-mono">group</td><td>No</td><td>Group or family name</td></tr>
    <tr><td className="py-1 pr-3 font-mono">notes</td><td>No</td><td>Dietary restrictions, etc.</td></tr>
  </tbody>
</table>
```

**Section 2 — Template download:**

```tsx
<button onClick={handleDownloadTemplate} className="mb-4 text-xs text-indigo-600 hover:underline">
  Download Template CSV
</button>
```

`handleDownloadTemplate`:
```typescript
function handleDownloadTemplate() {
  const csv = 'name,group,notes\nJane Smith,Smith Family,Vegetarian\nJohn Doe,Doe Family,\nAlice Johnson,,Gluten-free\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'guest-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
```

**Section 3 — Drop zone:**

```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
  onDragLeave={() => setDragOver(false)}
  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
  onClick={() => fileInputRef.current?.click()}
  className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
    dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'
  }`}
>
  {isParsing ? (
    <svg className="mx-auto h-5 w-5 animate-spin text-indigo-600" .../>
  ) : (
    <>
      <p className="text-sm font-medium text-slate-600">Drop a CSV file here or click to browse</p>
      <p className="mt-1 text-xs text-slate-400">Accepts .csv files</p>
    </>
  )}
</div>
<input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
```

`handleFile(file: File | undefined)`:
1. If no file, return.
2. Set `isParsing = true`.
3. Build `existingNames` from `project.guests`.
4. Call `await parseGuestCSV(file, existingNames)` (existing function from `src/lib/csvParser.ts`).
5. Set `parsedValid = rows`, `parsedSkipped = skipped`.
6. Set `isParsing = false`, `view = 'preview'`.
7. Wrap in try/catch; on error set `isParsing = false` and show an inline error message instead of switching views. Add `const [parseError, setParseError] = useState<string | null>(null)` and display below the drop zone when set.

#### Preview view layout

Replace the drop zone with:

**Summary line:**
```tsx
<p className="text-sm text-slate-700 mb-3">
  Found <span className="font-semibold">{parsedValid.length}</span> guest{parsedValid.length !== 1 ? 's' : ''}
  {parsedSkipped > 0 && (
    <span className="text-slate-500"> ({parsedSkipped} will be skipped — already in your list or missing a name)</span>
  )}
</p>
```

**Preview table** (max 10 rows):
```tsx
<div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 mb-4">
  <table className="w-full text-xs">
    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
      <tr>
        <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
        <th className="text-left px-3 py-2 font-semibold text-slate-600">Group</th>
        <th className="text-left px-3 py-2 font-semibold text-slate-600">Notes</th>
      </tr>
    </thead>
    <tbody>
      {parsedValid.slice(0, 10).map((g, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-b-0">
          <td className="px-3 py-1.5 text-slate-800">{g.name}</td>
          <td className="px-3 py-1.5 text-slate-500">{g.group ?? ''}</td>
          <td className="px-3 py-1.5 text-slate-500">{g.notes ?? ''}</td>
        </tr>
      ))}
    </tbody>
  </table>
  {parsedValid.length > 10 && (
    <p className="px-3 py-2 text-xs text-slate-400">…and {parsedValid.length - 10} more</p>
  )}
</div>
```

**Buttons row:**
```tsx
<div className="flex items-center justify-between">
  <button onClick={() => setView('upload')} className="text-xs text-slate-500 hover:text-slate-700 underline">
    Choose Different File
  </button>
  <div className="flex gap-2">
    <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
      Cancel
    </button>
    <button
      onClick={handleImport}
      disabled={parsedValid.length === 0}
      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
    >
      Import {parsedValid.length} Guest{parsedValid.length !== 1 ? 's' : ''}
    </button>
  </div>
</div>
```

`handleImport`:
```typescript
async function handleImport() {
  for (const row of parsedValid) {
    await addGuest({
      id: crypto.randomUUID(),
      name: row.name,
      group: row.group,
      notes: row.notes,
      seatId: null,
    })
  }
  const skipped = parsedSkipped
  const count = parsedValid.length
  const msg =
    count === 0
      ? `No new guests imported (${skipped} skipped)`
      : skipped > 0
      ? `Imported ${count} guest${count !== 1 ? 's' : ''} (${skipped} skipped)`
      : `Imported ${count} guest${count !== 1 ? 's' : ''}`
  onImported(msg)
}
```

---

## Shared Implementation Notes

- **Persist pattern**: All table and guest mutations follow the pattern in `projectStore.ts`: build the full `updated: Project` object, call `set({ project: updated })`, then `persist(updated)`. Never call `persist` without updating Zustand state first.
- **Warnings are computed, never stored**: `getTableWarnings` is called at render time in `CanvasView` and `InspectorPanel`. Do not add warning fields to the `Table` interface or Dexie.
- **Seat IDs in rotateSeats**: When rotating guests, the seat IDs and seat indices do not change. Only `guestId` on seats and `seatId` on guests change. This preserves all guest.seatId links.
- **Modal layering**: All modals use the existing `Modal` component from `src/components/ui/Modal.tsx`. Nest a second `Modal` inside `TableInspector` for "Unassign All" confirmation — this is rendered into `document.body` via a portal if `Modal` uses one, otherwise it stacks naturally.
- **Table label in EditTableModal vs. inline**: The inline label input in `TableInspector` saves on blur directly via `updateTable`. The label input inside `EditTableModal` is part of the draft and saves only when the modal's Save button is clicked. If both are open simultaneously (not possible in this UI design), they are independent. They update the same field on save.
- **forwardRef typing**: The `CanvasView` export must be typed so TypeScript knows it accepts a `ref`. Use `React.forwardRef<CanvasViewHandle, object>`. The `CanvasViewHandle` interface must be exported so `ProjectPage.tsx` can import it for `useRef<CanvasViewHandle>(null)`.
- **MIN_ZOOM / MAX_ZOOM constants**: These are defined at the top of `CanvasView.tsx` as `const MIN_ZOOM = 0.25` and `const MAX_ZOOM = 4`. `handleResetZoom` must reference them by name, not hardcoded values.
- **getSeatPositions import in panToSeat**: `panToSeat` uses `getSeatPositions` from `src/lib/tableGeometry.ts`. This import is already present in `CanvasView.tsx` for potential future use or must be added. Verify the import is present before using.
- **export.ts cleanup**: After removing the `labelY` usage, if `getLabelY` is the only import from `tableGeometry` that becomes unused in `export.ts`, remove it from the import list to avoid TypeScript warnings.
