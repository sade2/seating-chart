import { useParams } from 'react-router-dom'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Project Editor</h1>
      <p className="mt-2 text-slate-500">Project ID: {id} — canvas coming in Phase 3</p>
    </div>
  )
}
