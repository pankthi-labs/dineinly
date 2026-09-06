import { HomeContent } from "./home-content";

// Draft comparison route only - not linked from nav, not gated. Delete once
// the home page copy/layout call is made; do not ship both versions.
export default function Page() {
	return <HomeContent />;
}
