import { useState } from 'react'
import { api } from '../lib/api.ts'
import { useResource } from '../lib/useResource.ts'
import { href } from '../lib/router.ts'
import { pluralise } from '../lib/format.ts'
import {
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABEL,
  type Product,
  type ProductStatus,
} from '../types.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import {
  Button,
  EmptyState,
  ErrorState,
  Pill,
  Skeleton,
  type PillTone,
} from '../components/ui.tsx'
import { SelectField, TextAreaField, TextField } from '../components/Field.tsx'
import { RecordView, RecordFooter } from '../components/RecordView.tsx'
import { Tag } from '../components/Tag.tsx'
import { ProductDetail } from './ProductDetail.tsx'

export const PRODUCT_STATUS_OPTIONS = PRODUCT_STATUSES.map((s) => ({
  value: s,
  label: PRODUCT_STATUS_LABEL[s],
}))

/** Lifecycle is a status, so it gets colour. Division never does. */
export const PRODUCT_STATUS_TONE: Record<ProductStatus, PillTone> = {
  planning: 'neutral',
  building: 'pending',
  live: 'ready',
}

/**
 * Products stay in the order they were created — the lifecycle is
 * planning → building → live, and reshuffling as a status changes would break
 * the reader's spatial memory of where each product sits.
 */
export function Products({ productId }: { productId: string | null }) {
  if (productId) return <ProductDetail productId={productId} />
  return <ProductList />
}

function ProductList() {
  const [creating, setCreating] = useState(false)
  const products = useResource<Product[]>(() => api.get('/products'), [])

  return (
    <>
      <PageHeader
        eyebrow="Gaphatch · Products"
        title="Products"
        description="Every Gaphatch product, tracked on its own. Open one for its roadmap and release log."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New product
          </Button>
        }
      />

      {products.error ? (
        <ErrorState message={products.error} onRetry={products.reload} />
      ) : products.loading ? (
        <Skeleton rows={3} />
      ) : (products.data ?? []).length === 0 ? (
        <EmptyState
          title="No products yet"
          hint="Add the first Gaphatch product to start tracking its roadmap and releases."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.data!.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {creating && (
        <ProductForm
          product={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            products.reload()
          }}
        />
      )}
    </>
  )
}

function ProductCard({ product }: { product: Product }) {
  const { roadmapTotal, roadmapShipped, releases } = product.counts
  const progress = roadmapTotal === 0 ? 0 : (roadmapShipped / roadmapTotal) * 100

  return (
    <a
      href={href('products', product.id)}
      className="group flex flex-col rounded-[3px] border border-rule bg-paper p-4 transition-colors hover:border-ink"
    >
      <div className="flex items-start justify-between gap-2">
        <Tag tag={product.tag} size="md" />
        <Pill tone={PRODUCT_STATUS_TONE[product.status]}>
          {PRODUCT_STATUS_LABEL[product.status]}
        </Pill>
      </div>

      <h2 className="mt-3 font-display text-xl leading-none font-semibold text-ink underline-offset-4 group-hover:underline">
        {product.name}
      </h2>

      {product.description && (
        <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-graphite">
          {product.description}
        </p>
      )}

      <div className="mt-auto pt-5">
        <div className="leader">
          <span className="label-mono order-0">Roadmap shipped</span>
          <span className="order-2 font-mono text-[11px] tabular-nums text-ink">
            {roadmapShipped}/{roadmapTotal}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 bg-wash">
          <div
            className="h-full bg-ink transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="leader mt-2">
          <span className="label-mono order-0">Releases</span>
          <span className="order-2 font-mono text-[11px] tabular-nums text-ink">{releases}</span>
        </div>
      </div>
    </a>
  )
}

export function ProductForm({
  product,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: Product | null
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [status, setStatus] = useState<ProductStatus | ''>(product?.status ?? 'planning')
  const [description, setDescription] = useState(product?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { name, status, description }
      if (product) await api.patch(`/products/${product.id}`, body)
      else await api.post('/products', body)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!product) return
    const warning =
      `Delete ${product.name} (${product.tag})?\n\n` +
      `Its ${pluralise(product.counts.roadmapTotal, 'roadmap item')} and ` +
      `${pluralise(product.counts.releases, 'release')} go with it. This cannot be undone.`
    if (!confirm(warning)) return

    setSaving(true)
    try {
      await api.del(`/products/${product.id}`)
      onDeleted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
      setSaving(false)
    }
  }

  return (
    <RecordView
      title={product ? 'Edit product' : 'New product'}
      subtitle={
        product ? (
          <Tag tag={product.tag} />
        ) : (
          <span className="font-mono text-[10px] text-faint">
            A tag is issued on save, e.g. GPH-P004
          </span>
        )
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4">
          <TextField label="Name" value={name} onChange={setName} required autoFocus />
          <SelectField
            label="Status"
            value={status}
            options={PRODUCT_STATUS_OPTIONS}
            onChange={setStatus}
            hint="Planning until a build starts, building until it ships, live once customers are on it."
          />
          <TextAreaField
            label="Description"
            value={description}
            onChange={setDescription}
            rows={3}
            placeholder="What it is, and who it's for."
          />

          {error && <p className="text-sm text-alert">{error}</p>}
        </div>

        <RecordFooter>
          {product && onDeleted && (
            <Button
              type="button"
              variant="danger"
              onClick={remove}
              disabled={saving}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </Button>
        </RecordFooter>
      </form>
    </RecordView>
  )
}
