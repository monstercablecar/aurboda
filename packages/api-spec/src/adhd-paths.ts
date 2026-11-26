import { adhdResponseSchema, adhdCommandBodySchema } from './schemas/adhd.ts'
const response = {
  '200': {
    description: 'Private account ADHD data',
    content: { 'application/json': { schema: adhdResponseSchema } },
  },
}
export const adhdPaths = {
  '/adhd': {
    get: {
      tags: ['ADHD'],
      summary: 'Read private ADHD state',
      security: [{ bearerAuth: [] }],
      responses: response,
    },
  },
  '/adhd/export': {
    get: {
      tags: ['ADHD'],
      summary: 'Export private ADHD data',
      security: [{ bearerAuth: [] }],
      responses: response,
    },
  },
  '/adhd/commands': {
    post: {
      tags: ['ADHD'],
      summary: 'Apply an explicit idempotent ADHD action',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: adhdCommandBodySchema } } },
      responses: response,
    },
  },
}
