# Seating Chart — Feature Changelog

A running record of everything built. Organized by release batch; each section reflects one spec/planning cycle.

---

## Foundation (v1)

Core application scaffold and all primary features.

**Tech stack**: React + Vite + TypeScript, SVG canvas, Zustand (state), Dexie/IndexedDB (persistence), Tailwind CSS, PapaParse (CSV), jsPDF (export).

### Data model
- `Project` → `Room`, `Table[]`, `Guest[]`
- `Table` → `Seat[]` (positions stored in feet; rendered at `pixelsPerFoot`)
- `Guest` has `seatId: string | null`; `Seat` has `guestId: string | null`

### Project dashboard (HomePage)
- Grid of project cards showing name, date, guest count, table count
- Create project modal (name, room width/height in feet)
- Rename and delete (with confirmation) per card

### SVG canvas (CanvasView)
- Pan via click-drag on empty canvas background
- Scroll-wheel zoom (0.25×–4×), zoom toward cursor
- Scale bar (bottom-left) showing current ft/px scale
- Zoom % display + "fit to room" reset button (bottom-right)

### Table types
- **Round** — circle, seats distributed evenly around circumference
- **Rectangular** — rect, seats along both long sides
- **Square** — rect, one or two seats per side depending on size
- Standard presets with min/recommended/max seat counts
- Tables draggable by mouse; positions stored in feet

### Inspector panel (right)
- **Empty state**: room dimensions
- **Table selected**: editable label, seat list with guest names, unassign per seat, rotate guests CW/CCW, Edit Table button, Unassign All (with confirmation modal), Delete Table (with confirmation)
- **Seat selected**: back-link to table, guest name or "empty seat", Unassign button

### Guest list panel (left)
- Scrollable list with green/red assignment status dot
- Search/filter by name or group
- Add Guest button → multi-guest modal (see v3)
- Import CSV button → CSV Import wizard modal
- Guest row 3-dot menu: Edit, Unassign from seat (if assigned), Remove

### Seat assignment flow
- Click unassigned guest row → enters "pending" mode (amber highlight on row)
- Empty seats pulse with amber outline; occupied seats dim
- Click an empty seat → assigns guest; Escape or canvas click cancels
- Occupied seats show guest initials (SVG text, counter-rotated to stay upright)

### Export
- **PNG**: SVG → canvas → download `seating-chart.png`
- **PDF**: A4, landscape if wider than tall; project name + date header; image scaled to fill page; download `seating-chart.pdf`
- **Guest CSV**: `name, group, notes, TableLabel, SeatNumber`
- **Guest JSON**: array with `name, group, notes, table, seat` (null if unassigned)
- **Guest Plaintext**: grouped by table → seat order; "Unassigned" section at end

### Warnings system
- `getTableWarnings(table, room)` computed at render time (never stored)
- Out-of-bounds: table center ± half-size extends outside room
- Over-capacity: seat count exceeds preset maximum
- Canvas: red drop-shadow filter on table body + ⚠ indicator
- Inspector: amber banner at top of table inspector

---

## v2 — Inspector & UX Polish

### Table inspector redesign
- Table label centered inside table body (canvas + export)
- Guest list in inspector shows seat number prefix and per-seat Unassign button
- Rotate Guests CW/CCW buttons (atomic store action `rotateSeats`)
- "Unassign All" with confirmation modal
- `unassignAllSeats` store action

### Edit Table modal
- Full table reconfiguration: label, type/size preset grid, seat count adjuster
- Seat count adjuster shows warning when outside min/max for selected preset
- **Conflict resolution view**: when downsizing removes occupied seats, a checklist appears; user must select ≥ N guests to unassign before applying; any number ≥ N can be selected (not exactly N)
- Guest shift: before showing conflict resolution, guests are automatically shifted into retained seats where possible; conflict modal only appears when total assigned guests exceeds the new seat count
- `replaceTable` store action (atomic: new table data + guest seatId updates in one persist)

### Seat inspector
- "Back to table" link replaced with single prominent button showing `{tableLabel} — Seat {N}`
- Inspector header shows table label when a seat is selected

### Canvas navigation
- Clicking a selected table again does NOT deselect it (drag-friendly UX); clicking empty canvas deselects
- Click assigned guest row in guest list → pans canvas to that seat and selects it in inspector
- `CanvasView` exposes `panToSeat(seatId)` via `forwardRef` / `useImperativeHandle`

### Project settings (gear menu)
- **Rename Project** modal
- **Resize Canvas** modal: Static mode (width/height inputs) or Ratio mode (scale factor); shows count of tables that would go out of bounds

### CSV Import wizard
- Two-step modal: Upload view (drag-and-drop + file picker, template download) → Preview view (table of first 10 rows, skip count)
- Deduplication against existing guest names

### Seat sizing
- Fixed screen-pixel radius (`SEAT_SCREEN_R = 8px`) independent of zoom
- Clamped to min (`SEAT_SCREEN_R_MIN`) and max (`SEAT_SCREEN_R_MAX`) so seats don't vanish when zoomed out or become huge when zoomed in

---

## v3 — Tables, Context Menu, Guest Enhancements

### Table rotation overhaul
- Drag-to-rotate handle removed for all table types
- Rotation is now set via a numeric degree input (0–359°) in both Create Table and Edit Table modals
- Round tables support rotation (shifts seat positions around circumference)
- Guest initials counter-rotated to remain upright at all times (canvas + export)

### Create Table modal
- Single modal replacing the old Insert → preset → SeatCountModal two-step flow
- Fields: label (auto-named "Table N"), type/size preset grid, seat count adjuster, rotation input
- Opens from toolbar Insert → Table or from right-click context menu (with canvas position)
- `SeatCountModal` retired

### Right-click context menu
- Right-click anywhere on canvas → floating context menu at cursor
- Dismisses any existing selection and cancels pending assignment mode on open
- Closes on any outside click
- **On empty canvas**: New → Table (opens Create Table modal at clicked position) / New → Guest (opens Add Guest modal)
- **On table**: above options + "Edit Table" (opens Edit Table modal for that table)
- **On seat**: above options + "Assign Guest" (placeholder, not yet wired)

### Guest list enhancements
- **Unassign from seat** option in 3-dot menu (appears only when guest is assigned)
- **Assignment badge** on each assigned guest row: table label (top) + "Seat N" (bottom), always visible

### Enhanced Add Guest modal
- Shared **Group** field applies to all guests added in one session
- Add multiple guest rows in one modal session; each row has Name + Notes
- Each guest row has **"+1"** button to add a linked plus-one sub-row
  - Plus-one name stored as `"Guest of {parentName}"` at creation time
  - Plus-one row shows only Notes (name is fixed)
  - Removing a parent row also removes its plus-ones
- `Guest` type extended with `plusOneOf: string | null` (parent guest id)
- Delete cascade: deleting a guest with plus-ones shows confirmation listing affected plus-ones

### Seat number visibility
- Seat numbers shown in seat inspector header (`{tableLabel} — Seat {N}`)
- Seat numbers shown as prefix in table inspector guest list
- Seat numbers not shown on canvas

### Pan on canvas
- Click-and-drag on canvas background pans the view (existing behavior retained/confirmed)

---

## v4 — Bug Fixes & Bulk Assignment

### Bug fix: Guest form validation
- Add Guest modal: submit now requires **all** regular (non-plus-one) guest slots to have a non-empty name (`every` instead of `some`)

### Bug fix: Plus-one naming
- Plus-one guests now named `"{parentName}'s Guest"` instead of `"Guest of {parentName}"`

### Feature: Seat count header
- Guest list panel subtitle changed from "X / Y guests assigned" to **"X / Y Seats remain to be filled"**
- X = total seats across all tables minus filled seats; Y = total seats across all tables

### Feature: Plus-one seat rendering
- Occupied seats belonging to plus-one guests display **host's initials** (not the plus-one's own name) + a smaller **"+1"** label below
- Initials shifted up, "+1" shifted down within the seat circle
- Applied on canvas (`SeatCircle`) and in PNG/PDF export (`buildExportSVG`)
- `plusOneHostMap` (seatId → host name) computed in `CanvasView` and threaded through `TableShape` → `SeatCircle`

### Feature: Bulk Guest Assignment modal
- "Assign Guests" button added to table inspector (above "Edit Table")
- Opens `BulkAssignModal` for the selected table
- Shows all unassigned guests + guests already at this table (pre-checked, badged "here")
- Guests sorted by group (named groups first, alphabetically; ungrouped last) then by name
- Auto-fills remaining open seats with unassigned guests on open
- Once seat count is reached, additional checkboxes disabled; "Table is full — uncheck a guest to swap" notice shown
- "Assign (N)" button applies changes atomically: removes unchosen current guests, adds newly chosen guests to open seats
- `bulkAssignGuests(tableId, guestIds)` store action handles the full diff in one persist call

---

## Pending / Planned

### Insert dropdown — Shapes & Text (SPEC_V4 item 6)
- New `CanvasShape` and `CanvasText` types (circle, rectangle, square; free text)
- Insert dropdown: Table / Shape / Text options
- `CreateShapeModal` with type, dimensions, label, color
- Text objects placed directly at room center on insert
- Drag/rotate same as tables; rendered below tables on canvas
- Shape inspector: label, size, color swatches, rotation, delete
- Text inspector: content, font size, rotation, delete
- Shapes and texts included in PNG/PDF/SVG export
