/** Inline SVG icons (Lucide-style strokes), so no icon font and no CSP exception. */
const I = ({ d, size }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
)
export const Icons = {
  files: (s?: number) => <I size={s} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8" />,
  search: (s?: number) => <I size={s} d="M21 21l-4.3-4.3|M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" />,
  box: (s?: number) => <I size={s} d="M21 8l-9-5-9 5v8l9 5 9-5z|M3.3 7.3L12 12l8.7-4.7|M12 22V12" />,
  plug: (s?: number) => <I size={s} d="M12 22v-5|M9 8V2|M15 8V2|M18 8v5a6 6 0 0 1-12 0V8z" />,
  puzzle: (s?: number) => <I size={s} d="M19.4 11c.4 0 .6.3.6.6V16a2 2 0 0 1-2 2h-4.4a.6.6 0 0 1-.6-.6c0-.5.5-.9.9-1.2.4-.3.7-.8.7-1.3a2 2 0 0 0-4 0c0 .5.3 1 .7 1.3.4.3.9.7.9 1.2a.6.6 0 0 1-.6.6H7a2 2 0 0 1-2-2v-4.4c0-.3.3-.6.6-.6.5 0 .9.5 1.2.9.3.4.8.7 1.3.7a2 2 0 0 0 0-4c-.5 0-1 .3-1.3.7-.3.4-.7.9-1.2.9a.6.6 0 0 1-.6-.6V7a2 2 0 0 1 2-2h4.4c.3 0 .6.3.6.6 0 .5-.5.9-.9 1.2-.4.3-.7.8-.7 1.3a2 2 0 0 0 4 0c0-.5-.3-1-.7-1.3-.4-.3-.9-.7-.9-1.2 0-.3.3-.6.6-.6H18a2 2 0 0 1 2 2v4.4c0 .3-.3.6-.6.6" />,
  cpu: (s?: number) => <I size={s} d="M4 4h16v16H4z|M9 9h6v6H9z|M9 1v3|M15 1v3|M9 20v3|M15 20v3|M20 9h3|M20 14h3|M1 9h3|M1 14h3" />,
  clock: (s?: number) => <I size={s} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2" />,
  sparkle: (s?: number) => <I size={s} d="M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />,
  terminal: (s?: number) => <I size={s} d="M4 17l6-6-6-6|M12 19h8" />,
  plus: (s?: number) => <I size={s} d="M12 5v14|M5 12h14" />,
  x: (s?: number) => <I size={s} d="M18 6L6 18|M6 6l12 12" />,
  chevron: (s?: number) => <I size={s} d="M9 18l6-6-6-6" />,
  chevronDown: (s?: number) => <I size={s} d="M6 9l6 6 6-6" />,
  chevronUp: (s?: number) => <I size={s} d="M18 15l-6-6-6 6" />,
  folder: (s?: number) => <I size={s} d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />,
  image: (s?: number) => <I size={s} d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z|M8.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z|M21 15l-5-5L5 21" />,
  code: (s?: number) => <I size={s} d="M16 18l6-6-6-6|M8 6l-6 6 6 6" />,
  columns: (s?: number) => <I size={s} d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M12 3v18" />,
  eye: (s?: number) => <I size={s} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  camera: (s?: number) => <I size={s} d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z|M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  file: (s?: number) => <I size={s} d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z|M14 2v5h5" />,
  link: (s?: number) => <I size={s} d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7|M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />,
  info: (s?: number) => <I size={s} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01" />,
  external: (s?: number) => <I size={s} d="M15 3h6v6|M10 14L21 3|M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  arrowUp: (s?: number) => <I size={s} d="M12 19V5|M5 12l7-7 7 7" />,
  list: (s?: number) => <I size={s} d="M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01" />,
  activity: (s?: number) => <I size={s} d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  save: (s?: number) => <I size={s} d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z|M17 21v-8H7v8|M7 3v5h8" />,
  gear: (s?: number) => <I size={s} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
}
