import express from 'express'
import supertest from 'supertest'
import { describe, expect, test } from 'vitest'

import { createPharmacologyRouter } from './pharmacology-router.ts'

describe('pharmacology routes', () => {
  test('rejects access when authentication middleware does not authorize', async () => {
    const router = createPharmacologyRouter((_req, res) => res.status(401).json({ error: 'Unauthorized' }))
    const app = express()
    app.use(router)
    const response = await supertest(app).get('/substances')
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Unauthorized' })
  })
})
