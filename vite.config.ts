import { defineConfig } from 'vite'
import frontend from './frontend/vite.config'

export default defineConfig({
  ...frontend,
  root: 'frontend',
})
