/**
 * Full-cover loading modal for long-running UI testing operations (scan whole
 * file, high-fidelity compare). Mirrors the functional-testing busy overlay: a
 * spinner, a stage message and an elapsed-time readout so the operation never
 * looks frozen. Render once at the top of a panel whenever work is in progress.
 */

export interface LoadingOverlayProps {
  message?: string
  elapsedSeconds?: number
}

export function LoadingOverlay({ message, elapsedSeconds }: LoadingOverlayProps) {
  // Rotate an inner element; the arc itself is built from a conic gradient
  // masked into a ring (see O.spinner / O.spinnerArc), so it stays perfectly
  // round instead of looking like a squared-off border.
  const spinnerCss = '@keyframes tracescope-loading-spin{to{transform:rotate(360deg)}}'
  return (
    <>
      <style>{spinnerCss}</style>
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        style={O.backdrop}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div style={O.banner}>
          <svg
            style={O.spinner}
            viewBox="0 0 28 28"
            width="28"
            height="28"
            aria-hidden="true"
          >
            {/* light track */}
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke="#e4ddd0"
              strokeWidth="3"
            />
            {/* rotating arc, round caps -> always reads as a circle */}
            <circle
              cx="14"
              cy="14"
              r="11"
              fill="none"
              stroke="#0f6e56"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="52 100"
              style={O.spinnerArc}
            />
          </svg>
          <div style={O.title}>加载中，请稍候</div>
          <div style={O.message}>
            {message || '正在处理请求，网络较慢时请勿重复操作。'}
          </div>
          {typeof elapsedSeconds === 'number' ? (
            <div style={O.elapsed}>已用时 {elapsedSeconds} 秒</div>
          ) : null}
        </div>
      </div>
    </>
  )
}

const O: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: 'rgba(28, 25, 21, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    cursor: 'wait',
  },
  banner: {
    maxWidth: 380,
    width: '100%',
    borderRadius: 12,
    padding: '16px 18px',
    background: 'var(--dsh-card, #fffdf8)',
    border: '1px solid var(--dsh-border, #ddd4c5)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
    textAlign: 'center',
  },
  spinner: {
    display: 'block',
    margin: '0 auto 10px',
  },
  spinnerArc: {
    // Rotate the arc around the circle's own center so it stays a perfect ring.
    transformOrigin: '14px 14px',
    animation: 'tracescope-loading-spin 0.8s linear infinite',
  },
  title: { fontWeight: 700, marginBottom: 6, fontSize: 14 },
  message: { color: '#6b645a', fontSize: 12, lineHeight: 1.5 },
  elapsed: { marginTop: 8, fontSize: 11, color: '#8a7f70' },
}
