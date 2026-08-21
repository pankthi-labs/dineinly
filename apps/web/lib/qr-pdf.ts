import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { pdfSafe } from "@/lib/bill-pdf";
import { guestTableUrl } from "@/lib/qr-url";

// Shared page-builder for both downloadQrPdf (one table) and
// downloadAllQrPdf (every table, one page each) — docs/architecture.md §
// Table QR Generation. Renders fully server-side so print output is
// consistent regardless of the admin's browser. QR is a PNG raster, not
// SVG: pdf-lib has no native SVG support, and 512px is print-crisp at
// table-tent size.
const PAGE_WIDTH = 288; // 4in
const PAGE_HEIGHT = 432; // 6in
const QR_SIZE = 220;
const QR_PIXEL_WIDTH = 512;

export async function buildTableQrPdf(
	tables: { label: string; qrToken: string }[],
	origin: string,
): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

	for (const table of tables) {
		const qrPng = await QRCode.toBuffer(guestTableUrl(origin, table.qrToken), {
			type: "png",
			width: QR_PIXEL_WIDTH,
			margin: 1,
		});
		const qrImage = await pdfDoc.embedPng(qrPng);

		const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		page.drawImage(qrImage, {
			x: (PAGE_WIDTH - QR_SIZE) / 2,
			y: PAGE_HEIGHT / 2,
			width: QR_SIZE,
			height: QR_SIZE,
		});

		const labelSize = 20;
		const label = pdfSafe(table.label);
		const labelWidth = font.widthOfTextAtSize(label, labelSize);
		page.drawText(label, {
			x: (PAGE_WIDTH - labelWidth) / 2,
			y: PAGE_HEIGHT / 2 - 40,
			size: labelSize,
			font,
			color: rgb(0, 0, 0),
		});
	}

	return pdfDoc.save();
}
