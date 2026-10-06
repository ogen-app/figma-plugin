import { useEffect, useState } from 'preact/hooks'
import { isApiError, type ApiClient } from '../../api/client'
import { listPosts, type PluginPost } from '../../api/posts'

const SEARCH_DEBOUNCE_MS = 250

export interface PostPickerProps {
  api: ApiClient
  selected: PluginPost | null
  onSelect: (post: PluginPost | null) => void
}

export function PostPicker({ api, selected, onSelect }: PostPickerProps) {
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<PluginPost[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (selected) return
    const ctrl = new AbortController()
    setState('loading')
    const timer = setTimeout(async () => {
      try {
        const found = await listPosts(api, query, ctrl.signal)
        setPosts(found)
        setState('ready')
      } catch (err) {
        if (ctrl.signal.aborted || (isApiError(err) && err.status === 401)) return
        setState('error')
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [api, query, selected])

  if (selected) {
    return (
      <div class="post-selected">
        <PostSummary post={selected} />
        <button class="link" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    )
  }

  return (
    <div class="post-picker">
      <input
        type="search"
        placeholder="Search draft posts"
        aria-label="Search draft posts"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <div class="post-results" aria-live="polite">
        {state === 'loading' && <p class="muted small">Loading posts…</p>}
        {state === 'error' && <p class="warning small">Could not load posts.</p>}
        {state === 'ready' && posts.length === 0 && (
          <p class="muted small">{query ? 'No draft posts match.' : 'No draft posts in this workspace.'}</p>
        )}
        {state === 'ready' &&
          posts.map((post) => (
            <button key={post.id} class="post-option" onClick={() => onSelect(post)}>
              <PostSummary post={post} />
            </button>
          ))}
      </div>
    </div>
  )
}

function PostSummary({ post }: { post: PluginPost }) {
  const meta = [post.platform, post.campaign?.name, attachments(post.attachment_count)].filter(Boolean).join(' · ')
  return (
    <div class="post-summary">
      <div class="item-name">{post.title || 'Untitled post'}</div>
      {meta && <div class="muted small">{meta}</div>}
    </div>
  )
}

function attachments(n: number) {
  return n === 0 ? '' : n === 1 ? '1 attachment' : `${n} attachments`
}
