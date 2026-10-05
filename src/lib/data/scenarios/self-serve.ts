import type { ArchitectureScenario } from '../scenarios.ts';

export const selfServe: ArchitectureScenario = {
	id: 'self-serve',
	title: 'Self-serve data access (semantic layer + MCP)',
	summary: 'Analysts and data scientists queue for hand-written SQL. Make access self-serve, safely.',
	leadExplanation: {
		constraint:
			'The constraint is that this is customer data in a regulated bank: self-serve has to be governed, or it becomes a data-protection incident waiting to happen.',
		reasons: [
			'Most requests repeat the same handful of questions, so certifying those metrics once removes most of the queue.',
			'If SQL users and Claude read the same definitions, they get the same answers, which is what builds trust.',
			'Security enforced in the platform (row-level security, masking, audit) scales; security that relies on people being careful does not.'
		],
		tradeOff:
			'It is slower to start than giving people database access: we have to define and certify metrics first, and some ad-hoc questions will still need the data team.',
		switchWhen:
			'If demand turned out to be mostly exploratory rather than repeated questions, I would invest more in governed sandboxes for SQL users and less in the MCP layer.'
	},
	leadSays: {
		first:
			'The queue is mostly the same questions asked again. So the first step is to find the top recurring requests and certify those datasets and metrics. It means not building the MCP server first, but it targets the work that is actually clogging the team.',
		interface:
			'People ask in two ways: analysts write SQL, others want to ask in plain English. So we offer both, over the same certified definitions. The trade-off is two front doors to secure, but one set of definitions means one answer.',
		protect:
			"The requirement is that sensitive data stays protected even when someone makes a mistake. So row-level security, masking and PII tags are enforced in the warehouse and again in the MCP layer, not left to training. It's more set-up, but it doesn't depend on everyone being careful.",
		mcp: "Claude should only be able to ask questions we can answer safely. So the MCP server exposes a small set of typed metric tools, acts as the signed-in user, and logs every call. Free-form SQL would be more flexible, and that's exactly the risk."
	},
	leadPhrases: [
		'"The constraint is that this is regulated customer data, so self-serve has to be governed."',
		'"Most of the queue is the same ten questions. We certify those first."',
		'"One set of definitions, two front doors: SQL and Claude."',
		'"Security lives in the platform, not in people being careful."',
		'"We\'ll measure success as tickets that never needed raising."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll democratise data so everyone can self-serve."',
			problem: 'Sounds empowering, but says nothing about which data, for whom, or how it stays safe. In a bank, unscoped self-serve is a breach risk.'
		},
		{
			sounds: '"We\'ll just put Claude on top of the warehouse."',
			problem: 'Hides every hard question: which tables, whose permissions, what gets logged, and how answers stay consistent with dashboards.'
		}
	],
	watchOutFor: [
		'Starting with the MCP server because it is the exciting part. The bottleneck is undefined metrics, not the lack of a chat interface.',
		'Treating "self-serve" as "give everyone database access". Say what is certified, what is sandboxed and what is off limits.',
		'Saying "row-level security" without saying whose identity it uses. For Claude, that means passing the user\'s identity through.',
		'Forgetting to say how you will know it worked: fewer tickets, faster answers, usage of certified metrics.'
	],
	sixtySecond:
		"The constraint is that this is regulated customer data, so self-serve has to be governed. Most requests repeat, so we certify the top recurring metrics in a semantic layer first. Analysts query them with SQL through Redshift with their own identity; everyone else can ask Claude through an MCP server that exposes typed metric tools. Both read the same definitions, with row-level security, masking and audit enforced in the platform. The trade-off is a slower start than handing out access. If demand were mostly exploratory, I'd lean more on governed sandboxes.",
	defend: [
		{
			question: 'Why not just give analysts read access to Silver?',
			answer:
				'Because Silver holds row-level customer data with PII, and definitions would be re-implemented in every query. We give governed access to certified Gold and semantic metrics, plus a sandbox for exploration, with PII masked by default.'
		},
		{
			question: 'What stops Claude leaking personal data?',
			answer:
				"Claude never gets raw tables: only metric tools with approved dimensions, minimum group sizes and the user's own permissions. Every call is audited, and PII-tagged dimensions are blocked for AI by policy."
		},
		{
			question: 'How do you know it worked?',
			answer:
				'Fewer ad-hoc tickets to the data team, time-to-answer, and usage of certified metrics versus sandbox queries. The MCP audit log also shows which questions people ask that we cannot answer yet, which becomes the backlog.'
		}
	],
	context: `Data scientists and business analysts constantly ask the data team for "customers who…" queries. Each one is hand-written SQL by an engineer: **slow, inconsistent between engineers, and not scalable**. The JD asks for **a semantic layer over the data, exposed to Claude via MCP**.

Constraints:
- Data includes **personal and financial information** (UK GDPR, FCA).
- Power BI is the existing BI tool and isn't going away.
- The team is small: whatever you build, they have to run.`,
	businessContext:
		'Self-serve frees the data team for platform work and gets answers to the business faster, but ungoverned access to customer data in a bank is a serious risk. The panel wants to see both ambition and control.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'What is actually clogging the queue?',
		'How will different users ask questions (SQL, plain English)?',
		'How do you keep sensitive data safe without slowing everyone down?',
		'Where does the MCP server fit, and what can it see?'
	],
	level1Expert: `**Certify the repeat questions, then open two governed front doors.**

- **Find the top recurring requests** (the ticket history tells you) and certify those metrics and datasets in a **semantic layer** over Gold, with owners and definitions.
- **SQL users**: Redshift Query Editor or Athena with their own identity, **row-level security and masking**, certified datasets plus a sandbox per team.
- **Plain-English users**: Claude via an **MCP server** exposing typed metric tools (\`list_metrics\`, \`get_metric\`), acting as the signed-in user, every call **audited**.
- **One set of definitions** behind both, so the dashboard, the SQL query and Claude agree.
- **Measure success** as tickets avoided and time-to-answer; use the MCP audit log to see which questions we can't answer yet.`,
	level2: [
		{
			id: 'first',
			question: 'What do you build first?',
			options: [
				{ id: 'A', text: 'The MCP server, so people can ask Claude', verdict: 'ok', feedback: 'Visible and exciting, but without certified metrics underneath, Claude will give inconsistent answers.' },
				{
					id: 'B',
					text: 'Certify the top recurring requests as semantic-layer metrics',
					verdict: 'best',
					feedback: 'Targets the actual bottleneck (repeated, undefined questions) and gives both SQL and Claude something trustworthy to read.'
				},
				{ id: 'C', text: 'Give analysts read access to the Silver tables', verdict: 'weak', feedback: 'Fast, but exposes row-level PII and leaves every analyst to re-implement definitions.' }
			],
			expert: `**Certify the repeat questions first.** Ticket history usually shows that a small number of questions make up most requests. Defining those once, with owners, removes most of the queue and gives the MCP server something safe to expose.`
		},
		{
			id: 'interface',
			question: 'How do users query it?',
			options: [
				{ id: 'A', text: 'SQL only', verdict: 'ok', feedback: 'Serves analysts well, but leaves non-technical users still raising tickets.' },
				{ id: 'B', text: 'Natural language only, through Claude', verdict: 'weak', feedback: 'Analysts need SQL for exploration, and some questions are better answered precisely in SQL.' },
				{ id: 'C', text: 'Both, over the same certified definitions', verdict: 'best', feedback: 'Each user gets the interface that suits them, and answers stay consistent because definitions are shared.' }
			],
			expert: `**Both, over shared definitions.** The front doors differ; the definitions must not. If Claude and a SQL query disagree on "active customers", trust in both disappears.`
		},
		{
			id: 'protect',
			question: 'How do you stop people seeing sensitive data they should not?',
			options: [
				{ id: 'A', text: 'Training and an acceptable-use policy', verdict: 'weak', feedback: 'Necessary but not sufficient: a policy does not stop a mistaken query.' },
				{
					id: 'B',
					text: 'Row-level security, masking and PII tags enforced in the warehouse and the MCP layer',
					verdict: 'best',
					feedback: 'Controls that work even when someone makes a mistake, and are auditable.'
				},
				{ id: 'C', text: 'A separate PII-free copy of the data for each team', verdict: 'ok', feedback: 'Safe, but copies multiply, drift and cost more to maintain.' }
			],
			expert: `**Enforce it in the platform.** PII tags drive masking and access in Lake Formation and Redshift; the MCP server adds AI-specific policy (no PII dimensions, minimum group sizes). Training still matters, but it's the second line, not the first.`
		},
		{
			id: 'mcp',
			question: 'How does the MCP server fit in?',
			options: [
				{ id: 'A', text: 'MCP server that lets Claude run free-form SQL', verdict: 'weak', feedback: 'Maximum flexibility and maximum risk: no control over what is joined or exposed.' },
				{
					id: 'B',
					text: 'MCP server exposing typed metric tools, with identity pass-through and audit',
					verdict: 'best',
					feedback: 'Claude can only ask questions the semantic layer can answer, with the user\'s permissions, and everything is logged.'
				},
				{ id: 'C', text: 'No MCP: export CSVs that people paste into Claude', verdict: 'weak', feedback: 'Uncontrolled copies of data outside the platform, with no audit trail.' }
			],
			expert: `**Typed tools, identity pass-through, full audit.** A small surface (list, describe and get metrics) is easier to secure and test. Start read-only with a pilot group, review the audit log with them, then widen.`
		}
	],
	level3: [
		{
			id: 'reidentify',
			prompt: 'An analyst asks Claude for "average balance by postcode and age band" and gets groups of two or three customers. Where does your design break?',
			expert:
				"That's re-identification through slicing: small groups effectively expose individuals. The MCP layer enforces a minimum group size, say ten, and suppresses or merges smaller groups, and we apply the same rule to certified datasets. Postcode is tagged as an indirect identifier, so its granularity is limited for AI by policy.",
			lookFor: ['small group|re-?identif|identify', 'minimum|threshold|suppress|merge', 'postcode|indirect|tag|policy']
		},
		{
			id: 'disagree',
			prompt: 'Finance says Claude gave a different "active customers" number from the board dashboard. What happened and what do you do?',
			expert:
				"Either Claude used a different metric or the dashboard has its own DAX version. Both should read the certified definition, so we check which one diverged, fix it, and add a test that compares the two. If the dashboard has a local re-implementation, we treat that as a defect and move it onto the semantic layer.",
			lookFor: ['definition|certified|semantic', 'dax|dashboard|local', 'test|compare|check']
		},
		{
			id: 'adoption',
			prompt: "Three months in, analysts are still raising tickets instead of self-serving. Why might that be, and what do you do?",
			expert:
				'Usually the certified set does not cover what they need, or they do not trust it yet. I would read the tickets and the MCP audit log to find the gaps, certify the next most common questions, and sit with a couple of analysts to see where they get stuck. Adoption is a product problem as much as a technical one.',
			lookFor: ['ticket|audit log|usage', 'gap|cover|missing', 'trust|train|sit with|talk|feedback', 'product|adoption']
		}
	],
	concepts: [
		{ id: 'repeat', label: 'Start from the recurring requests', patterns: ['recurring|repeat|common|top \\d+|most (requests|questions)|ticket'], importance: 'essential', why: 'The queue is mostly repeated questions; certifying them removes most of the work.' },
		{ id: 'semantic', label: 'A semantic layer with certified definitions', patterns: ['semantic', 'certif', 'metric', 'definition'], importance: 'essential', why: 'Without shared definitions, self-serve produces inconsistent numbers.' },
		{ id: 'security', label: 'Row-level security and masking enforced in the platform', patterns: ['row[- ]level|\\brls\\b', 'mask', 'pii', 'permission|access control|least privilege'], importance: 'essential', why: 'In a bank, self-serve without enforced controls is a breach risk.' },
		{ id: 'mcp', label: 'MCP with constrained tools, not free-form SQL', patterns: ['\\bmcp\\b', 'tool', 'claude'], importance: 'essential', why: 'The JD asks for MCP; the senior point is constraining what Claude can ask.' },
		{ id: 'audit', label: 'Audit every query', patterns: ['audit', 'log'], importance: 'essential', why: 'Access to customer data must be traceable, especially AI access.' },
		{ id: 'both', label: 'SQL and natural language over the same definitions', patterns: ['both', 'same definition', 'consistent', 'sql.{0,40}(claude|natural)|(claude|natural).{0,40}sql'], importance: 'bonus', why: 'Different users need different interfaces; definitions must be shared.' },
		{ id: 'identity', label: "Use the caller's own identity", patterns: ['identity|on behalf|pass[- ]?through|sso|their own'], importance: 'bonus', why: 'Otherwise Claude sees more than the person asking could.' },
		{ id: 'measure', label: 'Measure success (tickets avoided, time to answer)', patterns: ['measure|metric of success|tickets? (avoided|reduced|fewer)|time[- ]to[- ]answer|adoption|usage'], importance: 'bonus', why: 'Without a measure, you cannot show the investment worked.' }
	],
	juniorVsLead: {
		junior: "We'd build an MCP server so people can ask Claude anything about the data, which democratises data and makes everyone self-serve.",
		lead: "The constraint is that this is regulated customer data, so self-serve has to be governed. Most of the queue is the same questions, so I'd certify those metrics first, then open two front doors over them: SQL with each analyst's own permissions, and Claude through MCP tools that act as the user and log every call. The trade-off is a slower start than handing out access.",
		whyBetter: [
			'Starts from the constraint (regulated data), not the exciting tool',
			'Explains why certifying metrics comes first',
			'Replaces "democratise" with who gets what, safely',
			'Names the trade-off'
		]
	},
	relatedSets: [
		{ id: 'semantic', label: 'Semantic' },
		{ id: 'apis', label: 'Consumers' }
	]
};
