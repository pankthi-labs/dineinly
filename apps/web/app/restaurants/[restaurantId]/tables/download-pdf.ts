// Shared by every "Download PDF" action on the Table Matrix — decodes the
// base64 PDF the tables router returns and saves it via a throwaway link,
// same as any browser-native file download. No server-hosted file to clean
// up: the object URL is revoked right after the click fires.
export function downloadPdf(fileName: string, base64: string) {
	const bytes = atob(base64);
	const buffer = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		buffer[i] = bytes.charCodeAt(i);
	}
	const blob = new Blob([buffer], { type: "application/pdf" });
	const url = URL.createObjectURL(blob);

	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();

	URL.revokeObjectURL(url);
}
