// Shared with BFC Sunday Ops' access model. `is_staff` is the NEW gate that
// controls entry to this app only; it does not affect Sunday Ops permissions.
export type AppAccessLevel = 'user' | 'manager' | 'admin'

// ── Calendar ────────────────────────────────────────────────────────────────
export type CalendarLayer = 'personal' | 'pco' | 'monday'

export interface EventAssignee {
  name: string
  position: string | null
  status: string | null   // PCO scheduling status (Confirmed / Unconfirmed / …)
}

export interface CalendarEvent {
  id: string
  layer: CalendarLayer
  title: string
  start: string          // ISO 8601
  end: string | null     // ISO 8601; null = all-day / no duration
  allDay: boolean
  personName?: string    // for personal-calendar chips
  calendarId?: string    // dashboard_calendar_links.id — for per-viewer show/hide
  context?: string       // PCO: service label (9:00/11:00/…) or special-event plan title
  assignees?: EventAssignee[] // PCO: paid staff scheduled on the plan
  location?: string
  sourceUrl?: string     // deep link back to PCO / monday / Google
}

// ── monday.com tasks ─────────────────────────────────────────────────────────
export interface MondayAssignee {
  id: string
  name: string
  avatarUrl: string | null
  guest?: boolean
}

export interface MondayUpdate {
  id: string
  authorName: string
  authorAvatarUrl: string | null
  createdAt: string
  body: string           // plain text
}

export interface StatusCell {
  label: string
  color: string // hex, from monday column settings
}

export interface StatusOption { index: number; label: string; color: string }
export interface TaskOptions { priority: StatusOption[]; status: StatusOption[]; category: StatusOption[] }
export interface TasksPayload { tasks: MondayTask[]; people: MondayAssignee[]; options: TaskOptions }
export type TaskField = 'priority' | 'status' | 'category' | 'person' | 'due'

export interface MondayTask {
  id: string
  name: string
  group: 'inbox' | 'next_actions' | string
  groupTitle?: string
  groupColor?: string | null      // monday group color (hex)
  priority: StatusCell | null     // Priority column (status_18)
  statusField: StatusCell | null  // Status column (status)
  category: StatusCell | null     // Category column (status_1)
  dueDate: string | null          // e.g. "2026-08-13" or "2026-08-13 16:00"
  assignees: MondayAssignee[]
  url: string
}

// ── Community clipboard ──────────────────────────────────────────────────────
export interface ClipboardItem {
  id: string
  kind: 'file' | 'text' | 'link'
  label: string
  body: string | null       // text content, or a URL for links
  fileUrl: string | null    // signed/public storage URL for files
  fileName: string | null
  postedByName: string
  postedByAvatarUrl: string | null
  createdAt: string
  expiresAt: string
}

// ── Per-person hours strip ───────────────────────────────────────────────────
export interface PersonHours {
  personName: string
  avatarUrl: string | null
  hours: number
  approximate: boolean      // true when monday durations are missing/estimated
}
