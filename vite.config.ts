
import { defineConfig } from 'vite'
import { cloudflare } from "@cloudflare/vite-plugin";
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [cloudflare(), svelte()],
})
