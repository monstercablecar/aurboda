import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: './generated/openapi.yaml',
  output: {
    postProcess: ['prettier'],
    path: './generated/typescript',
  },
  plugins: ['@hey-api/typescript'],
})
