// Jobber's quote CSV template supports ten line-item slots.
// https://help.getjobber.com/en/articles/import-quotes/
export const MAX_JOBBER_LINE_ITEMS = 10;
export const MAX_JOBBER_ASSEMBLY_LINES = MAX_JOBBER_LINE_ITEMS - 1;

export function jobberExportLayout(assemblyLineCount: number) {
  // Kept for old callers: internal takeoff size never controls customer lines.
  return {
    summarized: true,
    lineItemCount: 1,
  };
}
