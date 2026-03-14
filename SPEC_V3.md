# SPEC_V3

## 1. Seat Number Visibility

Seats already have an `index` field (0-based integer) on the `Seat` type. Seat numbers are always `index + 1` and are **static** — they are tied to the physical seat position, not to any guest assignment. When a guest is rotated to a different seat via the "Rotate Guests" buttons in the Table Inspector, the guest moves to a new seat number; the seat numbers themselves do not change.

### Seat Inspector (Right Panel)
- At the top of the Seat Inspector, display both the table label and the seat number together.
- Format: `[Table Label] — Seat [N]` (e.g., "Table 3 — Seat 2")
- This replaces/enhances the existing table label link at the top of the inspector.

### Table Inspector Guest List (Right Panel)
- In the scrollable seat list within the Table Inspector, prefix each row on the left side with the seat number.
- Format: `[N]  [Guest Name / Empty]`
- Seat number should be visually distinct (e.g., muted/secondary color, fixed-width) so names remain easy to scan.

### Canvas
- Seat numbers are **not** displayed on the canvas.

---

## 2. Table Rotation Overhaul

### Remove Rotation Handle
- The drag-to-rotate handle (the elongated element extending from a table on the canvas) is removed for **all** table types, including round tables.
- There is no longer any drag-based rotation on the canvas.

### Rotation Degree Input in Edit Table Modal
- Add a numeric rotation field to the Edit Table Modal (and the new Create Table Modal — see Feature 5).
- Label: "Rotation" with a degree symbol (°).
- Input accepts integers 0–359. Values wrap around (e.g., typing 360 normalizes to 0).
- This is the sole mechanism for rotating a table.

### Upright Guest Initials
- When a table is rotated, the guest initials circle (the filled circle showing a guest's initials in an occupied seat) must **not** rotate with the table. The initials text must always remain upright (unrotated in world space).
- This applies both on the **canvas** and in the **exported PNG/PDF**.
- Implementation: apply a counter-rotation transform to the initials element equal to the negative of the table's rotation.

### Round Table Rotation
- Round tables must now support rotation. Rotating a round table shifts seat positions around the circumference, useful for fine-tuning which direction a particular seat faces.
- Rotation input in both Edit Table Modal and Create Table Modal applies to round tables identically to rectangular/square tables.

---

## 3. Unassign Guest via Guest List Panel

In the `GuestListPanel`, the 3-dot menu (`GuestRowMenu`) currently provides **Edit** and **Remove** options.

### Change
- If the guest has a `seatId` (i.e., is assigned to a seat), add a third menu item: **"Unassign from seat"**.
- Clicking this immediately unassigns the guest (sets `seatId` to `null` on the guest and `guestId` to `null` on the corresponding seat).
- No confirmation dialog is needed — this is a low-risk, easily reversible action.
- The menu item should only appear when the guest is currently assigned; it should not be present for unassigned guests.

---

## 4. Guest Table Preview in Guest List Panel

In the `GuestListPanel`, each guest row currently shows: a status dot (left), guest name + group (center), and a 3-dot menu (right on hover).

### Change
- If a guest is assigned to a seat/table, display an assignment badge on the **right side of the row**, just to the left of the 3-dot menu.
- The badge is a compact, right-aligned block containing two lines:
  - **Top line**: Table label (e.g., "Table 3") — larger/normal weight
  - **Bottom line**: "Seat [N]" (e.g., "Seat 2") — smaller font, muted color
- The badge should be visible at all times (not just on hover) when the guest is assigned.
- When the guest is unassigned, the badge area is empty (no placeholder).
- The badge should not overflow or push other elements — truncate the guest name if necessary.

---

## 5. New Create Table Modal

### Overview
This modal replaces the two-step Insert → preset → SeatCountModal flow. The Create Table Modal is a single modal that consolidates all table creation options. It is distinct from the Edit Table Modal (separate component) but shares the same visual design language.

### Trigger
- In the toolbar, the **Insert** menu now has a single option: **"Table"**. Clicking it opens the Create Table Modal.
  - The previous sub-menu listing individual presets (Round 60", Rectangular 8ft, etc.) is removed.
- The modal can also be opened from the right-click context menu (see Feature 6) with an optional canvas position passed in.

### Modal Fields
The modal contains all configuration options needed to fully define a new table:

1. **Label** — Text input, auto-populated with the next logical table name (e.g., "Table 4" if three tables exist). Editable.
2. **Table Type & Size** — Preset grid identical to what exists in the Edit Table Modal (grouped by Round, Rectangular, Square; each preset shows seat range). Selecting a preset updates type, dimensions, and the seat count suggestion.
3. **Seat Count** — Increment/decrement adjuster (same as Edit Table Modal). Min 1 seat. Shows warning if outside recommended range for selected preset.
4. **Rotation** — Numeric degree input (0–359°), defaulting to 0.

### Guest Assignment
- Guest assignment is **not** included in this modal for now.
- Keep the modal's internal structure extensible (e.g., a clear section break or commented placeholder) so that a guest-assignment UI can be added in a future iteration without a full redesign.

### Submit
- Button label: **"Create Table"**
- On submit: create the table at the provided position (if called from right-click, use the right-click canvas coordinates; otherwise default to room center), add it to the store, and close the modal.

### SeatCountModal Retirement
- The existing `SeatCountModal` is no longer used and can be removed.

---

## 6. Right-Click Context Menu

### Behavior
- Right-clicking anywhere on the active canvas opens a floating context menu at the cursor position.
- Opening the right-click menu immediately **dismisses any existing selection** (table, seat) and **cancels any pending action** (e.g., pending guest assignment mode).
- The menu closes when the user clicks anywhere outside of it (including another right-click elsewhere).
- The menu is a standard styled dropdown panel, consistent with other menus in the UI.

### Menu Structure

#### Right-click on empty canvas space:
```
New  >
```
- **New** has a submenu indicator (">") and expands to:
  - **Table** — opens the Create Table Modal, with the right-clicked canvas position passed as the initial table position.
  - **Guest** — opens the existing Create Guest modal (same as the "+" button in the Guest List Panel).

#### Right-click on a table:
```
New          >
Edit Table
```
- **New** behaves identically to above.
- **Edit Table** — opens the Edit Table Modal for the right-clicked table.

#### Right-click on a seat:
```
New          >
Assign Guest
```
- **New** behaves identically to above.
- **Assign Guest** — menu item is present but **not wired up** in this iteration. It is greyed out or shown as a placeholder for future implementation.

### Position Conversion
- The right-click position is in screen (pixel) coordinates. When passed to table creation, convert to canvas world coordinates using the current pan and zoom: `worldX = (screenX - pan.x) / (pixelsPerFoot * zoom)`.

---

## 7. Guest List Export

### Location
- Guest export lives in the **top toolbar Export menu**, in its own clearly separated section below the existing PNG/PDF options.
- Section header: "Guest List" (or a visual divider separating it from the canvas export options).
- Three export options in this section:
  - **Export as CSV**
  - **Export as JSON**
  - **Export as Plaintext**

### CSV Format
- Same column structure as import (name, group, notes), plus two additional columns appended:
  - `TableLabel` — the label of the assigned table (e.g., "Table 3"), empty string if unassigned.
  - `SeatNumber` — the seat number (1-based index), empty string if unassigned.
- Header row included.
- File name: `guests.csv`

### JSON Format
- A JSON array of guest objects. Each object contains:
  - `name: string`
  - `group: string | null`
  - `notes: string | null`
  - `table: string | null` — the table label, or `null` if unassigned
  - `seat: number | null` — the seat number (1-based), or `null` if unassigned
- File name: `guests.json`

### Plaintext Format
- Guests are grouped by their assigned table, sorted by seat number within each table.
- Format:
  ```
  Table 1
    Seat 1: Alice Smith
    Seat 2: Bob Jones
    Seat 4: Carol White

  Table 2
    Seat 1: David Lee
    ...

  Unassigned
    Frank Brown
    Grace Kim
  ```
- The **Unassigned** section appears at the end. If there are no unassigned guests, the section is omitted.
- If all guests are unassigned, only the Unassigned section appears (no table sections).
- File name: `guests.txt`

---

## 8. Enhanced Add Guest Modal

### Overview
The existing single-guest `GuestFormModal` is replaced with an enhanced multi-guest modal. The modal supports adding any number of guests in one session, all sharing a single Group value.

### Modal Structure
- **Group** field at the top — a single input that applies to all guests added in this session. Optional.
- Below the group field: a list of **guest rows**, one per guest being added.
- An **"+ Add another guest"** button at the bottom of the list adds a new blank guest row.
- The modal can be submitted with any number of rows (minimum 1).

### Guest Row Fields
Each guest row contains:
- **Name** — text input. Required for normal guests. Leave empty if this row is a +1 (see below).
- **Notes** — text input, optional. Per-guest, not shared.
- **"+ Add +1"** button — adds a +1 sub-row linked to this guest (see below).
- A **remove row** button (e.g., "×") to delete this row, except when it is the only row.

### +1 Guest Rows
- A +1 row is added beneath its linked ("invited") guest row.
- +1 rows are visually indented or styled distinctly to show the relationship.
- A +1 row has only a **Notes** field (no Name field — the name is fixed as `"Guest of [Invited Guest Name]"`).
- Multiple +1s can be added to the same invited guest.
- +1 rows can be removed individually with their own "×" button.

### Data Model Changes
- Add a `plusOneOf: string | null` field to the `Guest` type.
  - For regular guests: `null`.
  - For +1 guests: the `id` of the invited guest they are linked to.
- The display name for a +1 guest is stored as `"Guest of [Name]"` at creation time (e.g., "Guest of Alice Smith"). If the invited guest's name is later edited, the +1's name does **not** auto-update — it is a snapshot at creation.

### Deletion Cascade
- When a guest who has +1s is deleted, a **confirmation dialog** must appear before deletion proceeds.
- The dialog lists the +1s that will also be deleted (e.g., "Deleting Alice Smith will also remove: Guest of Alice Smith").
- The user must confirm to proceed. Cancelling leaves all guests intact.
- This cascade applies whether deletion is triggered from the 3-dot menu in the Guest List Panel or any other deletion path.

### Editing +1 Guests
- +1 guests appear as normal entries in the Guest List Panel, with a visual indicator (e.g., a small "+" prefix or muted label) showing they are a +1.
- Editing a +1 guest via the 3-dot menu Edit option allows changing their Notes field only; the name field should be read-only (since it is derived).
- +1 guests can be assigned to any seat — there is no constraint tying them to the same table as their linked guest.
