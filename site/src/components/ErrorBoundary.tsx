import { Component, type ReactNode } from 'react'

/** Recovers from the classic SPA failure mode: after a new deploy, a tab that
 * was open beforehand still references old hashed chunk files that Pages has
 * since replaced. A lazy import then 404s and, without a boundary, React tears
 * the whole tree down to a blank screen.
 *
 * A chunk-load failure auto-reloads once (guarded so it can't loop) to pull the
 * fresh index + chunks. Any other render error shows a friendly reload card
 * instead of a blank page. */

const RELOAD_GUARD = 'betflow.chunkReloaded'

function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /failed to fetch/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /'text\/html' is not a valid JavaScript MIME/i.test(msg)
  )
}

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (isChunkError(error) && !sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.setItem(RELOAD_GUARD, '1')
      window.location.reload()
    }
  }

  render() {
    if (this.state.error) {
      const chunk = isChunkError(this.state.error)
      return (
        <div className="boot boot--busy">
          <span className="num">
            {chunk
              ? 'A new version is available.'
              : 'Something went wrong rendering this view.'}
          </span>
          <button
            className="shell__lock"
            onClick={() => {
              sessionStorage.removeItem(RELOAD_GUARD)
              window.location.reload()
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
