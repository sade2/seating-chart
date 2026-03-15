import { useState } from 'react'
import { useProjectStore } from '../../store/projectStore'
import Modal from '../ui/Modal'
import type { ShapeType } from '../../types'

interface CreateShapeModalProps {
  onClose: () => void
}

const COLORS = ['#94a3b8', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9']

export default function CreateShapeModal({ onClose }: CreateShapeModalProps) {
  const addShape = useProjectStore((s) => s.addShape)
  const setSelectedShape = useProjectStore((s) => s.setSelectedShape)
  const project = useProjectStore((s) => s.project)

  const [type, setType] = useState<ShapeType>('circle')
  const [sizeFt, setSizeFt] = useState('5')
  const [widthFt, setWidthFt] = useState('6')
  const [heightFt, setHeightFt] = useState('3')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(COLORS[0])

  async function handleSubmit() {
    const cx = (project?.room.widthFt ?? 20) / 2
    const cy = (project?.room.heightFt ?? 20) / 2
    const wFt = type === 'rectangle' ? Math.max(0.5, Number(widthFt) || 6) : Math.max(0.5, Number(sizeFt) || 5)
    const hFt = type === 'rectangle' ? Math.max(0.5, Number(heightFt) || 3) : wFt
    const id = crypto.randomUUID()
    await addShape({ id, type, x: cx, y: cy, widthFt: wFt, heightFt: hFt, rotation: 0, label, color })
    setSelectedShape(id)
    onClose()
  }

  return (
    <Modal title="Insert Shape" onClose={onClose}>
      <div className="space-y-4">
        {/* Type selector */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Shape</label>
          <div className="flex gap-2">
            {(['circle', 'rectangle', 'square'] as ShapeType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                  type === t
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Size <span className="font-normal text-slate-400">(ft)</span>
          </label>
          {type === 'rectangle' ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={widthFt}
                onChange={(e) => setWidthFt(e.target.value)}
                placeholder="Width"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <span className="flex-shrink-0 text-slate-400">×</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={heightFt}
                onChange={(e) => setHeightFt(e.target.value)}
                placeholder="Height"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          ) : (
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={sizeFt}
              onChange={(e) => setSizeFt(e.target.value)}
              placeholder={type === 'circle' ? 'Diameter' : 'Side length'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          )}
        </div>

        {/* Label */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Label <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Dance Floor"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Color */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full transition-transform ${
                  color === c ? 'scale-110 ring-2 ring-indigo-400 ring-offset-1' : 'hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Shape
          </button>
        </div>
      </div>
    </Modal>
  )
}
