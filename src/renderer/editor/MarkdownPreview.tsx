import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { fileText, subscribeFileText } from './EditorHost'

/** Rendered markdown of a file tab, following the editor content live. */
export function MarkdownPreview({ path }: { path: string }) {
  const [text, setText] = useState(() => fileText(path) ?? '')
  useEffect(() => {
    setText(fileText(path) ?? '')
    let timer: ReturnType<typeof setTimeout> | undefined
    return subscribeFileText(path, (t) => { clearTimeout(timer); timer = setTimeout(() => setText(t), 120) })
  }, [path])
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false }) as string), [text])
  return <div className="md md-preview" dangerouslySetInnerHTML={{ __html: html }} />
}
