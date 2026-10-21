import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('formats paragraphs, lists, headings and emphasis', () => {
    expect(renderMarkdown('## Plan\n**Save** more\n\n- one\n- *two*\n1. first')).toBe(
      '<h4>Plan</h4><p><strong>Save</strong> more</p><ul><li>one</li><li><em>two</em></li></ul><ol><li>first</li></ol>',
    )
  })

  it('never lets HTML through', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> **<script>x</script>** `<b>`')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toBe('<p>&lt;img src=x onerror=alert(1)&gt; <strong>&lt;script&gt;x&lt;/script&gt;</strong> <code>&lt;b&gt;</code></p>')
  })
})
