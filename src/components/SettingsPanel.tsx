import { useState } from 'preact/hooks';
import { storage } from '../lib/storage';
import { getUsage, estimateCost } from '../lib/usage-tracker';
import { OPENAI_MODELS, type OpenAIModelId } from '../lib/model-options';

interface Props { onClose: () => void; }

export function SettingsPanel({ onClose }: Props) {
  const [accessToken, setAccessToken] = useState(storage.getApiKey());
  const [proxyUrl, setProxyUrl] = useState(storage.getProxyUrl());
  const [model, setModel] = useState<OpenAIModelId>(storage.getOpenAIModel());
  const [saved, setSaved] = useState(false);

  const usage = getUsage();
  const cost = estimateCost(usage, model);
  const normalizedProxyUrl = proxyUrl.trim();
  const isCustomEndpoint = normalizedProxyUrl.length > 0;

  const handleSave = () => {
    storage.setApiKey(accessToken.trim());
    storage.setProxyUrl(normalizedProxyUrl === '/api/openai' ? '' : normalizedProxyUrl);
    storage.setOpenAIModel(model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const s = {
    panel: {
      position: 'fixed' as const, top: '58px', right: '0',
      width: '380px', height: 'calc(100vh - 58px)',
      background: 'var(--clr-bg)', borderLeft: '1px solid var(--clr-divider)',
      padding: '24px', boxShadow: 'var(--shadow-lg)', zIndex: '100',
      overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: '0',
    },
    label: {
      display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-500)',
      color: 'var(--clr-text-3)', marginBottom: '5px',
      textTransform: 'uppercase' as const, letterSpacing: '0.5px',
    },
    input: {
      width: '100%', padding: '8px 12px', boxSizing: 'border-box' as const,
      border: '1px solid var(--clr-divider)', borderRadius: 'var(--r-sm)',
      fontSize: 'var(--text-md)', background: 'var(--clr-bg-subtle)',
      color: 'var(--clr-text-1)', fontFamily: 'var(--font)', outline: 'none',
    },
    hint: {
      fontSize: 'var(--text-xs)', color: 'var(--clr-text-3)', marginTop: '5px', lineHeight: '1.5',
    },
    sep: { margin: '18px 0', border: 'none', borderTop: '1px solid var(--clr-divider)' },
    sectionLabel: {
      fontSize: 'var(--text-xs)', fontWeight: 'var(--fw-500)', color: 'var(--clr-text-3)',
      textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '10px', display: 'block',
    },
    statRow: { fontSize: 'var(--text-sm)', color: 'var(--clr-text-2)', lineHeight: '2' },
  };

  return (
    <div style={s.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--fw-600)', color: 'var(--clr-text-1)' }}>Configuracion</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--clr-text-3)' }}>x</button>
      </div>

      <label style={s.label}>Modelo OpenAI</label>
      <select
        value={model}
        onInput={(e) => setModel((e.target as HTMLSelectElement).value as OpenAIModelId)}
        style={{ ...s.input, marginBottom: '6px' }}
      >
        {OPENAI_MODELS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label} - {option.detail}
          </option>
        ))}
      </select>
      <p style={s.hint}>
        Nano reduce costo. Mini conserva mas matiz cuando el texto es largo o tecnico.
      </p>

      <hr style={{ ...s.sep, margin: '14px 0' }} />

      <label style={s.label}>Endpoint del proxy</label>
      <input
        type="url" value={proxyUrl}
        onInput={(e) => setProxyUrl((e.target as HTMLInputElement).value)}
        placeholder="/api/openai"
        style={{ ...s.input, marginBottom: '6px' }}
      />
      <p style={s.hint}>
        {isCustomEndpoint
          ? 'Usando un proxy personalizado local. Solo se admiten rutas /api/...'
          : 'Deja este campo vacio para usar el proxy seguro de Vercel. La API key queda solo en el servidor.'}
      </p>

      <hr style={{ ...s.sep, margin: '14px 0' }} />

      <label style={s.label}>Token de acceso</label>
      <input
        type="password" value={accessToken}
        onInput={(e) => setAccessToken((e.target as HTMLInputElement).value)}
        placeholder="Opcional"
        style={{ ...s.input, marginBottom: '6px' }}
      />
      <p style={s.hint}>
        Solo se necesita si configuras OPENAI_PROXY_TOKEN en Vercel.
      </p>

      <button
        onClick={handleSave}
        style={{
          width: '100%', padding: '10px', marginTop: '16px',
          background: 'var(--clr-accent)', color: '#fff', border: 'none',
          borderRadius: 'var(--r-sm)', fontSize: 'var(--text-md)',
          fontWeight: 'var(--fw-500)', cursor: 'pointer',
        }}
      >
        {saved ? 'Guardado' : 'Guardar'}
      </button>

      <hr style={s.sep} />

      <span style={s.sectionLabel}>Uso este mes</span>
      <div style={s.statRow}>
        <div>Traducciones: <strong style={{ color: 'var(--clr-text-1)' }}>{usage.requestCount}</strong></div>
        <div>Tokens input: <strong style={{ color: 'var(--clr-text-1)' }}>{usage.inputTokens.toLocaleString()}</strong></div>
        <div>Tokens output: <strong style={{ color: 'var(--clr-text-1)' }}>{usage.outputTokens.toLocaleString()}</strong></div>
        <div>
          Costo est.: <strong style={{ color: 'var(--clr-text-1)' }}>{cost === null ? 'Router' : `$${cost.toFixed(4)}`}</strong>{' '}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-3)' }}>(aprox.)</span>
        </div>
      </div>
    </div>
  );
}
