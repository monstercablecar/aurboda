// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const css = readFileSync(resolve(process.cwd(), 'src/pages/Resources/style.css'), 'utf8')
import { expect, test } from 'vitest'

test('library content overrides shell flex sizing so cards and mobile toolbar cannot collapse', () => {
  const style = document.createElement('style')
  // These are the shell's chart sizing rules. Library rows must size to content.
  style.textContent = `main { display:flex; flex-direction:column; min-height:0 } main > div { flex:1; min-height:0; display:flex; flex-direction:column; width:100% }\n${css}`
  document.head.append(style)
  const page = document.createElement('main')
  page.className = 'resources-page'
  page.innerHTML = '<div class="resource-toolbar"></div><div class="resource-grid"></div>'
  document.body.append(page)
  try {
    expect(getComputedStyle(page).display).toBe('block')
    const toolbar = getComputedStyle(page.children[0])
    expect(toolbar.flexDirection).toBe('row')
    expect(toolbar.flexGrow).toBe('0')
    const grid = getComputedStyle(page.children[1])
    expect(grid.display).toBe('grid')
    expect(grid.flexShrink).toBe('0')
    expect(grid.minHeight).toBe('auto')
  } finally {
    page.remove()
    style.remove()
  }
})
