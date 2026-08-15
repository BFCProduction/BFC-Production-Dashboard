import type { LucideIcon } from 'lucide-react'
import {
  Calendar, Video, FolderOpen, CalendarDays, KanbanSquare, LayoutDashboard, SlidersHorizontal,
} from 'lucide-react'

export interface QuickLink {
  label: string
  url: string
  icon: LucideIcon
  lanOnly?: boolean // only reachable on the church network (flag in UI)
}

// Placeholder URLs where the real one isn't known yet — flagged in the note's
// open questions. Swap in the real Drive folder links when available.
export const QUICK_LINKS: QuickLink[] = [
  { label: 'Planning Center', url: 'https://services.planningcenteronline.com/', icon: Calendar },
  { label: 'RESI', url: 'https://control.resi.io/', icon: Video },
  { label: '00 Prod Docs', url: 'https://drive.google.com/', icon: FolderOpen },     // TODO: real folder URL
  { label: '05 Events', url: 'https://drive.google.com/', icon: CalendarDays },      // TODO: real folder URL
  { label: 'monday.com', url: 'https://monday.com/', icon: KanbanSquare },
  { label: 'Sunday Ops', url: 'https://bfcproduction.github.io/BFC-Sunday-Ops/', icon: LayoutDashboard },
  { label: 'Control / Flex', url: 'http://10.1.70.11:8080/master/', icon: SlidersHorizontal, lanOnly: true },
]
