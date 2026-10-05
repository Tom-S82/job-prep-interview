import type { ArchitectureScenario } from '../scenarios.ts';

export const gdprErasure: ArchitectureScenario = {
	id: 'gdpr-erasure',
	title: 'GDPR erasure request',
	summary: 'A former customer asks for all their data to be erased. You have one month.',
	leadExplanation: {
		constraint:
			"The constraint is that erasure isn't absolute here: anti-money-laundering rules require us to keep some of this data for five years.",
		reasons: [
			'Deleting KYC and transaction records early breaches MLR 2017, so we decide per data category what to keep, restrict and erase.',
			'We can only erase what we can find, so we use PII tags and lineage, not emails to teams.',
			'Archives are immutable, so we crypto-shred the identity key rather than restoring and rewriting files.'
		],
		tradeOff:
			"The customer doesn't get everything deleted today, so we must explain clearly what we kept, why and until when. And crypto-shredding only works if the platform was designed with an identity vault.",
		switchWhen: 'If the retention period had already ended, we would erase everything except the evidence of the request itself.'
	},
	leadSays: {
		first:
			'The constraint is that GDPR erasure sits alongside a legal duty to keep records. So the first decision is per data category: keep and restrict what MLR requires, erase the rest. It means a more careful reply to the customer, but deleting everything would breach anti-money-laundering rules.',
		find: "We can't erase what we can't find. PII tags tell us which columns hold personal data; lineage tells us every table, report and log they flow into. A name search is a useful backstop, but it misses pseudonymised and derived copies.",
		archives:
			"Archived files are immutable and slow to restore. Because archives only hold surrogate keys, destroying the customer's key in the identity vault makes those rows anonymous with no restore. If we hadn't designed for that, we'd have to restore and rewrite, which is the argument for fixing the design.",
		aggregates:
			"Anonymous aggregates aren't personal data, and changing submitted figures breaks regulatory history. So we leave them, but check for small groups that could still identify someone."
	},
	leadPhrases: [
		'"The constraint is that erasure isn\'t absolute here."',
		'"We split the data into what we must keep, what we restrict and what we erase."',
		'"We find it through lineage, not by asking around."',
		'"The trade-off is that the customer gets an explanation, not a blank slate."',
		'"If retention had expired, we\'d erase everything except the evidence of the request."'
	],
	antiPatterns: [
		{
			sounds: '"We\'d delete everything to be fully compliant."',
			problem:
				'Sounds safe, but breaches anti-money-laundering rules. Compliance means meeting all obligations, not maximising deletion.'
		},
		{
			sounds: '"We\'d run a script across all the databases."',
			problem: "Sounds decisive, but hides the hard part: knowing where the data is. Say how you'd find it."
		}
	],
	juniorVsLead: {
		junior: "We'd delete all of the customer's data from every system, including backups, to be fully GDPR compliant.",
		lead: "The constraint is that erasure isn't absolute: MLR 2017 means we keep their KYC and transactions for five years after they left. So we erase what has no legal basis, restrict what we must keep, find every copy through lineage, crypto-shred the archives, and tell the customer what we kept and why. If retention had expired, we'd erase everything.",
		whyBetter: [
			'Opens with the legal constraint that changes the whole answer',
			'Replaces "fully compliant" with what compliance actually requires',
			'Covers how the data is found, not just that it is deleted',
			'Says what would happen in the other case'
		]
	},
	context: `A customer who **closed their account two years ago** asks thinkmoney to **erase all their personal data** under UK GDPR Article 17. You have **one month** to respond (extendable by two further months only for complex cases, and the customer must be told).

Their data is in the **SQL Server core banking system**, **S3 Bronze** (including archived partitions in Glacier), **Silver and Gold** tables, **Redshift**, **Power BI** datasets, **MCP audit logs**, and **database backups**.`,
	businessContext:
		'Getting erasure wrong in either direction is a problem: keeping data without a lawful basis breaches GDPR, but deleting records the firm must keep under anti-money-laundering rules breaches those. The panel wants to see regulatory judgement as well as engineering.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Must thinkmoney erase everything, or is there a reason to keep some of it?',
		'How do you find every copy of this person’s data?',
		'What about immutable or archived data and backups?',
		'How do you prove what you did?'
	],
	level1Expert: `**Decide what must be kept, find every copy, erase or restrict, prove it.**

- **Log and verify the request**, start the one-month clock, and involve the **DPO**. The data team executes; legal decides.
- **Check the legal basis to retain**: the account closed two years ago, so **MLR 2017 requires keeping customer due diligence and transaction records for 5 years** after the relationship ended. Art. 17(3)(b) exempts those. They are **restricted** (compliance access only) and **scheduled for deletion** when retention ends. Everything else (marketing data, app telemetry, analytics profiles) is erased now.
- **Find every copy using the catalogue, PII tags and lineage**, not by asking around: SQL Server, Bronze, Silver, Gold, Redshift, Power BI, MCP logs, quarantine.
- **Erase at the system of record and let CDC carry deletes downstream**, plus **Iceberg row-level deletes with snapshot expiry** so time travel can't bring it back. For archives, **crypto-shred the identity key** in the identity vault, so archived rows become anonymous without restoring Glacier. Aggregates without personal data stay.
- **Backups aren't edited**: they age out on their normal cycle and the erasure is re-applied if one is ever restored.
- **Record the evidence** (what was erased, restricted or scheduled, when, by which job) and **reply to the customer**, explaining what was kept, why and until when.`,
	level2: [
		{
			id: 'first',
			question: 'After verifying the customer’s identity, what is your first decision?',
			options: [
				{
					id: 'A',
					text: 'Delete everything about them immediately',
					verdict: 'weak',
					feedback:
						'Feels compliant, but deleting KYC and transaction records within the MLR retention period breaches anti-money-laundering obligations.'
				},
				{
					id: 'B',
					text: 'Work out, per data category, whether there is a legal obligation to retain it',
					verdict: 'best',
					feedback: 'Erasure is not absolute. Art. 17(3)(b) exempts data held under a legal obligation such as MLR 2017.'
				},
				{
					id: 'C',
					text: 'Refuse: they were a customer, so we can keep their data',
					verdict: 'weak',
					feedback: 'Having been a customer is not a lawful basis on its own. Data with no retention requirement must be erased.'
				}
			],
			expert: `**Classify by legal basis first.** For a customer who left two years ago: KYC and transaction records are retained under MLR 2017 (restricted, scheduled for deletion at the 5-year point); marketing preferences, app telemetry and analytics profiles have no basis and go now. The DPO owns the legal call; the platform must make both outcomes executable.`
		},
		{
			id: 'find',
			question: 'How do you find every place their data lives?',
			options: [
				{
					id: 'A',
					text: 'Email each team and ask them to check their systems',
					verdict: 'weak',
					feedback: 'Slow, inconsistent and unprovable. Copies nobody remembers (caches, logs, quarantine) get missed.'
				},
				{
					id: 'B',
					text: 'Use the data catalogue, PII column tags and lineage to list every table and copy',
					verdict: 'best',
					feedback: 'Systematic, repeatable and auditable. This is why PII tagging and lineage are worth building up front.'
				},
				{
					id: 'C',
					text: 'Search every table for their name and email address',
					verdict: 'ok',
					feedback: 'A useful backstop, but slow and incomplete: pseudonymised keys and derived data will not match a name search.'
				}
			],
			expert: `**Catalogue + PII tags + lineage.** Tags identify which columns hold personal data; lineage shows every downstream table, report and tool fed from them. A name search is a reasonable extra check, not the method. My own GDPR redaction work showed how costly this is when lineage lives in spreadsheets.`
		},
		{
			id: 'archives',
			question: 'How do you handle the immutable Bronze archive in Glacier?',
			options: [
				{
					id: 'A',
					text: 'Restore the archived files, rewrite them without the customer’s rows, re-archive',
					verdict: 'ok',
					feedback: 'It works, but restores take hours and cost money, and every future request repeats the exercise.'
				},
				{
					id: 'B',
					text: 'Crypto-shred: destroy the customer’s key in the identity vault so archived rows become anonymous',
					verdict: 'best',
					feedback: 'No restore needed. Archives only hold surrogate keys, so destroying the identity mapping anonymises them.'
				},
				{
					id: 'C',
					text: 'Leave archives alone: they are offline anyway',
					verdict: 'weak',
					feedback: 'Archived personal data is still personal data. "Offline" is not an exemption.'
				}
			],
			expert: `**Crypto-shredding, by design.** If direct identifiers live only in an identity vault and archives carry surrogate keys, erasure means destroying one record (or key) and the archive becomes anonymous. If the platform wasn't designed that way, restoring and rewriting is the fallback, and that pain is the argument for fixing the design. Note: Glacier objects *can* be deleted directly; the problem is removing rows inside files without rewriting them.`
		},
		{
			id: 'aggregates',
			question: 'What do you do with historical aggregates in Gold (e.g. monthly active customers)?',
			options: [
				{
					id: 'A',
					text: 'Recalculate every historical aggregate without the customer',
					verdict: 'weak',
					feedback:
						'Unnecessary and harmful: anonymous aggregates are not personal data, and changing submitted figures breaks reporting and regulatory history.'
				},
				{
					id: 'B',
					text: 'Leave anonymous aggregates; check small groups cannot re-identify the person',
					verdict: 'best',
					feedback: 'Correct: aggregates stay unless a group is small enough to identify someone.'
				},
				{
					id: 'C',
					text: 'Delete the aggregate rows that included them',
					verdict: 'weak',
					feedback: 'Destroys valid business and regulatory history for no data-protection benefit.'
				}
			],
			expert: `**Leave anonymous aggregates alone**, but check for **small groups** (e.g. a segment of three customers in one postcode), which can re-identify someone and need suppressing. Historic regulatory submissions are never altered; they don't contain personal data once the identity link is gone.`
		}
	],
	concepts: [
		{
			id: 'retention',
			label: 'Legal retention exemption (MLR 2017 / Art. 17(3)(b))',
			patterns: ['\\bmlr\\b', 'money laundering', '\\baml\\b', 'retention', 'retain', 'legal (basis|obligation|hold)', 'exempt', 'kyc'],
			importance: 'essential',
			why: 'Erasure is not absolute. Deleting records you must keep breaches anti-money-laundering rules.'
		},
		{
			id: 'lineage',
			label: 'Find every copy via catalogue, PII tags and lineage',
			patterns: ['lineage', 'catalog', '\\btag', 'find (all|every)', 'data map'],
			importance: 'essential',
			why: 'You cannot erase what you cannot find; asking teams misses caches, logs and derived copies.'
		},
		{
			id: 'archives',
			label: 'Handle immutable archives (crypto-shredding / identity vault)',
			patterns: ['crypto', 'shred', 'identity vault', 'vault', 'pseudonym', 'surrogate', 'tokeni'],
			importance: 'essential',
			why: 'Immutable and archived data needs a design-level answer, not a restore-and-rewrite every time.'
		},
		{
			id: 'evidence',
			label: 'Audit trail and evidence of what was done',
			patterns: ['audit', 'evidence', 'record (of|what)', 'certificate', 'log'],
			importance: 'essential',
			why: 'You must be able to prove to the customer, DPO and ICO what was erased, kept and why.'
		},
		{
			id: 'propagate',
			label: 'Erase at source and propagate downstream',
			patterns: ['system of record', 'source', 'propagat', 'cdc', 'downstream', 'iceberg', 'row[- ]level delete'],
			importance: 'bonus',
			why: 'Deleting at the system of record and propagating keeps every layer consistent.'
		},
		{
			id: 'backups',
			label: 'Backups: do not edit, let them expire, re-apply on restore',
			patterns: ['backup'],
			importance: 'bonus',
			why: 'Backups are a classic gap; the accepted approach is "beyond use" until they age out.'
		},
		{
			id: 'deadline',
			label: 'The one-month deadline and the DPO’s role',
			patterns: ['month', '30 days', 'deadline', '\\bdpo\\b', 'legal team', 'clock'],
			importance: 'bonus',
			why: 'The statutory deadline and legal ownership frame the whole process.'
		},
		{
			id: 'respond',
			label: 'Tell the customer what was kept and why',
			patterns: ['respon', 'inform', 'tell the customer', 'communicat', 'explain to'],
			importance: 'bonus',
			why: 'The customer is entitled to know what was retained, on what basis and until when.'
		},
		{
			id: 'aggregates',
			label: 'Aggregates and small-group re-identification',
			patterns: ['aggregat', 'small group', 're-?identif', 'anonymi'],
			importance: 'bonus',
			why: 'Anonymous aggregates can stay; small groups can still identify someone.'
		}
	],
	watchOutFor: [
		'Promising to "delete everything". It sounds compliant and is wrong for a bank.',
		'Jumping straight to tooling (scripts, Iceberg deletes) before saying how you decide what to keep.',
		'Forgetting the customer: they must be told what was kept, why and until when.',
		'Leaving out backups and logs. Panels ask about them precisely because people forget.'
	],
	sixtySecond:
		'The constraint is that erasure isn\'t absolute: MLR 2017 requires us to keep KYC and transaction records for five years after the relationship ends. So we split the data: erase what has no legal basis, restrict and schedule deletion for what we must keep. We find every copy through PII tags and lineage, delete at source and let CDC carry it downstream, crypto-shred the identity key for archives, and let backups age out. Then we tell the customer what we kept and why. If retention had already expired, we\'d erase everything except the record of the request.',
	defend: [
		{
			question: 'The customer complains that you kept their transaction history.',
			answer:
				'We explain that UK GDPR allows data to be kept where there is a legal obligation, that MLR 2017 requires five years after the relationship ends, that access is restricted to compliance, and the date it will be deleted. They can complain to the ICO, and our records show exactly what we did.'
		},
		{
			question: 'A backup containing their data is restored after an incident. What happens?',
			answer:
				'The erasure register is replayed against anything restored, before the restored system is used. That is why we keep a record of erasure requests (without the personal data itself): so deletions survive restores.'
		},
		{
			question: 'How would you make the next request take hours, not weeks?',
			answer:
				'Automate it: an erasure job driven by PII tags and lineage that produces a plan (delete, restrict, schedule) for the DPO to approve, then executes it and writes the evidence. The first request is slow because you are building the map; after that it should be routine.'
		},
		{
			question: 'Their data appears in Claude/MCP audit logs. What do you do?',
			answer:
				'Redact the personal data in those log entries but keep the entries, because the audit trail is a control. Better still, redact personal data from prompts at the moment they are logged.'
		}
	],
	level3: [
		{
			id: 'restore',
			prompt: 'Three months later, a database backup from before the erasure is restored after an incident. Where does your design break?',
			expert:
				'The backup brings the erased data back. The fix is process plus tooling: we keep an erasure register (request id, the subject\'s surrogate key, what was erased) and the restore runbook replays it before the restored system goes live. Without that register, every restore quietly undoes GDPR erasures.',
			lookFor: ['register|log|record', 'replay|re-?apply|re-?run', 'runbook|process', 'restore']
		},
		{
			id: 'no-vault',
			prompt: 'You discover the archives contain names and emails directly, not surrogate keys. Crypto-shredding won\'t work. What now?',
			expert:
				'Then we have to restore and rewrite the affected files, which is slow and costly, so we prioritise: do it within the deadline for this request, and tell the DPO we may need the extension if the volume is large. In parallel, fix the design so it doesn\'t happen again: move identifiers into an identity vault and keep only surrogate keys in Bronze. This request becomes the business case.',
			lookFor: ['restore', 'rewrite', 'extension|deadline|month', 'vault|surrogate|design']
		},
		{
			id: 'small-group',
			prompt: 'A Gold report shows customers by postcode district, and this customer was one of only two in theirs. Does that matter?',
			expert:
				'Yes. A group of two is small enough to identify someone, so the aggregate is effectively personal data. We suppress or merge small groups (a minimum group size, say ten) in reports and in the MCP layer, and apply that rule generally, not just for this request.',
			lookFor: ['small group|re-?identif|identify', 'suppress|merge|minimum|threshold', 'mcp|report|general']
		}
	],
	relatedSets: [
		{ id: 'governance', label: 'Masking, quarantine & redaction' },
		{ id: 'bronze', label: 'Bronze' }
	]
};
