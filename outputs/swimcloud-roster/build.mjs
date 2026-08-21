import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const source = JSON.parse(await fs.readFile("/private/tmp/lake_minneola_swimcloud_bests.json", "utf8"));
const outputDir = new URL(".", import.meta.url).pathname;
const workbook = Workbook.create();
const summary = workbook.worksheets.add("Roster Summary");
const bests = workbook.worksheets.add("Best Times");

const navy = "#062844";
const blue = "#0B5D83";
const aqua = "#DDF3F7";
const pale = "#F3F7F9";
const orange = "#F3A712";
const gray = "#5E6A71";

for (const sheet of [summary, bests]) sheet.showGridLines = false;

const profileByRoster = new Map(source.profiles.map(p => [p.rosterName, p]));
const rosterRows = source.roster.map(name => {
  const profile = profileByRoster.get(name);
  if (!profile) return [name, "", "No SwimCloud profile found", null, null, null, null, ""];
  const baseMatch = profile.pageName === name ? "Matched" : `Matched as ${profile.pageName}`;
  const matchNote = profile.count ? baseMatch : `${baseMatch}; no published times`;
  return [name, profile.pageName, matchNote, null, null, null, null, profile.url];
});

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["Lake Minneola SwimCloud Best Times"]];
summary.getRange("A1:H1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center" };
summary.getRange("A1:H1").format.rowHeight = 32;
summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["Roster supplied by coach • Published personal bests pulled from SwimCloud • Updated 2026-08-17"]];
summary.getRange("A2:H2").format = { fill: aqua, font: { color: navy, italic: true }, verticalAlignment: "center" };
summary.getRange("A4:H4").values = [["Roster Name", "SwimCloud Name", "Match Status", "Published Bests", "SCY", "LCM", "SCM", "Profile / Times URL"]];
summary.getRange(`A5:H${4 + rosterRows.length}`).values = rosterRows;
for (let i = 0; i < rosterRows.length; i++) {
  const r = 5 + i;
  const profileUrl = rosterRows[i][7];
  summary.getRange(`D${r}`).formulas = [[`=COUNTIF('Best Times'!$A$5:$A$${4 + source.times.length},A${r})`]];
  summary.getRange(`E${r}`).formulas = [[`=COUNTIFS('Best Times'!$A$5:$A$${4 + source.times.length},A${r},'Best Times'!$D$5:$D$${4 + source.times.length},"SCY")`]];
  summary.getRange(`F${r}`).formulas = [[`=COUNTIFS('Best Times'!$A$5:$A$${4 + source.times.length},A${r},'Best Times'!$D$5:$D$${4 + source.times.length},"LCM")`]];
  summary.getRange(`G${r}`).formulas = [[`=COUNTIFS('Best Times'!$A$5:$A$${4 + source.times.length},A${r},'Best Times'!$D$5:$D$${4 + source.times.length},"SCM")`]];
  if (profileUrl) summary.getRange(`H${r}`).formulas = [[`=HYPERLINK("${profileUrl}","Open profile")`]];
}
summary.getRange("A4:H4").format = { fill: blue, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center", wrapText: true };
summary.getRange(`A5:H${4 + rosterRows.length}`).format = { font: { color: navy }, verticalAlignment: "center" };
summary.getRange(`D5:G${4 + rosterRows.length}`).format = { horizontalAlignment: "center", numberFormat: "0" };
summary.getRange(`H5:H${4 + rosterRows.length}`).format.font = { color: "#0563C1", underline: "single" };
summary.getRange(`A5:H${4 + rosterRows.length}`).conditionalFormats.add("Custom", { formula: "=$D5=0", format: { fill: "#FFF3D6", font: { color: "#7A4B00" } } });
summary.getRange(`A5:H${4 + rosterRows.length}`).conditionalFormats.add("Custom", { formula: "=ISNUMBER(SEARCH(\"No SwimCloud\",$C5))", format: { fill: "#FDE2E2", font: { color: "#8B1E1E", bold: true } } });
summary.getRange("A4:H45").format.borders = { insideHorizontal: { style: "thin", color: "#D7E1E5" }, bottom: { style: "thin", color: "#9FB3BC" } };
summary.tables.add("A4:H45", true, "RosterSummaryTable").style = "TableStyleMedium2";
summary.freezePanes.freezeRows(4);
summary.getRange("A:A").format.columnWidth = 20;
summary.getRange("B:B").format.columnWidth = 20;
summary.getRange("C:C").format.columnWidth = 34;
summary.getRange("D:G").format.columnWidth = 12;
summary.getRange("H:H").format.columnWidth = 52;

const timeRows = source.times.map(row => {
  const match = row.event.match(/\s+(SCY|LCM|SCM)$/);
  const course = match ? match[1] : "";
  const event = match ? row.event.slice(0, -match[0].length) : row.event;
  const parsedDate = row.date ? new Date(`${row.date} 12:00:00`) : null;
  const resultUrl = row.href ? `https://www.swimcloud.com${row.href}` : row.url;
  return [row.rosterName, row.swimcloudName, event, course, row.time, row.marker, row.meet, parsedDate, resultUrl, row.url];
});

bests.getRange("A1:J1").merge();
bests.getRange("A1").values = [["Published Personal Bests"]];
bests.getRange("A1:J1").format = { fill: navy, font: { bold: true, color: "#FFFFFF", size: 18 }, verticalAlignment: "center" };
bests.getRange("A1:J1").format.rowHeight = 32;
bests.getRange("A2:J2").merge();
bests.getRange("A2").values = [["One row per SwimCloud-listed personal best. C = converted; X = extracted split; R = relay swim."]];
bests.getRange("A2:J2").format = { fill: aqua, font: { color: navy, italic: true } };
bests.getRange("A4:J4").values = [["Roster Name", "SwimCloud Name", "Event", "Course", "Time", "Marker", "Meet", "Date", "Result URL", "Profile URL"]];
if (timeRows.length) bests.getRange(`A5:J${4 + timeRows.length}`).values = timeRows;
for (let i = 0; i < timeRows.length; i++) {
  const r = 5 + i;
  bests.getRange(`I${r}`).formulas = [[`=HYPERLINK("${timeRows[i][8]}","Open result")`]];
  bests.getRange(`J${r}`).formulas = [[`=HYPERLINK("${timeRows[i][9]}","Open profile")`]];
}
bests.getRange("A4:J4").format = { fill: blue, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center", wrapText: true };
bests.getRange(`A5:J${4 + timeRows.length}`).format = { font: { color: navy }, verticalAlignment: "center" };
bests.getRange(`D5:F${4 + timeRows.length}`).format.horizontalAlignment = "center";
bests.getRange(`H5:H${4 + timeRows.length}`).format.numberFormat = "mmm d, yyyy";
bests.getRange(`I5:J${4 + timeRows.length}`).format.font = { color: "#0563C1", underline: "single" };
bests.getRange(`A5:J${4 + timeRows.length}`).format.borders = { insideHorizontal: { style: "thin", color: "#D7E1E5" } };
bests.tables.add(`A4:J${4 + timeRows.length}`, true, "BestTimesTable").style = "TableStyleMedium2";
bests.freezePanes.freezeRows(4);
bests.freezePanes.freezeColumns(1);
bests.getRange("A:B").format.columnWidth = 20;
bests.getRange("C:C").format.columnWidth = 14;
bests.getRange("D:F").format.columnWidth = 10;
bests.getRange("G:G").format.columnWidth = 38;
bests.getRange("H:H").format.columnWidth = 15;
bests.getRange("I:J").format.columnWidth = 52;

const summaryCheck = await workbook.inspect({ kind: "table", range: "Roster Summary!A1:H12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 8 });
console.log(summaryCheck.ndjson);
const timesCheck = await workbook.inspect({ kind: "table", range: "Best Times!A1:J12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 10 });
console.log(timesCheck.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

for (const [sheetName, fileName, range] of [["Roster Summary", "preview-summary.png", "A1:H20"], ["Best Times", "preview-times.png", "A1:J18"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/lake-minneola-swimcloud-best-times.xlsx`);
