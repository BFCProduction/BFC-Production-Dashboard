import { QUICK_LINKS } from '../lib/links'

export function LinksRow() {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {QUICK_LINKS.map(link => {
        const Icon = link.icon
        return (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 flex items-center gap-2 rounded-full bg-white hover:bg-gray-50 border border-gray-200 shadow-sm px-3 py-2 text-sm text-gray-700 active:scale-95 transition"
          >
            <Icon size={16} className="text-gray-500" />
            <span className="font-medium">{link.label}</span>
            {link.lanOnly && (
              <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5">
                LAN
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}
