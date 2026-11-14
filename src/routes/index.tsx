import { createFileRoute } from '@tanstack/react-router'
import { Bladeline } from '@/components/bladeline/Bladeline'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main>
      <Bladeline />
      <noscript>
        <div className="p-8 text-center">BLADELINE needs JavaScript and WebGL to run.</div>
      </noscript>
    </main>
  )
}
