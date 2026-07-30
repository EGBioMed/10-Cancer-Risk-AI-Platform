type ContactCellValue = string | number | boolean;

interface ContactRecord {
  [column: string]: string | number | boolean | null;
}

function main(
  workbook: ExcelScript.Workbook,
  contactRowJson: string
): { ok: boolean; recordId: string } {
  if (!contactRowJson || contactRowJson.trim() === "") {
    throw new Error("contactRowJson is required.");
  }

  const contactRecord = JSON.parse(contactRowJson) as ContactRecord;
  const table = workbook.getTable("ContactRecords");

  if (!table) {
    throw new Error('Table "ContactRecords" was not found.');
  }

  const headers = table
    .getHeaderRowRange()
    .getValues()[0]
    .map((value: string | number | boolean) => String(value).trim());

  const rowValues: ContactCellValue[] = headers.map((header: string) => {
    const value = contactRecord[header];
    return value === null || value === undefined ? "" : value;
  });

  table.addRow(-1, rowValues);

  return {
    ok: true,
    recordId: String(contactRecord.record_id || "")
  };
}
