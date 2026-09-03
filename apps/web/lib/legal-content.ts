// Content mirrors docs/legal/*.md (the source of truth for legal review/edits) -
// duplicated here as plain strings since this is the only place in the app
// that renders long-form static markdown, and it isn't worth adding a
// markdown-loader/webpack config or a cross-package file read for it. Keep
// both in sync when editing.

export const PRIVACY_POLICY = `
# Privacy Policy

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [LAST UPDATED DATE]

Dineinly ("Dineinly," "we," "us," or "our") provides restaurant software that supports digital menus, guest ordering, kitchen and floor workflows, bill presentation, and restaurant operations (the "Service").

This Privacy Policy explains how we collect, use, share, and protect personal information when you use the Service, visit our website, contact us, or interact with a restaurant using Dineinly.

## 1. Who this policy covers

This Policy applies to:

- restaurant owners, managers, staff, and Dineinly administrators who use the Service;
- guests who access a restaurant's Dineinly menu or ordering experience through a QR code; and
- people who contact Dineinly or visit our website.

For guest-facing restaurant experiences, the restaurant is generally responsible for its relationship with its guests, including its menu, prices, taxes, fulfillment, payment collection, and service. Dineinly provides the software layer used by the restaurant.

**[LEGAL REVIEW REQUIRED: Confirm whether Dineinly acts as a processor/service provider for restaurant guest data, and add the appropriate data-processing language and agreement.]**

## 2. Information we collect

We collect information needed to operate and support the Service.

### Restaurant and staff information

This may include:

- restaurant name, address, city, state, pincode, GST number, and selected Dineinly experience;
- staff name, email address, mobile number, role, and invitation status;
- account and sign-in information, including email-based authentication records;
- restaurant menu content, including item names, descriptions, prices, categories, tax rates, availability, and guest preference options;
- operational information, such as tables, QR codes, sessions, orders, bill information, and staff actions within the Service.

### Guest and session information

Guests do not create Dineinly customer accounts in the current product experience. When a guest scans a restaurant QR code or uses the guest experience, Dineinly may process information connected to that visit, such as:

- the restaurant and table or session associated with the QR code;
- cart contents, menu preferences selected for an item, submitted orders, order status, bill requests, and bill status;
- a session-specific technical token used to provide the guest experience.

Dineinly is not designed to collect a guest's name or create per-guest order attribution in the current MVP.

### Information you provide directly

If you contact us, request support, or otherwise communicate with us, we may collect your name, email address, phone number, business details, and the contents of your message.

### Technical information

We may collect limited technical and usage information necessary to operate, secure, diagnose, and improve the Service, such as device, browser, IP address, log, and session information.

**[PLACEHOLDER: Confirm the exact technical data collected, analytics tools in production, cookie technologies, and whether any marketing tracking is used. Product analytics is documented as deferred before go-live.]**

## 3. How we use information

We use information to:

- provide, maintain, and secure the Service;
- authenticate staff and manage invitations and permissions;
- display menus, process carts and orders, provide live operational updates, and present bills;
- enable restaurant staff to manage restaurant operations;
- respond to support requests and communicate about the Service;
- prevent misuse, protect the Service, and investigate security or operational issues;
- comply with applicable legal obligations; and
- improve the Service where permitted by law.

## 4. Payments

Dineinly does not facilitate, process, or record payment transactions. Restaurants collect payment through their own external methods, such as cash, card terminals, UPI, or bank transfer.

Dineinly may display a bill and record that restaurant staff marked a bill as settled, but it does not receive payment card details, UPI credentials, bank-account details, or payment-processor transaction data through the documented product flow.

## 5. How we share information

We may share information:

- with the restaurant connected to the relevant menu, table session, order, or bill;
- with service providers that help us operate the Service, such as hosting, authentication, database, email, and support providers;
- with professional advisers, regulators, law enforcement, or other parties where required by law or necessary to protect rights, safety, or the Service;
- as part of a corporate transaction, such as a merger, acquisition, financing, or sale of assets; or
- with your direction or consent.

We do not sell personal information.

**[PLACEHOLDER: Confirm whether "share" has a specific statutory meaning under laws applicable to Dineinly, and revise this statement if needed.]**

## 6. Access and security

Dineinly uses role-based access controls designed to limit restaurant data access to authorized users. Restaurant data is tenant-scoped, and guest access is limited to the relevant active restaurant session.

No system is completely secure. You are responsible for safeguarding devices, QR materials, staff access, and any credentials under your control. Please notify us promptly at [SECURITY CONTACT EMAIL] if you believe access to the Service has been compromised.

## 7. Data retention

We retain information for as long as reasonably necessary to provide the Service, meet legal, accounting, dispute-resolution, security, and operational requirements, and enforce our agreements.

**[PLACEHOLDER: Define retention periods by data category, including staff records, restaurant operational records, support communications, authentication logs, backups, and deleted/closed sessions.]**

## 8. Your choices and rights

Depending on where you live, you may have rights to request access, correction, deletion, restriction, objection, portability, or withdrawal of consent for certain personal information.

To make a request, contact us at [PRIVACY CONTACT EMAIL]. We may need to verify your identity and authority before responding. If your request concerns information handled by a restaurant through the Service, we may direct you to that restaurant or assist it in responding where appropriate.

## 9. International transfers

**[PLACEHOLDER: State the countries where Dineinly and its providers process data, the transfer mechanism used, and any applicable safeguards.]**

## 10. Children

The Service is intended for restaurant operations and restaurant guests. It is not directed to children under [APPLICABLE AGE]. We do not knowingly collect personal information from children in violation of applicable law.

## 11. Changes to this Policy

We may update this Policy from time to time. We will post the updated version with a revised "Last updated" date and, where required, provide additional notice.

## 12. Contact us

**[LEGAL ENTITY NAME]**
[REGISTERED ADDRESS]
[PRIVACY CONTACT EMAIL]
[SUPPORT CONTACT EMAIL]
[PHONE NUMBER, IF APPLICABLE]
`;

export const TERMS_OF_SERVICE = `
# Terms of Service

**Effective date:** [EFFECTIVE DATE]
**Last updated:** [LAST UPDATED DATE]

These Terms of Service ("Terms") govern access to and use of Dineinly's website, software, and related services (collectively, the "Service"). By accessing or using the Service, you agree to these Terms.

If you use the Service for a restaurant or other organization, you represent that you have authority to bind that organization. In that case, "you" includes that organization.

## 1. The Service

Dineinly provides restaurant workflow software. Depending on the restaurant's selected experience, the Service may provide a view-only digital menu, guest ordering, staff and kitchen workflows, live order status, bill presentation, and restaurant operations tools.

Dineinly's features may vary by selected experience and may change as the Service evolves.

## 2. Restaurant responsibilities

Restaurants are responsible for:

- ensuring their menu, item descriptions, prices, taxes, availability, and restaurant details are accurate and current;
- fulfilling guest orders, including food quality, preparation, service, pickup, delivery where independently offered, and handling guest concerns;
- ensuring that staff use the Service appropriately and only with authorized access;
- obtaining all permissions, notices, and consents required for information they provide to or process through the Service;
- complying with laws applicable to their restaurant, menu, food safety, tax, invoicing, consumer protection, employment, privacy, and payment practices; and
- safeguarding printed QR codes and restaurant devices.

Dineinly does not control a restaurant's food, service, menu, pricing, taxes, staff decisions, or fulfillment.

## 3. No payment processing

Dineinly does not facilitate, process, or record payment transactions.

Where the Service displays a bill or a "settled" status, this reflects the restaurant's use of an external payment method and its staff's confirmation. Dineinly does not verify, authorize, settle, reverse, refund, or synchronize external payments.

Restaurants remain solely responsible for payment collection, refunds, cancellations, chargebacks, tax compliance, and applicable customer disclosures.

## 4. Accounts, staff access, and QR access

Restaurant staff access is invitation-based and may use email-based sign-in. You must keep credentials and authorized devices secure and promptly remove or update access when it is no longer appropriate.

Guest access is provided through restaurant QR codes and session-specific access mechanisms. Guests do not receive a Dineinly customer account in the documented product flow.

You must not:

- share staff access with unauthorized people;
- attempt to access another restaurant's data or another guest session;
- alter, misuse, or distribute QR codes in a way that misleads guests or compromises service;
- interfere with the Service, security controls, or real-time workflows; or
- use the Service for unlawful, fraudulent, harmful, or deceptive activity.

## 5. Restaurant content and data

You retain ownership of the content and data you provide to the Service, including restaurant details, menus, and operational data ("Restaurant Data").

You grant Dineinly a non-exclusive right to host, process, reproduce, transmit, and display Restaurant Data only as needed to provide, secure, support, and improve the Service, comply with law, and enforce these Terms.

You represent that you have all rights and permissions needed to provide Restaurant Data and that it does not infringe another person's rights or violate applicable law.

## 6. Orders, bills, and product limitations

The Service is a workflow tool. It may help display menu information, collect and transmit order requests, coordinate kitchen and floor activity, and present bills.

Restaurants acknowledge that:

- guest orders may be subject to restaurant acceptance, availability, correction, cancellation, and operational constraints;
- certain order changes are limited once kitchen preparation begins;
- bills may be adjusted by authorized restaurant staff before settlement in accordance with the Service's available workflow;
- settled bill totals are frozen in the Service; and
- Dineinly does not guarantee that the Service will prevent every ordering, pricing, tax, operational, network, or human error.

The current MVP does not include payment processing, loyalty, delivery, reservations, customer accounts, inventory management, accounting, or offline operation.

## 7. Fees and subscriptions

Fees, subscription terms, taxes, billing cadence, trial terms, renewal terms, and cancellation terms will be stated in an applicable order form, subscription page, or separate commercial agreement.

**[PLACEHOLDER: Add the actual commercial terms, including whether auto-renewal applies, notice periods, refunds, suspension rights, late payment treatment, and applicable taxes.]**

## 8. Acceptable use

You may use the Service only in accordance with these Terms and applicable law. You may not:

- copy, modify, reverse engineer, decompile, or attempt to extract source code from the Service except where law prohibits that restriction;
- use the Service to develop or support a competing service;
- bypass access controls, rate limits, or security measures;
- upload or transmit malicious code;
- use the Service to infringe intellectual-property, privacy, or other rights; or
- resell, lease, sublicense, or make the Service available to third parties except as expressly permitted in writing.

## 9. Availability, support, and changes

We aim to provide a reliable Service, but do not guarantee uninterrupted or error-free operation. The Service may be unavailable because of maintenance, updates, network failures, third-party service interruptions, or events outside our reasonable control.

We may update, modify, suspend, or discontinue parts of the Service. Where practicable, we will provide reasonable notice of material changes.

**[PLACEHOLDER: Add any service-level agreement, support hours, uptime commitment, maintenance notice policy, and data-export commitments.]**

## 10. Intellectual property

Dineinly and its licensors retain all rights in the Service, including its software, designs, branding, documentation, and other materials. Except for the limited right to use the Service under these Terms, no rights are granted to you.

## 11. Confidentiality

Each party may receive non-public information from the other in connection with the Service. Each party will use the other's confidential information only to perform or receive the Service and will protect it using reasonable care.

This obligation does not apply to information that is public through no breach, already lawfully known, independently developed, or lawfully received from a third party without confidentiality obligations.

**[LEGAL REVIEW REQUIRED: Align this clause with any enterprise agreement, NDA, and applicable data-processing agreement.]**

## 12. Disclaimers

To the maximum extent permitted by law, the Service is provided "as is" and "as available." Dineinly disclaims implied warranties, including merchantability, fitness for a particular purpose, non-infringement, and uninterrupted availability.

Dineinly does not warrant the accuracy of restaurant-provided menus, prices, tax calculations, food descriptions, guest orders, payment confirmations, or restaurant service outcomes.

Nothing in these Terms excludes rights or warranties that cannot lawfully be excluded.

## 13. Limitation of liability

To the maximum extent permitted by law, Dineinly will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, goodwill, data, or business opportunities.

**[PLACEHOLDER: Set the agreed liability cap, for example fees paid in the preceding 12 months, and define any negotiated exceptions, such as fraud, wilful misconduct, confidentiality, data protection, or indemnity claims.]**

## 14. Indemnity

You will defend, indemnify, and hold harmless Dineinly and its personnel from third-party claims arising from your Restaurant Data, restaurant operations, food or service, payment collection, violation of law, or breach of these Terms.

**[LEGAL REVIEW REQUIRED: Confirm whether this should be mutual and whether a claim-control procedure is needed.]**

## 15. Suspension and termination

We may suspend or terminate access to the Service if you materially breach these Terms, create a security risk, fail to pay amounts due, or use the Service unlawfully.

You may stop using the Service at any time, subject to any applicable commercial agreement. On termination, the parties' rights and obligations will end except those that by their nature should survive, including payment, confidentiality, intellectual property, disclaimers, limitations of liability, indemnity, and dispute terms.

**[PLACEHOLDER: Define post-termination data access, export window, and deletion timetable.]**

## 16. Governing law and disputes

These Terms are governed by the laws of [JURISDICTION], excluding conflict-of-law rules. Courts located in [CITY, JURISDICTION] will have exclusive jurisdiction, unless applicable law requires otherwise.

**[LEGAL REVIEW REQUIRED: Confirm jurisdiction, dispute-resolution process, arbitration requirements if any, and consumer-law treatment for guest users.]**

## 17. Changes to these Terms

We may revise these Terms from time to time. Updated Terms will be posted with a revised "Last updated" date. Continued use after the effective date of the updated Terms means you accept them, to the extent permitted by law.

## 18. Contact

**[LEGAL ENTITY NAME]**
[REGISTERED ADDRESS]
[LEGAL CONTACT EMAIL]
[SUPPORT CONTACT EMAIL]
`;

export const COPYRIGHT_NOTICE = `
# Copyright

**Last updated:** [LAST UPDATED DATE]

## 1. Ownership

The Dineinly website, Service, software, user interface, workflows, visual design, text, logos, trademarks, documentation, and other materials made available by Dineinly are owned by or licensed to **[LEGAL ENTITY NAME]** and are protected by applicable intellectual-property laws.

Except as expressly permitted in writing, you may not copy, reproduce, distribute, modify, create derivative works from, publicly display, or commercially exploit any Dineinly material.

## 2. Limited permission to use the Service

Subject to the Terms of Service, Dineinly grants authorized users a limited, non-exclusive, non-transferable, revocable right to access and use the Service for their internal restaurant operations during the applicable subscription period.

This permission does not transfer ownership of any Dineinly intellectual property.

## 3. Restaurant content

Restaurants remain responsible for the menu content, restaurant details, prices, tax information, branding, and other materials they provide through the Service.

Restaurants must only upload or use content they have the right to use. Dineinly may remove or restrict access to content that it reasonably believes infringes rights, violates law, or breaches its Terms.

## 4. Trademarks

"Dineinly," the Dineinly name, logo, and any related marks are trademarks or trade dress of **[LEGAL ENTITY NAME]** or its licensors.

You may not use these marks without prior written permission, except for accurate, non-misleading references to Dineinly in accordance with applicable law.

**[PLACEHOLDER: Confirm registered marks, registration numbers, jurisdictions, and approved trademark-use guidelines.]**

## 5. Copyright notices

If you believe material available through the Service infringes your copyright, please send a written notice to:

**Copyright Agent:** [NAME OR TITLE]
**Email:** [COPYRIGHT EMAIL]
**Address:** [REGISTERED ADDRESS]

Please include:

- your name and contact details;
- identification of the copyrighted work;
- the location of the allegedly infringing material;
- a statement that you have a good-faith belief the use is unauthorized;
- a statement that the information in your notice is accurate and, where applicable, that you are authorized to act for the copyright owner; and
- your physical or electronic signature.

**[LEGAL REVIEW REQUIRED: Add jurisdiction-specific notice-and-takedown language only where applicable, including a counter-notice process and repeat-infringer policy if required.]**

## 6. Third-party services and links

The Service may rely on third-party providers for infrastructure, authentication, email delivery, or other operational functions. The Service may also link to third-party websites or services.

Dineinly does not control third-party services and is not responsible for their content, availability, privacy practices, or terms. Your use of third-party services is governed by their own terms and policies.

## 7. Product notice

Dineinly is restaurant workflow software. It does not process payments or act as a payment gateway, bank, card network, UPI provider, or financial institution.

Restaurants remain responsible for food and beverage service, guest interactions, payment collection, taxes, invoices, refunds, cancellations, and compliance with applicable laws.

## 8. No professional advice

Information on the Dineinly website and Service is provided for general informational and operational purposes. It is not legal, tax, accounting, food-safety, employment, or financial advice.

Restaurants should obtain advice from qualified professionals for their specific circumstances.

## 9. Contact

For legal, intellectual-property, or trademark inquiries:

**[LEGAL ENTITY NAME]**
[REGISTERED ADDRESS]
[LEGAL CONTACT EMAIL]
[COPYRIGHT EMAIL]
`;

export const LEGAL_DOCS = [
	{
		slug: "privacy",
		title: "Privacy Policy",
		description: "How Dineinly collects, uses, and protects information.",
		content: PRIVACY_POLICY,
	},
	{
		slug: "terms",
		title: "Terms of Service",
		description: "The terms that govern use of the Dineinly Service.",
		content: TERMS_OF_SERVICE,
	},
	{
		slug: "copyright",
		title: "Copyright",
		description: "Ownership, trademarks, and copyright notices.",
		content: COPYRIGHT_NOTICE,
	},
] as const;
