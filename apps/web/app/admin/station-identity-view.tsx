"use client";

import { FormSheet } from "@/components/form-sheet";
import type { StaffRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";

// The station device's own Staff row is a shared synthetic identity, not a
// person (docs/architecture.md § Station Account Provisioning) — editing its
// name or PIN from the tablet itself would rename/re-key that shared account
// for whoever last unlocked it, with no real staff member behind the edit.
// Self-service name + PIN changes stay on ProfileSheet, reachable only by
// signing in individually at /sign-in.
export function StationIdentityView({
	actingStaffName,
	actingStaffRole,
	onClose,
}: {
	actingStaffName: string | null;
	actingStaffRole: StaffRole | null;
	onClose: () => void;
}) {
	return (
		<FormSheet
			title="Profile"
			onClose={onClose}
			footer={
				<button
					type="button"
					onClick={onClose}
					className="w-full rounded-md border border-divider bg-surface-elevated py-4 font-medium text-secondary text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-surface-raised"
				>
					Close
				</button>
			}
		>
			<div className="space-y-8">
				<div className="space-y-2">
					<span className="text-caps text-muted">Name</span>
					<p className="text-primary text-sm">
						{actingStaffName ?? "No one is signed in on this device."}
					</p>
				</div>
				{actingStaffName ? (
					<div className="space-y-2">
						<span className="text-caps text-muted">Role</span>
						<p className="text-primary text-sm">
							{actingStaffRole ? ROLE_LABEL[actingStaffRole] : "—"}
						</p>
					</div>
				) : null}
				<p className="text-secondary text-sm">
					This is a shared device. Sign in on your own phone at /sign-in to edit
					your name or PIN.
				</p>
			</div>
		</FormSheet>
	);
}
