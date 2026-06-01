import sanitizeHtml from 'sanitize-html';

/**
 * Sanitizes email HTML for safe display. Strips scripts, event handlers, and
 * dangerous URL schemes. Remote-content *loading* (tracking pixels) is blocked
 * separately by a Content-Security-Policy on the sandboxed iframe in the SPA,
 * so we keep <img> tags here and let the client decide whether to load them.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'center',
      'font',
      'span',
      'u',
      's',
      'del',
      'ins',
    ]),
    allowedAttributes: {
      '*': [
        'style',
        'class',
        'align',
        'width',
        'height',
        'bgcolor',
        'color',
        'dir',
        'valign',
        'colspan',
        'rowspan',
        'title',
      ],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'title'],
      font: ['color', 'face', 'size'],
      table: ['border', 'cellpadding', 'cellspacing', 'width', 'bgcolor'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'cid', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'cid', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
    },
  });
}
