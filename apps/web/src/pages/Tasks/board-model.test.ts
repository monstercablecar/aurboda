// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { defaultFilters, readViews } from './board-model'
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    clear: () => store.clear(),
  })
})
afterEach(() => vi.unstubAllGlobals())
test('saved views reject malformed data and strip unknown fields', () => {
  localStorage.setItem(
    'aurboda:task-views:alice',
    JSON.stringify([
      {
        name: 'Urgent',
        filters: { ...defaultFilters, priority: '3', token: 'not persisted on next save' },
        task: { title: 'private' },
      },
      { name: 'Broken', filters: { priority: '9' } },
    ]),
  )
  expect(readViews('alice')).toEqual([{ name: 'Urgent', filters: { ...defaultFilters, priority: '3' } }])
  expect(readViews('bob')).toEqual([])
  localStorage.setItem('aurboda:task-views:alice', '{broken')
  expect(readViews('alice')).toEqual([])
})
