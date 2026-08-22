/**
 * Export helpers for server-paginated tables.
 *
 * DataTable only holds the rows currently on screen, so exporting "everything"
 * means re-fetching the result set with the active filters applied. Each page
 * knows its own endpoint and response shape, so it supplies a `fetchPage`
 * function and this walks the pages for it.
 */

/** Rows per request while collecting an export. Large enough to keep the
 *  number of round trips low, small enough to avoid oversized responses. */
export const EXPORT_PAGE_SIZE = 500;

/** Hard ceiling so a bad `total` from an API can never spin forever. */
export const EXPORT_MAX_ROWS = 50000;

/**
 * Walk every page of a filtered result set and return the combined rows.
 *
 * @param {(page: number, limit: number) => Promise<{rows: any[], total?: number}>} fetchPage
 *   Fetches one page. Return the rows plus, if the API provides it, the total
 *   row count for the current filters.
 * @param {object} [options]
 * @param {number} [options.pageSize=EXPORT_PAGE_SIZE]
 * @param {number} [options.maxRows=EXPORT_MAX_ROWS]
 * @param {(progress: {loaded: number, total: number|null}) => void} [options.onProgress]
 *   Called after each page so the UI can show how far along the export is.
 * @returns {Promise<any[]>} Every row matching the active filters.
 */
export async function fetchAllPages(fetchPage, options = {}) {
  const pageSize = options.pageSize || EXPORT_PAGE_SIZE;
  const maxRows = options.maxRows || EXPORT_MAX_ROWS;
  const onProgress = options.onProgress;

  const all = [];
  let page = 1;
  let total = null;

  // Three independent stop conditions, so a missing or wrong `total` still
  // terminates: a short page means the last page, and maxRows is the backstop.
  for (;;) {
    const result = await fetchPage(page, pageSize);
    const rows = result?.rows || [];
    if (result?.total != null) total = Number(result.total);

    if (rows.length === 0) break;
    all.push(...rows);

    onProgress?.({ loaded: all.length, total });

    if (total != null && all.length >= total) break;
    if (rows.length < pageSize) break;
    if (all.length >= maxRows) break;

    page += 1;
  }

  return all;
}

/**
 * Build an `onServerExport` handler for DataTable.
 *
 * On failure it reports through `onError` and falls back to the rows already
 * on screen, so an export never silently produces nothing.
 *
 * @param {(page: number, limit: number) => Promise<{rows: any[], total?: number}>} fetchPage
 * @param {object} [options]
 * @param {(error: Error) => void} [options.onError]
 * @returns {(args: {rows?: any[]}) => Promise<any[]|false>}
 */
export function createExportAllHandler(fetchPage, options = {}) {
  // `onProgress` is supplied by DataTable at call time so it can drive its
  // own progress UI - pages don't need to wire anything up for it.
  return async ({ rows, onProgress } = {}) => {
    try {
      return await fetchAllPages(fetchPage, { ...options, onProgress });
    } catch (error) {
      options.onError?.(error);
      // Fall back to whatever is loaded rather than exporting an empty file
      return Array.isArray(rows) ? rows : false;
    }
  };
}
