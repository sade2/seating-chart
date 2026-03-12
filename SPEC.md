# Seating Chart App — Master Specification

## Overview

A spatially-aware, browser-based seating chart builder. Users create events, define a room, place proportionally-accurate tables on an SVG canvas, manage a guest list, and assign guests to seats by clicking. All data is stored locally in the browser with no backend required.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| Canvas | SVG (React-rendered) |
| State | Zustand |
| Persistence | Dexie.js (IndexedDB) |
| Drag & Drop | Custom SVG mouse events (`onMouseDown/Move/Up`) |
| CSV Parsing | Papa Parse |
| Export | html2canvas + jsPDF |
| Styling | Tailwind CSS |

---

## Data Model

```typescript
interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  room: Room
  tables: Table[]
  guests: Guest[]
}

interface Room {
  widthFt: number
  heightFt: number
  pixelsPerFoot: number   // base scale; zoom mutiplies this
}

interface Table {
  id: string
  label: string           // "Table 1" by default, user-renamable
  type: 'round' | 'rectangular' | 'square'
  sizeFt: number          // diameter for round; length for rect/square
  widthFt?: number        // rectangular only (~2.5ft standard depth)
  x: number               // feet from room origin
  y: number               // feet from room origin
  rotation: number        // degrees (rect/square only)
  seats: Seat[]
}

interface Seat {
  id: string
  tableId: string
  index: number           // position index around/along table
  guestId: string | null
}

interface Guest {
  id: string
  name: string
  group?: string
  notes?: string
  seatId: string | null
}
```

---

## Coordinate System

- Canvas operates in **real-world feet** internally
- `pixelsPerFoot` converts feet → screen pixels (e.g. `20px/ft`)
- A 6ft round table = SVG circle with `r = 3 * pixelsPerFoot`
- Zoom adjusts `pixelsPerFoot` uniformly via scroll wheel — all elements scale together
- Pan is a viewport translate (x, y offset) applied via SVG `transform`
- Scroll wheel = zoom, click-drag on empty canvas = pan

---

## Standard Table Sizes & Seat Recommendations

| Type | Size | Min | Recommended | Max |
|---|---|---|---|---|
| Round | 4ft (48in) | 4 | 5 | 6 |
| Round | 5ft (60in) | 6 | 7 | 8 |
| Round | 6ft (72in) | 8 | 9 | 10 |
| Rectangular | 6ft | 6 | 6 | 8 |
| Rectangular | 8ft | 8 | 8 | 10 |
| Square | 3ft (36in) | 2 | 4 | 4 |
| Square | 4ft (48in) | 4 | 4 | 6 |

User can override seat count. Recommendation shown as a hint during table insertion.

---

## Color Conventions (Minimal Palette)

| Element | Color |
|---|---|
| Canvas background | White / off-white |
| Room boundary | Light grey border |
| Table fill | Light neutral (e.g. `#f1f5f9`) |
| Table stroke | `#94a3b8` |
| Empty seat | `#d1d5db` (grey) |
| Occupied seat | `#6366f1` (indigo) |
| Selected seat (active assignment) | `#f59e0b` (amber highlight) |
| Unassigned guest in list | `#f87171` (soft red) |
| Assigned guest in list | `#4ade80` (green) |
| Guest selected for assignment | `#f59e0b` amber highlight |

---

## App Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [← Projects]   Smith Wedding 2026       [Export ▾]  [⚙]   │
├───────────────┬─────────────────────────────┬───────────────┤
│               │                             │               │
│  GUEST LIST   │        SVG CANVAS           │  INSPECTOR    │
│  ──────────── │   ┌─────────────────────┐   │  (context-    │
│  + Add guest  │   │                     │   │   sensitive:  │
│  ↑ Import CSV │   │  ○ Tbl 1  ▭ Tbl 2  │   │   table,      │
│               │   │                     │   │   seat, or    │
│  ● John S. ✓  │   │     ○ Tbl 3         │   │   empty)      │
│  ○ Jane D.    │   │                     │   │               │
│  ○ Bob K.     │   └─────────────────────┘   │               │
│               │                             │               │
│  [Search...]  │   Zoom: scroll  Pan: drag   │               │
└───────────────┴─────────────────────────────┴───────────────┘
```

---

## Chair Placement Rules (v1)

- **Round tables**: chairs evenly distributed by angle around the circumference
- **Rectangular tables**: chairs evenly spaced along the two long sides only (short ends excluded in v1)
- **Square tables**: one chair per side (4 total for 3ft), or two per side for larger sizes
- Chair customization (per-side counts, end seats) deferred to v2

---

## Feature Phases

### Phase 1 — Scaffold & Project Dashboard
### Phase 2 — Room Canvas & Navigation
### Phase 3 — Table Insertion & Rendering
### Phase 4 — Guest Management
### Phase 5 — Seat Assignment
### Phase 6 — Export

---

## Future Phases (Post-v1)

| Version | Feature |
|---|---|
| v2 | Floorplan image upload; user defines scale by clicking two known points |
| v2 | Decor elements (stage, dance floor, bar — labeled rectangles) |
| v2 | Undo/redo (command pattern) |
| v2 | Chair end-seat customization for rectangular tables |
| v3 | CSV export of assignments (name, table label, seat number) |
| v3 | JSON project export/import |
| v3 | Serpentine/custom table shapes |
| v3 | Read-only shareable link (state encoded in URL hash) |

---

---

# Step-by-Step Implementation Prompts

Use these prompts sequentially. Each prompt assumes the previous phase is complete and working. Paste the prompt into a new conversation with Claude Code, pointing at this repo.

---

## Prompt 1 — Project Scaffold

```
Bootstrap a new seating chart web app using Vite + React + TypeScript in the current directory.

Install and configure:
- Tailwind CSS v3 (with PostCSS)
- Zustand (state management)
- Dexie.js (IndexedDB wrapper)
- React Router v6 (for / home and /project/:id routes)

Set up the following directory structure:
src/
  components/
  pages/
  store/
  db/
  types/
  lib/

Create src/types/index.ts with the full data model from SPEC.md (Project, Room, Table, Seat, Guest interfaces).

Create src/db/index.ts — a Dexie database class with a `projects` table keyed by id. The stored value is the full Project object (serialized as JSON blob or structured).

Create a minimal App.tsx with React Router: route "/" renders a placeholder HomePage, route "/project/:id" renders a placeholder ProjectPage.

Do not build any real UI yet — just ensure the app compiles and runs with `npm run dev`.
```

---

## Prompt 2 — Project Dashboard (Home Page)

```
Build the home page (src/pages/HomePage.tsx) for the seating chart app.

This page is a project dashboard. It should:

1. On load, fetch all projects from Dexie and display them in a grid of cards.
   Each card shows: project name, date created, number of guests, number of tables.

2. Have a "New Project" button that opens a small modal asking for:
   - Project name (text input, required)
   - Room width in feet (number input, default 40)
   - Room height in feet (number input, default 60)
   On confirm, create a new Project record in Dexie with:
   - id: crypto.randomUUID()
   - createdAt/updatedAt: Date.now()
   - room: { widthFt, heightFt, pixelsPerFoot: 20 }
   - tables: [], guests: []
   Then navigate to /project/:id.

3. Each project card has:
   - Click to open → navigates to /project/:id
   - A "Rename" option (inline edit or small modal)
   - A "Delete" option with a confirmation prompt

Use Tailwind for all styling. Keep the design minimal and clean — white cards, grey borders, simple typography.
Use the Project and Room types from src/types/index.ts.
```

---

## Prompt 3 — Canvas Foundation & Room Viewport

```
Build the SVG canvas for the project editor page (src/pages/ProjectPage.tsx).

The page should have a 3-column layout:
- Left panel (240px): Guest list (placeholder for now — just show "Guest List" label)
- Center: SVG canvas (flex-grow, fills remaining space)
- Right panel (240px): Inspector (placeholder for now)

SVG Canvas requirements:

1. Load the project from Dexie by the :id param from the URL. Display the project name in a top toolbar.

2. Render an SVG that fills the center column. Inside, draw:
   - A white background rect filling the SVG
   - A room boundary rect, sized proportionally: widthFt * pixelsPerFoot wide, heightFt * pixelsPerFoot tall
   - The room rect should be centered in the viewport on load
   - A light grid inside the room (1ft grid lines, very subtle — #f0f0f0 color)

3. Zoom via scroll wheel:
   - Scroll up = zoom in, scroll down = zoom out
   - Min zoom: 0.5x, Max zoom: 4x
   - Zoom toward the cursor position (not the origin)
   - Zoom is implemented as a CSS/SVG transform scale on the canvas group

4. Pan via click-drag on empty canvas background:
   - Mouse down on empty SVG background → start pan
   - Mouse move → translate the canvas group
   - Mouse up → end pan
   - Cursor should change to "grab" while panning

5. A scale bar in the bottom-left corner of the SVG viewport (outside the pan/zoom group) showing current scale (e.g. "1 ft = 20px").

Store zoom level and pan offset in local component state (not Zustand — these are ephemeral).
Use the Project, Room types from src/types/index.ts.
```

---

## Prompt 4 — Table Insertion & SVG Rendering

```
Add table insertion and rendering to the seating chart canvas.

Reference SPEC.md for table types, sizes, seat counts, and coordinate system.

1. Add an "Insert" button to the top toolbar. Clicking it opens a dropdown menu:
   Insert → Table → Round    → [4ft | 5ft | 6ft]
                  → Rectangular → [6ft | 8ft]
                  → Square   → [3ft | 4ft]

2. When a size is selected, show a small popover/modal: "How many seats?"
   - Display min / recommended / max for that table size (from SPEC.md)
   - Default to the recommended value
   - Number input with +/- buttons, clamped to min/max
   - Confirm button

3. On confirm, add a new Table to the project (update Dexie + Zustand):
   - id: crypto.randomUUID()
   - label: "Table N" (auto-increment based on existing table count)
   - type, sizeFt, widthFt (for rectangular: widthFt = 2.5)
   - x, y: center of the current viewport (in feet)
   - rotation: 0
   - seats: array of Seat objects (one per seat count, all guestId: null)

4. Render each table on the SVG canvas:
   Round: <circle> centered at (x, y), r = (sizeFt / 2) * pixelsPerFoot
   Rectangular: <rect> centered at (x, y), width = sizeFt * pixelsPerFoot, height = widthFt * pixelsPerFoot, rotation applied via transform
   Square: <rect> with equal width/height = sizeFt * pixelsPerFoot

   Table fill: #f1f5f9, stroke: #94a3b8, stroke-width: 2

5. Render seats for each table:
   Round: evenly distribute by angle around circumference. Each seat is a small circle (r=8px in screen space, so r = 8/zoom in SVG units) placed just outside the table edge.
   Rectangular: evenly space seats along the top and bottom long sides only.
   Square: one seat centered on each of the 4 sides.

   Empty seat fill: #d1d5db, stroke: #9ca3af

6. Render the table label (e.g. "Table 1") as an SVG <text> centered below the table shape.

7. Tables should be draggable: mousedown on a table → drag → mouseup updates x, y in Dexie and Zustand. Do not start a pan when the mousedown is on a table.

8. Rectangular/square tables should have a visible rotation handle (small circle above the table). Drag the handle to rotate the table. Snap rotation to 15-degree increments while holding Shift.

All positions stored in feet; multiply by pixelsPerFoot for SVG coordinates.
```

---

## Prompt 5 — Inspector Panel

```
Build the right-side Inspector panel for the seating chart editor.

The inspector is context-sensitive and shows different content based on what is selected on the canvas.

Selection state lives in Zustand:
  selectedTableId: string | null
  selectedSeatId: string | null

1. Nothing selected → Inspector shows:
   - Room dimensions (widthFt x heightFt)
   - "Click a table or seat to inspect it"

2. Table selected (click on table shape, not on a seat):
   - Editable label field (text input, auto-saves on blur)
   - Table type and size (read-only display)
   - Seat count (read-only for now)
   - "Delete Table" button (red, with confirmation — warns if any seats are occupied)
   - Clicking elsewhere on empty canvas deselects

3. Seat selected (click on a seat circle):
   - Shows table it belongs to
   - If seat is empty: shows "Empty seat" and the selected guest name if one is pending assignment (see Phase 5)
   - If seat is occupied: shows guest name + "Unassign" button
   - "Unassign" removes the guestId from the seat and clears the seatId from the guest, saves to Dexie

4. Visual feedback on canvas:
   - Selected table: add a blue outline ring around the table (stroke: #6366f1, stroke-width: 2, no fill)
   - Selected seat: amber highlight (fill: #f59e0b)

Keep the inspector panel clean: label at top, fields below, destructive actions at the bottom in red.
```

---

## Prompt 6 — Guest List Panel

```
Build the left-side Guest List panel for the seating chart editor.

1. Display a scrollable list of all guests in the current project.
   Each guest row shows:
   - Guest name
   - Group name (if set), in smaller grey text
   - Status badge: green dot if assigned, red dot if unassigned

2. At the top of the panel:
   - A search/filter input (filters by name or group, case-insensitive)
   - An "Add Guest" button → opens a small inline form or modal:
     - Name (required)
     - Group (optional)
     - Notes (optional)
     On submit, creates a Guest in Dexie + Zustand with seatId: null

3. A "Import CSV" button:
   - Opens a file picker (accept: .csv)
   - Parse with Papa Parse
   - Expected columns: `name` (required), `group` (optional), `notes` (optional)
   - Other columns are ignored
   - Duplicate names in the same import are skipped
   - Show a result toast: "Imported 24 guests (2 skipped)"
   - All imported guests start with seatId: null

4. Each guest row has a hover menu (⋯ icon) with:
   - Edit (opens edit modal with same fields as add)
   - Delete (confirm if assigned — warn that their seat will be cleared)

5. Show a summary below the search bar:
   "12 / 30 guests assigned"

Use Tailwind for styling. Guest rows should be compact but legible.
The panel should be independently scrollable from the canvas.
```

---

## Prompt 7 — Seat Assignment Flow

```
Implement the seat assignment interaction in the seating chart editor.

Assignment state in Zustand:
  pendingGuestId: string | null   // guest selected for assignment

Flow:
1. User clicks a guest row in the Guest List panel:
   - If guest is already assigned: do nothing (they must unassign first via inspector)
   - If guest is unassigned: set pendingGuestId = guest.id
   - Highlight the guest row with an amber background (#fef3c7)
   - Show a banner below the toolbar: "Assigning [Name] — click an empty seat, or press Escape to cancel"

2. While pendingGuestId is set:
   - Empty seats pulse with an amber outline to indicate they are clickable
   - Occupied seats are visually dimmed (opacity: 0.4) and do not respond to click
   - Clicking an empty seat:
     - Sets seat.guestId = pendingGuestId
     - Sets guest.seatId = seat.id
     - Saves both to Dexie
     - Clears pendingGuestId
     - Hides the banner
   - Pressing Escape cancels without assigning (clears pendingGuestId)
   - Clicking empty canvas background also cancels

3. Occupied seats:
   - Fill: #6366f1 (indigo)
   - Show guest initials as SVG <text> inside the seat circle (e.g. "JS" for John Smith)
   - Clicking an occupied seat (when not in assignment mode) selects it in the Inspector (shows unassign option)

4. Empty seats:
   - Fill: #d1d5db (grey)
   - No text

5. Guest list row states:
   - Assigned: green dot, normal opacity
   - Unassigned: red dot, normal opacity
   - Pending (selected for assignment): amber background highlight

Ensure all state changes persist to Dexie immediately.
```

---

## Prompt 8 — Export (PNG & PDF)

```
Add PNG and PDF export to the seating chart editor.

Add an "Export" button in the top toolbar with a dropdown:
  → Export as PNG
  → Export as PDF

Install: html2canvas, jspdf

PNG Export:
1. Temporarily hide the inspector and guest panels (or just capture the SVG canvas element)
2. Use html2canvas to capture the SVG canvas area (the room boundary and all tables/guests)
3. Fit the canvas to the room boundary — reset pan/zoom to fit the entire room in view before capturing
4. Download the result as "seating-chart.png"

PDF Export:
1. Perform the same canvas capture as PNG
2. Use jsPDF to create an A4 or Letter page (landscape if room is wider than tall)
3. Add the project name as a title at the top of the page
4. Add the current date below the title
5. Embed the captured image below, scaled to fill the page with margins
6. Download as "seating-chart.pdf"

Edge cases:
- Show a loading spinner during capture (it can take 1-2 seconds)
- If the project has no tables, show a toast: "Nothing to export yet"

Keep the export faithful to what is shown on screen: table labels, guest initials in seats, color coding.
```

---

## Appendix — Color Reference

| Element | Tailwind | Hex |
|---|---|---|
| Canvas background | bg-white | #ffffff |
| Room boundary | border-gray-300 | #d1d5db |
| Table fill | bg-slate-100 | #f1f5f9 |
| Table stroke | — | #94a3b8 |
| Empty seat | — | #d1d5db |
| Occupied seat | — | #6366f1 |
| Pending/selected | — | #f59e0b |
| Assigned guest badge | green-400 | #4ade80 |
| Unassigned guest badge | red-400 | #f87171 |

---

## Appendix — File Structure (Target)

```
src/
  types/
    index.ts                 # All TypeScript interfaces
  db/
    index.ts                 # Dexie database instance
  store/
    projectStore.ts          # Zustand store (project, tables, guests, selection state)
  lib/
    tableGeometry.ts         # Seat position calculations (round, rect, square)
    exportHelpers.ts         # PNG/PDF export logic
    csvParser.ts             # Papa Parse wrapper
  pages/
    HomePage.tsx             # Project dashboard
    ProjectPage.tsx          # Editor shell (layout only, composes panels)
  components/
    canvas/
      CanvasView.tsx         # SVG canvas, zoom/pan
      TableShape.tsx         # Renders a single table + seats
      SeatCircle.tsx         # Renders a single seat
      RoomBoundary.tsx       # Room rect + grid
    panels/
      GuestListPanel.tsx     # Left panel
      InspectorPanel.tsx     # Right panel
    toolbar/
      Toolbar.tsx            # Top bar, insert menu, export
    ui/
      Modal.tsx              # Generic modal wrapper
      Toast.tsx              # Notification toasts
```
