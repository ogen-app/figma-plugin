import { render } from 'preact'
import './styles.css'

function App() {
  return (
    <main class="screen">
      <h1>Ogen</h1>
      <p class="muted">{__API_BASE__}</p>
    </main>
  )
}

render(<App />, document.getElementById('app')!)
