// Jobber's quote CSV template supports ten line-item slots.
// https://help.getjobber.com/en/articles/import-quotes/
export const MAX_JOBBER_LINE_ITEMS = 10;
export const MAX_JOBBER_ASSEMBLY_LINES = MAX_JOBBER_LINE_ITEMS - 1;

export function jobberExportLayout(assemblyLineCount: number) {
  const summarized = assemblyLineCount > MAX_JOBBER_ASSEMBLY_LINES;
  return {
    summarized,
    lineItemCount: summarized ? 1 : assemblyLineCount + 1,
  };
}
