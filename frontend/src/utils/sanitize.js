import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string before injecting it via dangerouslySetInnerHTML.
 * Strips scripts, event handlers, and other XSS vectors while keeping
 * the formatting markup used by document templates.
 */
export const sanitizeHtml = (html) => DOMPurify.sanitize(html ?? '');
