import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { mark } from '../lib/divisions.ts'
import {
  CHANNEL_KIND_LABEL,
  DIVISIONS,
  DIVISION_LABEL,
  type Channel,
  type Division,
  type Message,
  type TeamMember,
} from '../types.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import { Button, EmptyState, ErrorState, Panel, Pill, Skeleton } from '../components/ui.tsx'
import { SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { Icon } from '../components/Icon.tsx'

const DIVISION_OPTIONS = DIVISIONS.map((d) => ({ value: d, label: DIVISION_LABEL[d] }))

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const dayLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/**
 * Channels, direct messages, and conversations attached to records.
 *
 * Messaging was an explicit non-goal (PRD §4) until the founder reversed it —
 * master plan §7. It earns its place through record channels: the conversation
 * about AGY-I004 lives on the invoice rather than scrolling away in a general
 * channel. If this ends up only being used for general chat, Slack is better
 * and this should be dropped.
 *
 * There are no accounts until Phase 9, so the author of a message is picked
 * rather than authenticated. That is stated in the composer rather than hidden.
 */
export function Messages() {
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const channels = useResource<Channel[]>(() => api.get('/messages/channels'), [])
  const team = useResource<TeamMember[]>(() => api.get('/team'), [])

  // Land on the first channel rather than an empty pane.
  useEffect(() => {
    if (!selected && (channels.data ?? []).length > 0) setSelected(channels.data![0]!.id)
  }, [channels.data, selected])

  const current = (channels.data ?? []).find((c) => c.id === selected) ?? null

  const grouped = useMemo(() => {
    const list = channels.data ?? []
    return [
      { label: 'Channels', items: list.filter((c) => c.kind === 'channel') },
      { label: 'On records', items: list.filter((c) => c.kind === 'record') },
      { label: 'Direct', items: list.filter((c) => c.kind === 'dm') },
    ].filter((g) => g.items.length > 0)
  }, [channels.data])

  return (
    <>
      <PageHeader
        eyebrow="Tuenx · Messages"
        title="Messages"
        description="Channels, direct messages, and conversations attached to a record."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New channel
          </Button>
        }
      />

      {channels.error ? (
        <ErrorState message={channels.error} onRetry={channels.reload} />
      ) : channels.loading ? (
        <Skeleton rows={4} />
      ) : (channels.data ?? []).length === 0 ? (
        <EmptyState
          icon="message"
          title="No channels yet"
          hint="Start one for a division, or open a conversation on a record from that record's own screen."
          action={{ label: 'New channel', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <Panel bodyClassName="p-2">
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.label}>
                  <p className="label-mono mb-1 px-2">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setSelected(channel.id)}
                        className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors ${
                          channel.id === selected
                            ? 'bg-ink text-surface'
                            : 'text-graphite hover:bg-wash hover:text-ink'
                        }`}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={mark(channel.division).fill}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">{channel.name}</span>
                        {channel.messageCount > 0 && (
                          <span
                            className={`shrink-0 font-mono text-[10px] tabular-nums ${
                              channel.id === selected ? 'text-surface/70' : 'text-faint'
                            }`}
                          >
                            {channel.messageCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {current ? (
            <Conversation
              channel={current}
              team={team.data ?? []}
              onChanged={channels.reload}
              onDeleted={() => {
                setSelected(null)
                channels.reload()
              }}
            />
          ) : (
            <Panel bodyClassName="p-8">
              <p className="text-center font-mono text-[11px] text-faint">Pick a channel</p>
            </Panel>
          )}
        </div>
      )}

      {creating && (
        <ChannelForm
          team={team.data ?? []}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            setSelected(id)
            channels.reload()
          }}
        />
      )}
    </>
  )
}

function Conversation({
  channel,
  team,
  onChanged,
  onDeleted,
}: {
  channel: Channel
  team: TeamMember[]
  onChanged: () => void
  onDeleted: () => void
}) {
  const messages = useResource<Message[]>(
    () => api.get(`/messages/channels/${channel.id}/messages`),
    [channel.id],
  )
  const [body, setBody] = useState('')
  const [authorId, setAuthorId] = useState(team[0]?.id ?? '')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Newest message in view when the channel opens or a message lands.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.data])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (body.trim() === '') return
    setSending(true)
    try {
      await api.post(`/messages/channels/${channel.id}/messages`, { body, authorId })
      setBody('')
      messages.reload()
      onChanged()
    } finally {
      setSending(false)
    }
  }

  /** Group consecutive messages by day, so the log reads as a transcript. */
  const days = useMemo(() => {
    const out: { day: string; items: Message[] }[] = []
    for (const message of messages.data ?? []) {
      const day = message.createdAt.slice(0, 10)
      const last = out[out.length - 1]
      if (last && last.day === day) last.items.push(message)
      else out.push({ day, items: [message] })
    }
    return out
  }, [messages.data])

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Tag tag={channel.tag} />
          <span className="normal-case">{channel.name}</span>
          <Pill>{CHANNEL_KIND_LABEL[channel.kind]}</Pill>
        </span>
      }
      subtitle={
        channel.purpose ? (
          <span className="text-[12px] text-graphite">{channel.purpose}</span>
        ) : undefined
      }
      actions={
        <Button
          size="sm"
          variant="subtle"
          onClick={async () => {
            if (!confirm(`Delete ${channel.name}? Every message in it goes too.`)) return
            await api.del(`/messages/channels/${channel.id}`)
            onDeleted()
          }}
          aria-label="Delete channel"
        >
          <Icon name="trash" size={13} />
        </Button>
      }
      bodyClassName="flex flex-col p-0"
    >
      <div className="max-h-[28rem] min-h-64 flex-1 overflow-y-auto px-5 py-4">
        {messages.error ? (
          <ErrorState message={messages.error} onRetry={messages.reload} />
        ) : messages.loading ? (
          <Skeleton rows={3} />
        ) : days.length === 0 ? (
          <p className="py-10 text-center font-mono text-[11px] text-faint">
            Nothing said yet. Start it off.
          </p>
        ) : (
          <div className="space-y-5">
            {days.map(({ day, items }) => (
              <div key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="label-mono">{dayLabel.format(new Date(day))}</span>
                  <span className="h-px flex-1 bg-rule-soft" />
                </div>
                <div className="space-y-3">
                  {items.map((message) => (
                    <article key={message.id} className="flex gap-3">
                      <span
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-mono text-[10px] font-medium ${
                          message.author ? mark(message.author.division).tag : 'bg-wash text-faint'
                        }`}
                        aria-hidden
                      >
                        {message.author
                          ? message.author.name
                              .split(' ')
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()
                          : '—'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                          <span className="text-[13px] font-medium text-ink">
                            {message.author?.name ?? 'Unknown'}
                          </span>
                          <span className="font-mono text-[10px] text-faint">
                            {time.format(new Date(message.createdAt))}
                          </span>
                          {message.editedAt && (
                            <span className="font-mono text-[10px] text-faint">edited</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
                          {message.body}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={send} className="border-t border-rule-soft bg-wash px-5 py-3">
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="sr-only">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line — the convention
                // everyone already has in their fingers.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(e)
                }
              }}
              rows={2}
              placeholder="Write a message…"
              className="w-full resize-none rounded-sm border border-rule bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </label>
          <Button type="submit" variant="primary" disabled={sending || body.trim() === ''}>
            Send
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          {/* No accounts until Phase 9, so who is speaking is picked, not
              authenticated. Saying so beats pretending. */}
          <span className="label-mono">Posting as</span>
          <select
            value={authorId}
            onChange={(e) => setAuthorId(e.target.value)}
            aria-label="Post as"
            className="rounded-xs border border-rule bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink focus:border-ink focus:outline-none"
          >
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="font-mono text-[10px] text-faint">
            — no sign-in until Phase 9, so this is on trust
          </span>
        </div>
      </form>
    </Panel>
  )
}

function ChannelForm({
  team,
  onClose,
  onSaved,
}: {
  team: TeamMember[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [division, setDivision] = useState<Division | ''>('tuenx')
  const [kind, setKind] = useState<'channel' | 'dm'>('channel')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setMemberIds((current) =>
      current.includes(id) ? current.filter((m) => m !== id) : [...current, id],
    )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const created = await api.post<Channel>('/messages/channels', {
        name,
        purpose,
        division,
        kind,
        memberIds,
      })
      onSaved(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title="New channel"
      subtitle={
        <span className="font-mono text-[10px] text-faint">
          A tag is issued on save, e.g. TNX-X003
        </span>
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Kind"
              value={kind}
              options={[
                { value: 'channel', label: 'Channel' },
                { value: 'dm', label: 'Direct message' },
              ]}
              onChange={(v) => setKind((v || 'channel') as 'channel' | 'dm')}
              hint={
                kind === 'dm'
                  ? 'Pick exactly two people.'
                  : 'Open to everyone — membership is for display.'
              }
            />
            <SelectField
              label="Division"
              value={division}
              options={DIVISION_OPTIONS}
              onChange={setDivision}
            />
          </div>

          <TextField
            label="Name"
            value={name}
            onChange={setName}
            required
            autoFocus
            placeholder={kind === 'dm' ? 'Maya & Tomas' : 'agency-delivery'}
          />

          <TextAreaField
            label="Purpose"
            value={purpose}
            onChange={setPurpose}
            rows={2}
            placeholder="What belongs in here, so it doesn't become a general channel."
          />

          <div>
            <p className="label-mono mb-2">People</p>
            <div className="flex flex-wrap gap-1.5">
              {team.map((member) => {
                const on = memberIds.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggle(member.id)}
                    aria-pressed={on}
                    className={`rounded-xs border px-2 py-1 font-mono text-[10px] transition-colors ${
                      on
                        ? 'border-ink bg-ink text-surface'
                        : 'border-rule bg-surface text-graphite hover:border-faint'
                    }`}
                  >
                    {member.name}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="rounded-sm border border-rule bg-wash px-3 py-2 text-[12px] leading-relaxed text-graphite">
            To start a conversation about a specific record, open that record and use its
            conversation instead — that is what this module is for.
          </p>

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create channel'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
