import { useEffect, useMemo, useState } from 'react'
import './App.css'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
type RequestTab = 'params' | 'auth' | 'headers' | 'body'
type ResponseTab = 'pretty' | 'raw' | 'headers'
type AuthType = 'none' | 'bearer' | 'basic'
type BodyType = 'none' | 'json' | 'text'
type BadgeState = 'idle' | 'loading' | 'success' | 'error'

type KeyValueRow = {
  id: string
  key: string
  value: string
}

type AuthConfig = {
  type: AuthType
  token: string
  username: string
  password: string
}

type ApiRequest = {
  id: string
  name: string
  method: HttpMethod
  url: string
  params: KeyValueRow[]
  headers: KeyValueRow[]
  auth: AuthConfig
  bodyType: BodyType
  body: string
}

type WorkspaceState = {
  saved: ApiRequest[]
  history: ApiRequest[]
  environment: string
}

type ResponseContent = Record<ResponseTab, string>

type ResponseStats = {
  status: string
  time: string
  size: string
  meta: string
  badge: BadgeState
  badgeText: string
}

const STORAGE_KEY = 'pulse-api-workspace-v2'
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const REQUEST_TABS: RequestTab[] = ['params', 'auth', 'headers', 'body']
const RESPONSE_TABS: ResponseTab[] = ['pretty', 'raw', 'headers']

const EMPTY_RESPONSE: ResponseContent = {
  pretty: 'Send a request to inspect the response.',
  raw: 'Send a request to inspect the response.',
  headers: '',
}

const EMPTY_STATS: ResponseStats = {
  status: '--',
  time: '--',
  size: '--',
  meta: 'Not sent yet',
  badge: 'idle',
  badgeText: 'Idle',
}

function createId() {
  return crypto.randomUUID()
}

function createRow(key = '', value = ''): KeyValueRow {
  return { id: createId(), key, value }
}

function createRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const base: ApiRequest = {
    id: createId(),
    name: 'Untitled request',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    params: [createRow()],
    headers: [createRow('Accept', 'application/json')],
    auth: { type: 'none', token: '', username: '', password: '' },
    bodyType: 'none',
    body: '',
  }

  return normalizeRequest({ ...base, ...overrides })
}

function normalizeRows(rows: KeyValueRow[] | undefined, fallback: KeyValueRow[]) {
  const source = rows?.length ? rows : fallback
  return source.map((row) => ({ id: row.id || createId(), key: row.key || '', value: row.value || '' }))
}

function normalizeRequest(request: Partial<ApiRequest>): ApiRequest {
  return {
    id: request.id || createId(),
    name: request.name || 'Untitled request',
    method: HTTP_METHODS.includes(request.method as HttpMethod) ? (request.method as HttpMethod) : 'GET',
    url: request.url || 'https://jsonplaceholder.typicode.com/posts/1',
    params: normalizeRows(request.params, [createRow()]),
    headers: normalizeRows(request.headers, [createRow('Accept', 'application/json')]),
    auth: {
      type: request.auth?.type || 'none',
      token: request.auth?.token || '',
      username: request.auth?.username || '',
      password: request.auth?.password || '',
    },
    bodyType: request.bodyType || 'none',
    body: request.body || '',
  }
}

function loadWorkspace(): WorkspaceState {
  const fallback: WorkspaceState = { saved: [], history: [], environment: '' }
  const saved = localStorage.getItem(STORAGE_KEY)

  if (!saved) {
    return fallback
  }

  try {
    const parsed = JSON.parse(saved) as Partial<WorkspaceState>
    return {
      saved: parsed.saved?.map(normalizeRequest) || [],
      history: parsed.history?.map(normalizeRequest) || [],
      environment: parsed.environment || '',
    }
  } catch (error) {
    console.warn('Could not load PulseAPI workspace', error)
    return fallback
  }
}

function parseEnvironment(environment: string) {
  return environment
    .split(/\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((variables, entry) => {
      const [key, ...valueParts] = entry.split('=')
      if (key && valueParts.length) {
        variables[key.trim()] = valueParts.join('=').trim()
      }
      return variables
    }, {})
}

function applyEnvironment(value: string, environment: string) {
  const variables = parseEnvironment(environment)
  return value.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, key: string) => variables[key] || '')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function shortUrl(value: string) {
  return value.length > 58 ? `${value.slice(0, 55)}...` : value || 'No URL'
}

function formatResponseBody(raw: string, contentType: string | null) {
  if (contentType?.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }

  return raw || '(empty response)'
}

function buildUrl(request: ApiRequest, environment: string) {
  const substituted = applyEnvironment(request.url, environment)

  try {
    const url = new URL(substituted)
    request.params
      .filter((row) => row.key.trim())
      .forEach((row) => {
        url.searchParams.set(
          applyEnvironment(row.key.trim(), environment),
          applyEnvironment(row.value.trim(), environment),
        )
      })

    return url.toString()
  } catch {
    return ''
  }
}

function buildFetchOptions(request: ApiRequest, environment: string): RequestInit {
  const headers = new Headers()

  request.headers
    .filter((row) => row.key.trim())
    .forEach((row) => {
      headers.set(applyEnvironment(row.key.trim(), environment), applyEnvironment(row.value.trim(), environment))
    })

  if (request.auth.type === 'bearer' && request.auth.token.trim()) {
    headers.set('Authorization', `Bearer ${applyEnvironment(request.auth.token, environment)}`)
  }

  if (request.auth.type === 'basic' && request.auth.username.trim()) {
    const username = applyEnvironment(request.auth.username, environment)
    const password = applyEnvironment(request.auth.password, environment)
    headers.set('Authorization', `Basic ${btoa(`${username}:${password}`)}`)
  }

  const options: RequestInit = { method: request.method, headers }
  const methodAllowsBody = !['GET', 'HEAD'].includes(request.method)

  if (methodAllowsBody && request.bodyType !== 'none' && request.body.trim()) {
    options.body = applyEnvironment(request.body, environment)
    if (request.bodyType === 'json' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  return options
}

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace())
  const [currentRequest, setCurrentRequest] = useState<ApiRequest>(() => createRequest())
  const [requestTab, setRequestTab] = useState<RequestTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('pretty')
  const [responseContent, setResponseContent] = useState<ResponseContent>(EMPTY_RESPONSE)
  const [responseStats, setResponseStats] = useState<ResponseStats>(EMPTY_STATS)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [workspace])

  const filteredSaved = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) {
      return workspace.saved
    }

    return workspace.saved.filter((request) =>
      `${request.name} ${request.method} ${request.url}`.toLowerCase().includes(query),
    )
  }, [searchQuery, workspace.saved])

  function updateRequest(updates: Partial<ApiRequest>) {
    setCurrentRequest((request) => normalizeRequest({ ...request, ...updates }))
  }

  function updateRow(collection: 'params' | 'headers', id: string, field: 'key' | 'value', value: string) {
    setCurrentRequest((request) => ({
      ...request,
      [collection]: request[collection].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }))
  }

  function addRow(collection: 'params' | 'headers') {
    setCurrentRequest((request) => ({
      ...request,
      [collection]: [...request[collection], createRow()],
    }))
  }

  function removeRow(collection: 'params' | 'headers', id: string) {
    setCurrentRequest((request) => {
      const nextRows = request[collection].filter((row) => row.id !== id)
      return { ...request, [collection]: nextRows.length ? nextRows : [createRow()] }
    })
  }

  function saveCurrentRequest() {
    const snapshot = normalizeRequest(currentRequest)

    setWorkspace((previous) => {
      const existingIndex = previous.saved.findIndex((request) => request.id === snapshot.id)
      if (existingIndex >= 0) {
        const saved = [...previous.saved]
        saved[existingIndex] = snapshot
        return { ...previous, saved }
      }

      return { ...previous, saved: [snapshot, ...previous.saved] }
    })
  }

  function loadSampleRequest() {
    setCurrentRequest(
      createRequest({
        name: 'Create sample post',
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        headers: [createRow('Accept', 'application/json'), createRow('Content-Type', 'application/json')],
        bodyType: 'json',
        body: JSON.stringify({ title: 'PulseAPI', body: 'Testing a request body', userId: 1 }, null, 2),
      }),
    )
    setRequestTab('body')
  }

  function loadRequest(request: ApiRequest) {
    setCurrentRequest(normalizeRequest(request))
    setRequestTab('params')
  }

  function formatJsonBody() {
    if (!currentRequest.body.trim()) {
      return
    }

    try {
      updateRequest({
        bodyType: 'json',
        body: JSON.stringify(JSON.parse(currentRequest.body), null, 2),
      })
    } catch {
      setResponseContent({
        pretty: 'Request body is not valid JSON.',
        raw: 'Request body is not valid JSON.',
        headers: '',
      })
      setResponseStats({
        status: 'Failed',
        time: '--',
        size: '--',
        meta: 'Could not format request body',
        badge: 'error',
        badgeText: 'Error',
      })
    }
  }

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(responseContent[responseTab] || '')
      setResponseStats((stats) => ({ ...stats, meta: 'Copied response to clipboard' }))
    } catch {
      setResponseStats((stats) => ({ ...stats, meta: 'Clipboard permission was blocked' }))
    }
  }

  async function sendRequest() {
    const url = buildUrl(currentRequest, workspace.environment)
    if (!url) {
      setResponseContent({ pretty: 'Enter a valid request URL.', raw: 'Enter a valid request URL.', headers: '' })
      setResponseStats({
        status: 'Failed',
        time: '--',
        size: '--',
        meta: 'Request could not be completed',
        badge: 'error',
        badgeText: 'Error',
      })
      return
    }

    const startedAt = performance.now()
    setResponseTab('pretty')
    setResponseStats({
      status: '--',
      time: '--',
      size: '--',
      meta: 'Request in flight',
      badge: 'loading',
      badgeText: 'Sending',
    })
    setResponseContent({ pretty: 'Waiting for response...', raw: 'Waiting for response...', headers: '' })

    try {
      const response = await fetch(url, buildFetchOptions(currentRequest, workspace.environment))
      const raw = await response.text()
      const elapsed = Math.round(performance.now() - startedAt)
      const responseHeaders = Array.from(response.headers.entries())
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')

      setResponseContent({
        pretty: formatResponseBody(raw, response.headers.get('content-type')),
        raw: raw || '(empty response)',
        headers: responseHeaders || '(no response headers)',
      })
      setResponseStats({
        status: `${response.status} ${response.statusText}`,
        time: `${elapsed} ms`,
        size: formatBytes(new Blob([raw]).size),
        meta: `${currentRequest.method} ${shortUrl(url)}`,
        badge: response.ok ? 'success' : 'error',
        badgeText: response.ok ? 'Success' : 'Error',
      })

      setWorkspace((previous) => ({
        ...previous,
        history: [normalizeRequest({ ...currentRequest, id: createId() }), ...previous.history].slice(0, 25),
      }))
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : 'Request failed.'
      setResponseContent({ pretty: message, raw: message, headers: '' })
      setResponseStats({
        status: 'Failed',
        time: '--',
        size: '--',
        meta: 'Request could not be completed',
        badge: 'error',
        badgeText: 'Error',
      })
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div>
            <p>PulseAPI</p>
            <small>REST workspace</small>
          </div>
        </div>

        <div className="sidebar-actions">
          <button className="icon-btn" type="button" title="New request" onClick={() => setCurrentRequest(createRequest())}>
            +
          </button>
          <button className="ghost-btn" type="button" onClick={saveCurrentRequest}>
            Save
          </button>
          <button className="ghost-btn" type="button" onClick={loadSampleRequest}>
            Sample
          </button>
        </div>

        <label className="search-field">
          <span>Search</span>
          <input
            type="search"
            placeholder="Find requests"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <section className="sidebar-section">
          <div className="section-title">
            <span>Collections</span>
            <strong>{workspace.saved.length}</strong>
          </div>
          <div className="request-list">
            {filteredSaved.length ? (
              filteredSaved.map((request) => (
                <button
                  className={`request-item${request.id === currentRequest.id ? ' active' : ''}`}
                  key={request.id}
                  type="button"
                  onClick={() => loadRequest(request)}
                >
                  <span>
                    <strong>{request.name}</strong>
                    <small>{shortUrl(request.url)}</small>
                  </span>
                  <span className="method">{request.method}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">Saved requests will appear here.</div>
            )}
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-title">
            <span>History</span>
            <button className="link-btn" type="button" onClick={() => setWorkspace((state) => ({ ...state, history: [] }))}>
              Clear
            </button>
          </div>
          <div className="request-list compact">
            {workspace.history.length ? (
              workspace.history.slice(0, 12).map((request) => (
                <button className="request-item" key={request.id} type="button" onClick={() => loadRequest(request)}>
                  <span>
                    <strong>{request.name}</strong>
                    <small>{shortUrl(request.url)}</small>
                  </span>
                  <span className="method">{request.method}</span>
                </button>
              ))
            ) : (
              <div className="empty-state">Sent requests land here.</div>
            )}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <label>
            Request Name
            <input
              type="text"
              placeholder="Untitled request"
              value={currentRequest.name}
              onChange={(event) => updateRequest({ name: event.target.value || 'Untitled request' })}
            />
          </label>
          <label className="environment">
            Environment
            <input
              type="text"
              placeholder="baseUrl=https://api.example.com; token=abc123"
              value={workspace.environment}
              onChange={(event) => setWorkspace((state) => ({ ...state, environment: event.target.value }))}
            />
          </label>
        </header>

        <section className="request-line" aria-label="Request composer">
          <select
            aria-label="HTTP method"
            value={currentRequest.method}
            onChange={(event) => updateRequest({ method: event.target.value as HttpMethod })}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
          <input
            type="url"
            placeholder="https://jsonplaceholder.typicode.com/posts/1"
            value={currentRequest.url}
            onChange={(event) => updateRequest({ url: event.target.value })}
          />
          <button
            className="send-btn"
            type="button"
            disabled={responseStats.badge === 'loading'}
            onClick={() => void sendRequest()}
          >
            {responseStats.badge === 'loading' ? 'Sending' : 'Send'}
          </button>
        </section>

        <section className="split-layout">
          <article className="panel request-panel">
            <div className="tabs" role="tablist" aria-label="Request settings">
              {REQUEST_TABS.map((tab) => (
                <button
                  className={`tab${requestTab === tab ? ' active' : ''}`}
                  key={tab}
                  type="button"
                  onClick={() => setRequestTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {requestTab === 'params' && (
              <div className="tab-panel active">
                <div className="table-head">
                  <span>Key</span>
                  <span>Value</span>
                  <span />
                </div>
                <div className="kv-list">
                  {currentRequest.params.map((row) => (
                    <div className="kv-row" key={row.id}>
                      <input
                        placeholder="page"
                        value={row.key}
                        onChange={(event) => updateRow('params', row.id, 'key', event.target.value)}
                      />
                      <input
                        placeholder="1"
                        value={row.value}
                        onChange={(event) => updateRow('params', row.id, 'value', event.target.value)}
                      />
                      <button className="row-remove" type="button" onClick={() => removeRow('params', row.id)}>
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <button className="add-row-btn" type="button" onClick={() => addRow('params')}>
                  Add param
                </button>
              </div>
            )}

            {requestTab === 'auth' && (
              <div className="tab-panel active">
                <label className="form-row">
                  Type
                  <select
                    value={currentRequest.auth.type}
                    onChange={(event) =>
                      updateRequest({ auth: { ...currentRequest.auth, type: event.target.value as AuthType } })
                    }
                  >
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </label>

                <div className="auth-fields">
                  {currentRequest.auth.type === 'bearer' && (
                    <input
                      type="password"
                      placeholder="Token"
                      value={currentRequest.auth.token}
                      onChange={(event) => updateRequest({ auth: { ...currentRequest.auth, token: event.target.value } })}
                    />
                  )}

                  {currentRequest.auth.type === 'basic' && (
                    <>
                      <input
                        type="text"
                        placeholder="Username"
                        value={currentRequest.auth.username}
                        onChange={(event) =>
                          updateRequest({ auth: { ...currentRequest.auth, username: event.target.value } })
                        }
                      />
                      <input
                        type="password"
                        placeholder="Password"
                        value={currentRequest.auth.password}
                        onChange={(event) =>
                          updateRequest({ auth: { ...currentRequest.auth, password: event.target.value } })
                        }
                      />
                    </>
                  )}

                  {currentRequest.auth.type === 'none' && (
                    <div className="empty-state light">This request will be sent without an Authorization header.</div>
                  )}
                </div>
              </div>
            )}

            {requestTab === 'headers' && (
              <div className="tab-panel active">
                <div className="table-head">
                  <span>Header</span>
                  <span>Value</span>
                  <span />
                </div>
                <div className="kv-list">
                  {currentRequest.headers.map((row) => (
                    <div className="kv-row" key={row.id}>
                      <input
                        placeholder="Content-Type"
                        value={row.key}
                        onChange={(event) => updateRow('headers', row.id, 'key', event.target.value)}
                      />
                      <input
                        placeholder="application/json"
                        value={row.value}
                        onChange={(event) => updateRow('headers', row.id, 'value', event.target.value)}
                      />
                      <button className="row-remove" type="button" onClick={() => removeRow('headers', row.id)}>
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <button className="add-row-btn" type="button" onClick={() => addRow('headers')}>
                  Add header
                </button>
              </div>
            )}

            {requestTab === 'body' && (
              <div className="tab-panel active">
                <div className="body-toolbar">
                  <select
                    aria-label="Body type"
                    value={currentRequest.bodyType}
                    onChange={(event) => updateRequest({ bodyType: event.target.value as BodyType })}
                  >
                    <option value="none">No Body</option>
                    <option value="json">JSON</option>
                    <option value="text">Raw Text</option>
                  </select>
                  <button className="ghost-btn" type="button" onClick={formatJsonBody}>
                    Format JSON
                  </button>
                </div>
                <textarea
                  spellCheck={false}
                  placeholder={'{\n  "title": "Hello"\n}'}
                  value={currentRequest.body}
                  onChange={(event) => updateRequest({ body: event.target.value })}
                />
              </div>
            )}
          </article>

          <article className="panel response-panel">
            <div className="response-head">
              <div>
                <p>Response</p>
                <small>{responseStats.meta}</small>
              </div>
              <div className="response-actions">
                <span className={`status-badge ${responseStats.badge}`}>{responseStats.badgeText}</span>
                <button className="icon-btn subtle" type="button" title="Copy response" onClick={() => void copyResponse()}>
                  Copy
                </button>
              </div>
            </div>

            <div className="response-stats">
              <div>
                <span>Status</span>
                <strong>{responseStats.status}</strong>
              </div>
              <div>
                <span>Time</span>
                <strong>{responseStats.time}</strong>
              </div>
              <div>
                <span>Size</span>
                <strong>{responseStats.size}</strong>
              </div>
            </div>

            <div className="tabs response-tabs" role="tablist" aria-label="Response views">
              {RESPONSE_TABS.map((tab) => (
                <button
                  className={`response-tab${responseTab === tab ? ' active' : ''}`}
                  key={tab}
                  type="button"
                  onClick={() => setResponseTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            <pre className="response-output">{responseContent[responseTab] || '(empty)'}</pre>
          </article>
        </section>
      </main>
    </div>
  )
}

export default App
