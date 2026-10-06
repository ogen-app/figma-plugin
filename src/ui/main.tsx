import { render } from 'preact'
import { App } from './app'
import { createBridge } from './bridge'
import './styles.css'

render(<App bridge={createBridge()} />, document.getElementById('app')!)
