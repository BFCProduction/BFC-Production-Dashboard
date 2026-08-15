// Shared with BFC Sunday Ops' access model. `is_staff` is the NEW gate that
// controls entry to this app only; it does not affect Sunday Ops permissions.
export type AppAccessLevel = 'user' | 'manager' | 'admin'

// ── Calendar ────────────────────────────────────────────────────────────────
export type CalendarLayer = 'personal' | 'pco' | 'monday'

export interface CalendarEvent {
  id: string
  layer: CalendarLayer
  title: string
  start: string          // ISO 8601
  end: string | null     // ISO 8601; null = all-day / no duration
  allDay: boolean
  personName?: string    // for personal-calendar chips
  location?: string
  sourceUrl?: string     // deep link back to PCO / monday / Google
}

// ── monday.com tasks ─────────────────────────────────────────────────────────
export interface MondayAssignee {
  id: string
  name: string
  avatarUrl: string | null
}

export interface MondayUpdate {
  id: string
  authorName: string
  authorAvatarUrl: string | null
  createdAt: string
  body: string           // plain text
}

export interface MondayTask {
  id: string
  name: string
  group: 'inbox' | 'next_actions' | string
  groupTitle?: string
  groupColor?: string | null   // monday group color (hex)
  status: string | null        // priority label (Low/Medium/High/…)
  statusColor: string | null   // monday priority color (hex)
  dueDate: string | null // YYYY-MM-DD
  assignees: MondayAssignee[]
  updatesCount: number
  updates: MondayUpdate[]     // loaded lazily when a task is expanded
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
