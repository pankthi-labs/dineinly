"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	type ChangeEvent,
	type ClipboardEvent,
	type FormEvent,
	type KeyboardEvent,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Field } from "@/components/form-sheet";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIMARY_BUTTON_CLASS =
	"flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-background text-sm transition-[background-color,transform] duration-(--duration-base) ease-out hover:bg-accent-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted disabled:active:scale-100";

type Step = "email" | "otp" | "linking";

export function SignInForm() {
	const router = useRouter();
	const supabase = createClient();
	const resolveSignIn = trpc.auth.resolveSignIn.useMutation();
	const linkStaffAccount = trpc.auth.linkStaffAccount.useMutation();
	const [step, setStep] = useState<Step>("email");
	const [email, setEmail] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [isSendingCode, setIsSendingCode] = useState(false);

	const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
	const [otpError, setOtpError] = useState<string | null>(null);
	const [isVerifying, setIsVerifying] = useState(false);
	const [resendCooldown, setResendCooldown] = useState(0);

	const [linkError, setLinkError] = useState<string | null>(null);

	useEffect(() => {
		if (resendCooldown <= 0) return;
		const timer = setInterval(() => {
			setResendCooldown((seconds) => Math.max(0, seconds - 1));
		}, 1000);
		return () => clearInterval(timer);
	}, [resendCooldown]);

	// Same generic message whether the email isn't invited or Supabase
	// itself failed — the resolveSignIn gate must not tell an unauthorized
	// caller which case it hit (see supabase/migrations/
	// 20260803042459_add_staff_auth_flow.sql).
	const SEND_FAILED_MESSAGE = "Couldn't send a code to that email.";

	async function sendOtp() {
		const normalizedEmail = email.trim().toLowerCase();
		let shouldCreateUser: boolean;
		try {
			const resolved = await resolveSignIn.mutateAsync({
				email: normalizedEmail,
			});
			if (!resolved.allowed) {
				return SEND_FAILED_MESSAGE;
			}
			shouldCreateUser = resolved.shouldCreateUser;
		} catch {
			return SEND_FAILED_MESSAGE;
		}
		const { error } = await supabase.auth.signInWithOtp({
			email: normalizedEmail,
			options: { shouldCreateUser },
		});
		return error ? SEND_FAILED_MESSAGE : null;
	}

	async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!EMAIL_PATTERN.test(email)) {
			setEmailError("Enter a valid work email address.");
			return;
		}
		setEmailError(null);
		setIsSendingCode(true);
		const error = await sendOtp();
		setIsSendingCode(false);
		if (error) {
			setEmailError(error);
			return;
		}
		setOtp(Array(OTP_LENGTH).fill(""));
		setOtpError(null);
		setResendCooldown(RESEND_COOLDOWN_SECONDS);
		setStep("otp");
	}

	// Runs right after verifyOtp() succeeds, and again on manual retry from
	// the "linking" step. The OTP itself already verified — a link failure
	// here is a Staff-row linkage problem, not a sign-in problem, so it must
	// not be presented as "try your code again". A no-op result (seeded
	// Dineinly Admin, no matching invited Staff row) isn't an error and
	// resolves the same way as a successful link.
	async function attemptLink() {
		setLinkError(null);
		try {
			await linkStaffAccount.mutateAsync();
			router.replace("/admin");
		} catch {
			setLinkError(
				"You're signed in, but we couldn't finish setting up your account.",
			);
		}
	}

	async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (otp.some((digit) => digit === "")) {
			setOtpError("Enter the full 6-digit code.");
			return;
		}
		setOtpError(null);
		setIsVerifying(true);
		const { error } = await supabase.auth.verifyOtp({
			email: email.trim().toLowerCase(),
			token: otp.join(""),
			type: "email",
		});
		if (error) {
			setIsVerifying(false);
			setOtpError("That code is incorrect or expired.");
			return;
		}
		setIsVerifying(false);
		setStep("linking");
		await attemptLink();
	}

	async function handleResend() {
		if (resendCooldown > 0) return;
		setOtp(Array(OTP_LENGTH).fill(""));
		setOtpError(null);
		const error = await sendOtp();
		if (error) {
			setOtpError("Couldn't resend the code.");
			return;
		}
		setResendCooldown(RESEND_COOLDOWN_SECONDS);
	}

	function handleBack() {
		setStep("email");
		setOtpError(null);
		setIsVerifying(false);
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
			<BrandLogo height={40} priority />

			<div className="w-full max-w-sm rounded-xl border border-divider bg-surface p-6">
				{step === "email" ? (
					<EmailStep
						email={email}
						error={emailError}
						isSubmitting={isSendingCode}
						onEmailChange={setEmail}
						onSubmit={handleEmailSubmit}
					/>
				) : step === "otp" ? (
					<OtpStep
						email={email}
						otp={otp}
						error={otpError}
						isVerifying={isVerifying}
						resendCooldown={resendCooldown}
						onOtpChange={setOtp}
						onSubmit={handleOtpSubmit}
						onResend={handleResend}
						onBack={handleBack}
					/>
				) : (
					<LinkingStep
						error={linkError}
						isPending={linkStaffAccount.isPending}
						onRetry={attemptLink}
					/>
				)}
			</div>

			<p className="text-caps text-muted">
				© {new Date().getFullYear()} Dineinly. All rights reserved.
			</p>
		</main>
	);
}

function SubmitButton({
	isPending,
	pendingLabel,
	label,
}: {
	isPending: boolean;
	pendingLabel: string;
	label: string;
}) {
	return (
		<button
			type="submit"
			disabled={isPending}
			aria-busy={isPending}
			className={PRIMARY_BUTTON_CLASS}
		>
			{isPending ? (
				<Loader2
					className="icon-sm spinner"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			) : null}
			{isPending ? pendingLabel : label}
		</button>
	);
}

function EmailStep({
	email,
	error,
	isSubmitting,
	onEmailChange,
	onSubmit,
}: {
	email: string;
	error: string | null;
	isSubmitting: boolean;
	onEmailChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
	return (
		<>
			<div className="mb-6 text-center">
				<h1 className="text-lg text-primary">Sign in</h1>
				<p className="mt-1 text-secondary text-sm">
					Enter your work email to get your sign-in code.
				</p>
			</div>

			<form className="space-y-6" onSubmit={onSubmit} noValidate>
				<Field label="Your work email" error={error ?? undefined}>
					<input
						name="email"
						type="email"
						autoComplete="email"
						placeholder="name@restaurant.com"
						required
						value={email}
						disabled={isSubmitting}
						onChange={(event) => onEmailChange(event.target.value)}
					/>
				</Field>

				<SubmitButton
					isPending={isSubmitting}
					pendingLabel="Sending…"
					label="Continue"
				/>
			</form>
		</>
	);
}

function OtpStep({
	email,
	otp,
	error,
	isVerifying,
	resendCooldown,
	onOtpChange,
	onSubmit,
	onResend,
	onBack,
}: {
	email: string;
	otp: string[];
	error: string | null;
	isVerifying: boolean;
	resendCooldown: number;
	onOtpChange: (otp: string[]) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onResend: () => void;
	onBack: () => void;
}) {
	const errorId = useId();
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

	useEffect(() => {
		inputRefs.current[0]?.focus();
	}, []);

	function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
		const digit = event.target.value.replace(/\D/g, "").slice(-1);
		const next = [...otp];
		next[index] = digit;
		onOtpChange(next);
		if (digit && index < OTP_LENGTH - 1) {
			inputRefs.current[index + 1]?.focus();
		}
	}

	function handleKeyDown(
		index: number,
		event: KeyboardEvent<HTMLInputElement>,
	) {
		if (event.key === "Backspace" && !otp[index] && index > 0) {
			inputRefs.current[index - 1]?.focus();
		}
	}

	function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
		event.preventDefault();
		const digits = event.clipboardData
			.getData("text")
			.replace(/\D/g, "")
			.slice(0, OTP_LENGTH)
			.split("");
		if (digits.length === 0) return;
		const next = Array.from({ length: OTP_LENGTH }, (_, i) => digits[i] ?? "");
		onOtpChange(next);
		inputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
	}

	return (
		<>
			<button
				type="button"
				onClick={onBack}
				className="mb-4 text-caps text-secondary hover:text-primary"
			>
				← Back
			</button>

			<div className="mb-6 text-center">
				<h1 className="text-lg text-primary">Verify login</h1>
				<p className="mt-1 text-secondary text-sm">
					Enter the 6-digit code sent to {email}.
				</p>
			</div>

			<form className="space-y-6" onSubmit={onSubmit} noValidate>
				<fieldset className="flex justify-between gap-2" disabled={isVerifying}>
					<legend className="sr-only">Verification code</legend>
					{otp.map((digit, index) => (
						<input
							key={`otp-digit-${
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length OTP boxes never reorder.
								index
							}`}
							ref={(el) => {
								inputRefs.current[index] = el;
							}}
							type="text"
							inputMode="numeric"
							pattern="[0-9]*"
							maxLength={1}
							autoComplete={index === 0 ? "one-time-code" : "off"}
							aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? errorId : undefined}
							value={digit}
							onChange={(event) => handleChange(index, event)}
							onKeyDown={(event) => handleKeyDown(index, event)}
							onPaste={handlePaste}
							className={`h-12 w-12 border-b bg-transparent text-center text-lg text-primary transition-colors duration-(--duration-base) ease-out focus:outline-none disabled:cursor-not-allowed disabled:text-muted ${
								error ? "border-error" : "border-secondary focus:border-accent"
							}`}
						/>
					))}
				</fieldset>

				{error ? (
					<p
						id={errorId}
						role="alert"
						className="text-center text-error text-sm"
					>
						{error}
					</p>
				) : null}

				<button
					type="button"
					onClick={onResend}
					disabled={resendCooldown > 0}
					className="block w-full text-center text-caps text-secondary hover:text-primary disabled:cursor-not-allowed disabled:text-muted disabled:hover:text-muted"
				>
					{resendCooldown > 0
						? `Resend code (${resendCooldown}s)`
						: "Resend code"}
				</button>

				<SubmitButton
					isPending={isVerifying}
					pendingLabel="Verifying…"
					label="Sign in"
				/>
			</form>
		</>
	);
}

function LinkingStep({
	error,
	isPending,
	onRetry,
}: {
	error: string | null;
	isPending: boolean;
	onRetry: () => void;
}) {
	if (!error) {
		return (
			<div className="flex flex-col items-center gap-4 py-6 text-center">
				<Loader2
					className="icon-lg spinner text-secondary"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<p className="text-secondary text-sm">Setting up your account…</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center gap-6 py-2 text-center">
			<p role="alert" className="text-error text-sm">
				{error}
			</p>
			<button
				type="button"
				onClick={onRetry}
				disabled={isPending}
				aria-busy={isPending}
				className={PRIMARY_BUTTON_CLASS}
			>
				{isPending ? (
					<Loader2
						className="icon-sm spinner"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				) : null}
				{isPending ? "Retrying…" : "Try again"}
			</button>
		</div>
	);
}
