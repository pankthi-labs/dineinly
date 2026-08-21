import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BillTotals } from "@/lib/bill-math";
import { formatBillAmount } from "@/lib/format";

// Download Bill (docs/product.md § Bills tab). Server-side, same reasoning
// as buildTableQrPdf (apps/web/lib/qr-pdf.ts): print output stays
// consistent regardless of the staff member's browser. A plain
// single-column receipt, not a laid-out grid — a bill is a short list of
// lines and totals, not a form.
const PAGE_WIDTH = 288; // 4in
const MARGIN = 24;
const LINE_HEIGHT = 16;

// StandardFonts.Helvetica only encodes WinAnsi (roughly Latin-1) — the ₹
// symbol and any non-Latin item/restaurant name throw at draw time rather
// than rendering. Everything drawn goes through this first so an unusual
// character degrades to "?" instead of 500ing the whole download. Shared
// with the QR PDF builder (apps/web/lib/qr-pdf.ts), which draws
// restaurant-authored table labels under the same font.
export function pdfSafe(text: string): string {
	return Array.from(text)
		.map((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code >= 0x20 && code <= 0xff ? char : "?";
		})
		.join("");
}

function formatPdfAmount(amount: number): string {
	return pdfSafe(formatBillAmount(amount).replace("₹", "Rs. "));
}

export async function buildBillPdf(input: {
	restaurant: {
		name: string;
		address: string;
		city: string;
		gst_number: string;
		state: string;
		pincode: string;
	};
	billNumber: string | null;
	tableLabel: string;
	totals: BillTotals;
}): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	// Page height fixed up front — pdf-lib pages can't grow, and a bill's
	// length is known before any drawing starts. 12.75 covers every fixed
	// row/gap below that isn't an item line, a tax slab row, or the
	// conditional service-charge row (header block through the pre-total
	// divider, subtotal row, pre-grand-total divider, grand total row);
	// the service charge row is budgeted whether or not it ends up drawn
	// (harmless blank line when it doesn't) so a waived-then-shown bill
	// never runs out of page. Rounded up so fractional gaps (half/quarter
	// line) can't shave a whole row off the bottom margin.
	const contentUnits =
		12.75 + input.totals.lines.length + input.totals.taxSlabs.length * 2;
	const pageHeight = MARGIN * 2 + Math.ceil(contentUnits) * LINE_HEIGHT;
	const page = pdfDoc.addPage([PAGE_WIDTH, pageHeight]);

	let y = pageHeight - MARGIN;

	function drawCentered(text: string, size: number, useFont = font) {
		const safe = pdfSafe(text);
		const width = useFont.widthOfTextAtSize(safe, size);
		page.drawText(safe, {
			x: (PAGE_WIDTH - width) / 2,
			y,
			size,
			font: useFont,
			color: rgb(0, 0, 0),
		});
		y -= LINE_HEIGHT;
	}

	// Truncates by measured width, not character count, so the left column
	// never runs into the right-aligned amount regardless of font metrics.
	function truncateToWidth(text: string, size: number, maxWidth: number) {
		if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
		let truncated = text;
		while (
			truncated.length > 1 &&
			font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth
		) {
			truncated = truncated.slice(0, -1);
		}
		return `${truncated}…`;
	}

	function drawRow(left: string, right: string, size = 9, useFont = font) {
		const safeRight = pdfSafe(right);
		const rightWidth = useFont.widthOfTextAtSize(safeRight, size);
		const maxLeftWidth = PAGE_WIDTH - MARGIN * 2 - rightWidth - 8;
		const safeLeft = truncateToWidth(pdfSafe(left), size, maxLeftWidth);
		page.drawText(safeLeft, {
			x: MARGIN,
			y,
			size,
			font: useFont,
			color: rgb(0, 0, 0),
		});
		page.drawText(safeRight, {
			x: PAGE_WIDTH - MARGIN - rightWidth,
			y,
			size,
			font: useFont,
			color: rgb(0, 0, 0),
		});
		y -= LINE_HEIGHT;
	}

	drawCentered(input.restaurant.name, 13, boldFont);
	drawCentered(`${input.restaurant.address}, ${input.restaurant.city}`, 8);
	drawCentered(`${input.restaurant.state} ${input.restaurant.pincode}`, 8);
	drawCentered(`GSTIN: ${input.restaurant.gst_number}`, 8);
	y -= LINE_HEIGHT / 2;
	drawCentered(
		`Bill #${input.billNumber ?? "-"} - Table ${input.tableLabel}`,
		9,
	);
	y -= LINE_HEIGHT / 2;

	page.drawLine({
		start: { x: MARGIN, y },
		end: { x: PAGE_WIDTH - MARGIN, y },
		thickness: 0.5,
		color: rgb(0.6, 0.6, 0.6),
	});
	y -= LINE_HEIGHT;

	for (const line of input.totals.lines) {
		drawRow(`${line.quantity}x ${line.name}`, formatPdfAmount(line.amount));
	}

	y -= LINE_HEIGHT / 2;
	page.drawLine({
		start: { x: MARGIN, y },
		end: { x: PAGE_WIDTH - MARGIN, y },
		thickness: 0.5,
		color: rgb(0.6, 0.6, 0.6),
	});
	y -= LINE_HEIGHT;

	drawRow("Subtotal", formatPdfAmount(input.totals.subtotal), 9, boldFont);
	for (const slab of input.totals.taxSlabs) {
		drawRow(`CGST (${slab.ratePercent}%)`, formatPdfAmount(slab.cgst));
		drawRow(`SGST (${slab.ratePercent}%)`, formatPdfAmount(slab.sgst));
	}
	if (input.totals.serviceCharge > 0) {
		drawRow("Service Charge", formatPdfAmount(input.totals.serviceCharge));
	}

	y -= LINE_HEIGHT / 4;
	page.drawLine({
		start: { x: MARGIN, y },
		end: { x: PAGE_WIDTH - MARGIN, y },
		thickness: 0.5,
		color: rgb(0.6, 0.6, 0.6),
	});
	y -= LINE_HEIGHT;

	drawRow("Grand Total", formatPdfAmount(input.totals.total), 11, boldFont);

	return pdfDoc.save();
}
