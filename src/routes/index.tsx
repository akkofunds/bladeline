import { createFileRoute } from '@tanstack/react-router'
import { BladeHop } from '@/components/BladeHop'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <BladeHop />
      <noscript>
        <div className="p-8 text-center">BLADEHOP needs JavaScript and WebGL to run.</div>
      </noscript>
    </main>
  )
}
