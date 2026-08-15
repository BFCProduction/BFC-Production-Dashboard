import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from GitHub Pages at https://bfcproduction.github.io/BFC-Production-Dashboard/
// Same bfcproduction.github.io origin as Sunday Ops, so localStorage (and the
// PCO session under bfc_ops_session) is shared between the two apps.
export default defineConfig({
  base: '/BFC-Production-Dashboard/',
  plugins: [react()],
})
