import type { PageFindings } from './panel-types.js'
import { useLocaleT } from '../locales/use-locale-t.js'
import { diffSeverityLabel } from './diff-i18n.js'

const SEVERITY_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high: '#d92d20',
  medium: '#dc8a05',
  low: '#2f62b9',
}

/**
 * Render the AI write-back findings for one page (design vs code), shown under
 * the high-fidelity comparison. Each card states the location, the design
 * expectation, the actual code result and the actionable fix.
 */
export function FindingsSection({ data }: { data: PageFindings }) {
  const t = useLocaleT()
  const time = new Date(data.savedAt)
  const at = Number.isNaN(time.getTime())
    ? ''
    : `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid #cfe0d8',
        borderRadius: 10,
        padding: '8px 10px',
        background: '#f5faf7',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: 12, color: '#0d4a3a' }}>
          {t('findings.title', { count: data.findings.length })}
        </strong>
        {at ? (
          <span style={{ fontSize: 10, color: '#6b8a7d' }}>{t('findings.updatedAt', { time: at })}</span>
        ) : null}
      </div>

      {data.summary ? (
        <p
          style={{
            fontSize: 12,
            color: '#335047',
            lineHeight: 1.6,
            margin: '0 0 8px',
          }}
        >
          {data.summary}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.findings.map((f, i) => (
          <div
            key={i}
            style={{
              border: '1px solid #e2eae5',
              borderRadius: 8,
              background: '#fff',
              padding: '6px 8px',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <div>
              <span style={{ color: SEVERITY_COLOR[f.severity], fontWeight: 700 }}>
                [{diffSeverityLabel(t, f.severity)}]
              </span>{' '}
              <strong>{f.title}</strong>
              {f.location ? (
                <span style={{ color: '#7a8a82', fontWeight: 400 }}> · {f.location}</span>
              ) : null}
            </div>
            {f.expected ? (
              <div style={{ color: '#335047' }}>{t('findings.designExpected', { value: f.expected })}</div>
            ) : null}
            {f.actual ? (
              <div style={{ color: '#8a4b33' }}>{t('findings.actualCode', { value: f.actual })}</div>
            ) : null}
            {f.codeSource ? (
              <div style={{ color: '#8a7f60', wordBreak: 'break-all' }}>
                {t('findings.codeSource', { value: f.codeSource })}
              </div>
            ) : null}
            {f.suggestion ? (
              <div style={{ color: '#0f6e56' }}>{t('findings.suggestion', { value: f.suggestion })}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
