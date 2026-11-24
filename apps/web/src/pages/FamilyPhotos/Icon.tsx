const paths: Record<string, string> = {
  folder: 'M3 6h6l2 2h10v12H3z',
  calendar: 'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18',
  add: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  left: 'm15 5-7 7 7 7',
  right: 'm9 5 7 7-7 7',
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',
  info: 'M12 11v6M12 7h.01',
  zoom: 'M10 6v8M6 10h8m1 5 6 6',
  photo: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8 8h.01',
  video: 'M3 5h13v14H3zM16 9l5-3v12l-5-3',
  lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',
  play: 'm9 5 11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}
export function FamilyIcon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'info' && <circle cx="12" cy="12" r="9" />}
      <path d={paths[name] ?? paths.photo} />
    </svg>
  )
}
