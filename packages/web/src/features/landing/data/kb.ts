/**
 * Knowledge-base content for the landing page + /explore route.
 * Single source of truth — both PersonaShowcase (landing) and Explore (deep)
 * consume from here. Voice: bold founder, opinionated, specific.
 */

export type PersonaKey = 'hospital' | 'vendor' | 'lab' | 'provider' | 'super-vendor' | 'admin';

export interface Persona {
  key: PersonaKey;
  name: string;
  tagline: string;
  verb: string;
  icon: string;
  accent: string;
  pitch: string;
  problem: string;
  solution: string;
  portal: {
    headline: string;
    sidebar: string[];
    primaryActions: string[];
  };
  capabilities: string[];
  cannotDo: string[];
  wins: { metric: string; label: string }[];
  topFeatures: string[];
  dbRoles: string[];
}

export const PERSONAS: Persona[] = [
  {
    key: 'hospital',
    name: 'Hospital',
    tagline: 'The buyer side of every transaction.',
    verb: 'Order & Govern',
    icon: '🏥',
    accent: '#1BAEE5',
    pitch: 'Stop running procurement out of email and spreadsheets. Hospitals on Curavend put every requisition, PO, receipt, invoice, and contract on one rail — with the approval chain and the audit trail attached.',
    problem: 'Materials managers juggle 14+ vendor portals, miss contract prices on 8% of spend, and chase three-way-match exceptions by hand. Department leads have no idea what their facility actually paid last quarter.',
    solution: 'One workspace. Requisition → approval → PO → receipt → invoice → 3-way match → posted GL. Contract prices auto-applied. Match exceptions surfaced, not buried. Eleven spend reports that respect your facility scope.',
    portal: {
      headline: 'Buy smart. Receive what you ordered. Pay what you contracted.',
      sidebar: [
        'Dashboard',
        'Orders',
        'Approvals',
        'Prior Auths',
        'Procurement ▾',
        '  Requisitions',
        '  Templates',
        '  Goods Receipts',
        '  Match Exceptions',
        'Invoices',
        'Contracts & Pricing',
        'Customer POs',
        'Recurring Orders',
        'Catalog',
        'Price Lookup',
        'My Vendors',
        'Vendor Coverage',
        'Facilities · Departments · Physicians',
        'Reporting (11 reports)',
        'Chat',
      ],
      primaryActions: [
        'Submit a requisition',
        'Approve a PO',
        'Record a goods receipt',
        'Resolve a match exception',
        'Run a multi-site spend report',
      ],
    },
    capabilities: [
      'Create, submit, approve, cancel requisitions across every facility you own',
      'Approve POs up to your configured dollar threshold',
      'Record goods receipts and disputes',
      'Manage facility-level formularies with substitute logic',
      'Sign contracts with approved vendors',
      'Layer GPO membership on top of bilateral contracts',
      'View all 11 reports; export to CSV/XLSX',
    ],
    cannotDo: [
      'Edit a vendor’s catalog (vendor owns SKUs + prices)',
      'See other hospitals’ orders, invoices, or contracts',
      'Create GPO contracts (admin-only)',
      'Approve PAs on the payor’s behalf',
      'Edit the global Item Master',
    ],
    wins: [
      { metric: '−8.4%', label: 'contract-leakage spend in Q1' },
      { metric: '4.2×', label: 'faster requisition-to-PO cycle' },
      { metric: '94%', label: 'auto-matched invoices (no human touch)' },
    ],
    topFeatures: [
      'Dashboard',
      'Orders',
      'Requisitions',
      'Approvals',
      'Goods Receipts',
      '3-Way Match',
      'Contracts & Pricing',
      'Multi-Site Spend',
      'Contract Leakage',
      'Hospital Budgets',
    ],
    dbRoles: ['FACILITY_ACCOUNT_MANAGER', 'FACILITY_USER'],
  },
  {
    key: 'vendor',
    name: 'Vendor',
    tagline: 'The fulfillment side of every transaction.',
    verb: 'Fulfill & Ship',
    icon: '🏭',
    accent: '#22C55E',
    pitch: 'Stop fielding hospital phone calls about "where’s my order." Vendors on Curavend get routed orders with patient/site/HCPC pre-populated, push tracking once, and watch their on-time score climb.',
    problem: 'Vendors operate from email inboxes, fax machines, and one-off portals built by every health system they serve. Tracking gets entered three times in three systems. Returns become arguments.',
    solution: 'Routed orders land in one queue with everything pre-attached. Confirm, ship, upload tracking once — the hospital sees it instantly. ERP push, stock snapshots, scorecard transparency, RMA workflow.',
    portal: {
      headline: 'Win the routing. Ship clean. Get paid faster.',
      sidebar: [
        'Dashboard',
        'Inbound Orders',
        'Fulfillment Queue',
        'Tracking & Shipments',
        'My Hospitals',
        'SKU Catalog',
        'Stock Connectors',
        'ERP Connectors',
        'Vendor Locations',
        'Contracts',
        'RMAs',
        'Scorecard',
        'Chat',
        'Reporting',
      ],
      primaryActions: [
        'Confirm a routed order',
        'Upload tracking',
        'Update stock via connector',
        'Process an RMA',
        'View your scorecard',
      ],
    },
    capabilities: [
      'Receive routed orders from any hospital that approved you',
      'Confirm fulfillment + upload shipment tracking (one of: HTTP_POST, WEBHOOK_POST, EDI 850 stub, MANUAL)',
      'Sync inventory via stock connectors and ERP push',
      'Manage your SKU catalog and pricing tiers',
      'Process RMAs end-to-end',
      'View your real-time scorecard (on-time, fill rate, defect rate, response time)',
    ],
    cannotDo: [
      'See orders that weren’t routed to you',
      'See other vendors’ pricing or scorecards',
      'Change hospital approval rules',
      'Issue PAs (payor function)',
    ],
    wins: [
      { metric: '−61%', label: 'phone calls about order status' },
      { metric: '+18pp', label: 'on-time delivery score' },
      { metric: '3 days', label: 'average DSO reduction' },
    ],
    topFeatures: [
      'Inbound Orders',
      'Fulfillment Queue',
      'Tracking & Shipments',
      'Stock Connectors',
      'ERP Connectors',
      'Vendor Scorecard',
      'RMA Workflow',
      'SKU Catalog',
    ],
    dbRoles: ['VENDOR_ACCOUNT_MANAGER', 'VENDOR_USER'],
  },
  {
    key: 'lab',
    name: 'Lab',
    tagline: 'The kit + consumable + result side.',
    verb: 'Process & Replenish',
    icon: '🧪',
    accent: '#A855F7',
    pitch: 'Stop running labs on whiteboards. Curavend tracks consumables at lot level, auto-consumes on every accessioned order, fires replenishment before you stock out, and ships the asset PDF (kit letter + TRF) the moment an order lands.',
    problem: 'Lab managers reconcile consumable counts at 7am, miss a reorder, and find out at 3pm when the bench is dry. Kit letters get re-typed. TRFs get re-signed. Test-consumable maps live in someone’s head.',
    solution: 'Accession an order → auto-consume the right consumables (FEFO, lot-level) → asset workflow generates kit letter + TRF PDF → auto-replenishment cron fires before reorder point → backorders surface, not silent.',
    portal: {
      headline: 'Accession. Auto-consume. Auto-replenish. Done.',
      sidebar: [
        'Lab Dashboard',
        'Lab Orders',
        'Create Lab Order',
        'Lab Inventory',
        'Lab Kit Sites',
        'Lab Groups',
        'Test → Consumable Map',
        'Backorders',
        'Lab Audit Log',
        'Chat',
        'Reporting',
      ],
      primaryActions: [
        'Create a lab order',
        'Receive a lab shipment',
        'Run consumable forecast',
        'Audit a stock movement',
        'Configure test-consumable map',
      ],
    },
    capabilities: [
      'Create lab orders scoped to your lab group',
      'Auto-generate kit letter + TRF PDF via Browser Rendering workflow',
      'Track consumable inventory at lot level (FEFO consumption)',
      'Configure test → consumable recipes',
      'Auto-replenishment cron + backorder triage',
      'Lab-only audit log scoped to your lab group',
    ],
    cannotDo: [
      'See orders from other lab groups',
      'See hospital procurement workflows',
      'Edit cross-lab compliance rules',
    ],
    wins: [
      { metric: '0', label: 'stock-outs in 90 days (auto-replen)' },
      { metric: '−47%', label: 'consumable waste from expiry' },
      { metric: '11s', label: 'kit-letter generation time' },
    ],
    topFeatures: [
      'Lab Orders',
      'Lab Inventory',
      'Lab Auto-Consumption',
      'Lab Forecasting',
      'Backorders',
      'Test → Consumable Map',
      'Lab Audit Log',
    ],
    dbRoles: ['LAB_ADMIN', 'LAB_USER'],
  },
  {
    key: 'provider',
    name: 'Provider',
    tagline: 'The clinical + referral side.',
    verb: 'Refer & Authorize',
    icon: '👨‍⚕️',
    accent: '#F59E0B',
    pitch: 'Stop bouncing between Epic, payor portals, and DME vendor faxes. Providers on Curavend create the encounter, submit the PA, attach the DWO and doc packet, and watch the PA decision return to one inbox.',
    problem: 'Prior auths take 9 days because someone keys the same data into three systems and waits. DME doc packets get assembled by hand. LCD coverage rules live in PDFs no one reads.',
    solution: 'Pull patient context from Epic via FHIR. Create the encounter. LCD check runs automatically. DME wizard assembles the doc packet. PA submits to clearinghouse (or stub). DWO signed in-app. Claim bundle generated.',
    portal: {
      headline: 'One encounter. One submission. One decision inbox.',
      sidebar: [
        'Dashboard',
        'My Encounters',
        'Patients (FHIR)',
        'Create DME Order',
        'Prior Auths',
        'DME Documents',
        'LCD Coverage Checker',
        'DWO Signatures',
        'Reporting (Provider scope)',
        'Chat',
      ],
      primaryActions: [
        'Create a DME order end-to-end',
        'Submit a prior authorization',
        'Sign a DWO',
        'Upload doc packet',
        'Generate claim bundle',
      ],
    },
    capabilities: [
      'Pull patient demographics + diagnoses from Epic (FHIR)',
      'Create clinical encounters tied to orders',
      'Initiate and track prior authorizations',
      'Generate DME document packet + DWO PDF',
      'Run LCD coverage check against the CMS rule set',
      'View order/encounter history scoped to your provider network',
    ],
    cannotDo: [
      'See orders outside your provider network',
      'Edit hospital approval rules',
      'Approve PAs (payor function)',
    ],
    wins: [
      { metric: '9 → 1.5d', label: 'average PA turnaround' },
      { metric: '92%', label: 'first-pass PA approval rate' },
      { metric: '0', label: 'doc packets assembled by hand' },
    ],
    topFeatures: [
      'DME Order Wizard',
      'DME Document Packet',
      'LCD Coverage Checker',
      'CMS PA-Required List',
      'DWO + Claim Bundle',
      'EHR Connections (Epic FHIR)',
      'Prior Auths',
    ],
    dbRoles: ['PROVIDER_EXECUTIVE_ADMIN', 'PROVIDER_USER'],
  },
  {
    key: 'super-vendor',
    name: 'Super-Vendor',
    tagline: 'The network of vendors view.',
    verb: 'Aggregate & Report',
    icon: '🔗',
    accent: '#EC4899',
    pitch: 'You manage 12 vendor brands under one parent. Curavend gives you the consolidated dashboard you’ve been faking in Excel — cross-vendor performance, network-wide spend, every scorecard rolled up.',
    problem: 'A super-vendor running 12 brands has 12 dashboards and 12 scorecards and 12 invoice runs. The "network view" is whoever opened all the tabs at the same time.',
    solution: 'One parent record links child vendors. Network-wide scorecards aggregate. Cross-vendor reporting consolidates. Permissions cascade. Sub-vendor onboarding becomes a 3-click operation.',
    portal: {
      headline: 'See every vendor brand from one room.',
      sidebar: [
        'Network Dashboard',
        'Child Vendors',
        'Network Scorecard',
        'Consolidated Orders',
        'Network Contracts',
        'Network Reporting',
        'Vendor Onboarding',
        'Chat',
      ],
      primaryActions: [
        'Onboard a child vendor',
        'Roll up the network scorecard',
        'Run consolidated reporting',
        'Compare brand performance',
      ],
    },
    capabilities: [
      'Manage a network of child vendors under one parent record',
      'Consolidated reporting across all child vendors',
      'Aggregate scorecards (network-level rollup)',
      'Cross-vendor permissions cascade',
      'Onboard sub-vendors in 3 clicks',
    ],
    cannotDo: [
      'See vendors outside your network',
      'Edit hospital-side approval rules',
    ],
    wins: [
      { metric: '1', label: 'dashboard instead of 12' },
      { metric: '−73%', label: 'time spent assembling network reports' },
    ],
    topFeatures: [
      'Network Dashboard',
      'Network Scorecard',
      'Consolidated Reporting',
      'Cross-Vendor Permissions',
      'Sub-Vendor Onboarding',
    ],
    dbRoles: ['SUPER_VENDOR'],
  },
  {
    key: 'admin',
    name: 'Admin',
    tagline: 'The platform governance layer.',
    verb: 'Govern & Configure',
    icon: '⚙️',
    accent: '#64748B',
    pitch: 'Platform admins set the rails. Curavend gives you every lever — users, groups, permissions, EHR connections, formulary, OIG screening, workflow control, integration logs — without writing tickets to a vendor.',
    problem: 'Every health system buys a "platform" and discovers the admin panel is read-only support fields. Want to change an approval rule? File a ticket. Want to see the workflow stuck? Read the docs.',
    solution: 'Every governance lever is in the admin panel: users, groups, permissions, formulary, EHR connections, workflow control plane, OIG/LEIE screening, integration log, file-access log, GPO contracts, payors, EHR connections, DMEPOS compliance.',
    portal: {
      headline: 'Run the platform like you own it. Because you do.',
      sidebar: [
        'Admin Dashboard',
        'Manage Vendors',
        'Manage Hospitals',
        'Onboard Provider Network',
        'Onboard Lab Group',
        'Facility–Vendor Links',
        'User Approvals',
        'File Access Log',
        'Integration Log',
        'Workflows',
        'GPO Contracts',
        'Payors',
        'EHR Connections',
        'Formulary',
        'DMEPOS Compliance',
        'LCD Ingest',
        'Lab Backfill',
        'Budgets',
        'Reporting (all)',
      ],
      primaryActions: [
        'Onboard a vendor / hospital / provider / lab',
        'Grant user permissions',
        'Configure EHR connection',
        'Manage GPO contract',
        'Terminate a stuck workflow',
        'Run OIG/LEIE screening',
      ],
    },
    capabilities: [
      'Onboard every persona (Hospital, Vendor, Provider, Lab, Super-Vendor)',
      'Approve / decline user signups',
      'Manage 23 PERMISSION_RESOURCES × 4 PERMISSION_LEVELS',
      'Configure Epic FHIR EHR connections per provider',
      'Edit the global Item Master + GPO contracts + formulary',
      'Manage payors, eligibility providers, PA clearinghouses',
      'Workflow control plane: terminate, raise-event, purge',
      'OIG LEIE monthly refresh + per-user screening',
      'Integration log: PENDING → SUCCESS / RETRYING / DEAD_LETTER',
      'File access log + PHI access log (HIPAA audit)',
    ],
    cannotDo: [
      'Bypass tenant scoping for read paths (PHI is logged + audited)',
    ],
    wins: [
      { metric: '0', label: 'support tickets to change rules' },
      { metric: '23', label: 'permission resources at your fingertips' },
      { metric: '100%', label: 'PHI access auditable' },
    ],
    topFeatures: [
      'User Management',
      'Permissions & Groups',
      'EHR Connections',
      'Workflows Admin',
      'GPO Contracts',
      'Formulary',
      'DMEPOS Compliance',
      'Integration Log',
      'File Access Log',
      'OIG Screening',
    ],
    dbRoles: ['ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'],
  },
];

// ─── Industry gaps — Act 1 of the explore narrative ─────────────────────────

export interface IndustryGap {
  id: string;
  headline: string;
  stat: string;
  body: string;
  curavendAnswer: string;
}

export const INDUSTRY_GAPS: IndustryGap[] = [
  {
    id: 'fragmented-procurement',
    headline: 'Hospitals procure from 14+ vendor portals.',
    stat: '14+',
    body: 'A 400-bed hospital averages fourteen different vendor logins, three EDI feeds, two GPO portals, and a fax line. Materials managers spend 31% of their week reconciling what was ordered with what arrived with what was invoiced.',
    curavendAnswer: 'One requisition rail. Every vendor, every facility, one approval chain, one match engine. The 14 portals collapse into one.',
  },
  {
    id: 'contract-leakage',
    headline: 'Hospitals leak 8% of supply spend to contract leakage.',
    stat: '8.4%',
    body: 'You signed a contract at $112/unit. You paid $128 on 11% of lines because nobody runs the leakage report — and the report doesn’t exist in your EHR-bolted-on procurement module.',
    curavendAnswer: 'Live contract leakage report on every dashboard. Every line above your best-available rate, surfaced in real time. Variance auto-flagged on the 3-way match.',
  },
  {
    id: 'prior-auth-chaos',
    headline: 'Prior auths take 9 days when they should take 9 minutes.',
    stat: '9 days',
    body: 'A DME prior auth on average takes 9 days from order entry to payor decision. Why? Because the same patient data gets re-keyed into Epic, the payor portal, and the vendor’s form. LCD coverage rules live in PDFs.',
    curavendAnswer: 'Encounter pulls from Epic. LCD check runs automatically. DME wizard assembles the doc packet. PA submits via clearinghouse. Decision returns to one inbox. 9 days → 1.5 days.',
  },
  {
    id: 'lab-stockouts',
    headline: 'Labs reconcile consumables on whiteboards.',
    stat: '$220k',
    body: 'A mid-sized molecular lab loses $220k/year to consumable waste — half expired in the bin, half emergency-shipped at 3× cost because the morning whiteboard missed a reorder.',
    curavendAnswer: 'Auto-consumption on every accessioned order (FEFO, lot-level). Auto-replenishment cron fires before reorder point. Backorders surfaced, not silent.',
  },
  {
    id: 'manual-doc-packets',
    headline: 'DME doc packets are assembled by hand.',
    stat: '23 docs',
    body: 'A single DME claim packet averages 23 separate documents — DWO, LMN, CMN, face-to-face, delivery ticket, proof of delivery, photos, eligibility verification. They get printed, signed, scanned, faxed, lost.',
    curavendAnswer: 'DME wizard assembles the packet from order metadata + EHR pull + signed DWO + uploaded POD. Generates a single claim bundle PDF. Zero faxes.',
  },
  {
    id: 'no-vendor-routing',
    headline: 'There is no intelligence in vendor routing.',
    stat: '0',
    body: 'When a hospital orders a CPAP, the system that picks the vendor is — a clerk. Or an Excel sheet. Or a "preferred" list that hasn’t been updated since 2019. Geography, capability, stock-snapshot freshness, and contracted price are not considered.',
    curavendAnswer: 'Vendor routing scores every vendor on preferred status × geography × capability × ranked price × stock snapshot freshness. Returns the right vendor and a split-required flag when none fits.',
  },
  {
    id: 'opaque-pricing',
    headline: 'Hospital pricing is a 4-layer onion no one can peel.',
    stat: '4 tiers',
    body: 'Bilateral contracts, GPO contracts, hospital fee schedules, Medicare allowables, "list" prices. Which one applies for this SKU at this facility on this date? Nobody actually knows. You pay the invoice and hope.',
    curavendAnswer: 'CONTRACT → GPO_CONTRACT → FEE_SCHEDULE → MEDICARE → MANUAL. First match wins. Source surfaced on every line. The 4-layer onion becomes a one-line answer.',
  },
  {
    id: 'compliance-as-pdf',
    headline: 'HIPAA + OIG + DMEPOS compliance lives in PDFs.',
    stat: '0',
    body: 'Most procurement platforms treat compliance as the customer’s problem. PHI access logs? Nope. OIG/LEIE screening? Quarterly manual. DMEPOS expiration tracking? A reminder in someone’s calendar.',
    curavendAnswer: 'Every PHI read written to phi_access_log. OIG LEIE refreshed monthly from CMS. DMEPOS expiration dashboard, compliance sweep cron, file access log, OWASP P0-P2 hardened.',
  },
];

// ─── Workflows in motion — Act 4 lanes ─────────────────────────────────────

export interface WorkflowLane {
  id: string;
  title: string;
  persona: PersonaKey[];
  beats: string[];
}

export const WORKFLOW_LANES: WorkflowLane[] = [
  {
    id: 'requisition-to-po',
    title: 'Requisition → Approval → PO → Receipt → 3-Way Match',
    persona: ['hospital', 'vendor'],
    beats: ['Submit requisition', 'Approval routing engine fires', 'Approver acts', 'PO generated + transmitted (HTTP_POST / WEBHOOK / EDI 850 / MANUAL)', 'Vendor confirms', 'Shipment + tracking', 'Goods receipt at dock', 'Invoice arrives', '3-way match auto-runs', 'Match exception or posted GL'],
  },
  {
    id: 'dme-end-to-end',
    title: 'DME order → LCD check → PA → DWO → Claim bundle',
    persona: ['provider', 'hospital'],
    beats: ['Create DME order (Epic pull)', 'LCD coverage check (CMS rule set)', 'CMS PA-required check', 'Doc packet assembled', 'PA submitted (clearinghouse or stub)', 'PA decision returns', 'DWO signed in-app', 'POD uploaded', 'Claim bundle PDF generated'],
  },
  {
    id: 'lab-order-flow',
    title: 'Lab order → Asset gen → Auto-consume → Auto-replen',
    persona: ['lab', 'provider'],
    beats: ['Create lab order', 'Asset-gen workflow (Browser Rendering)', 'Kit letter + TRF PDF', 'Accession at lab', 'Auto-consume consumables (FEFO, lot-level)', 'Inventory deducted', 'Auto-replenishment cron checks reorder point', 'Backorder triage if vendor stocks out'],
  },
  {
    id: 'vendor-routing',
    title: 'Vendor routing → Confirmation → Tracking → ERP push',
    persona: ['hospital', 'vendor'],
    beats: ['Order entered', 'Vendor routing: preferred → geography → capability → rank', 'Stock snapshot freshness penalty applied', 'Top vendor + split-required flag returned', 'Vendor confirms via inbox', 'Tracking uploaded', 'ERP push (HTTP / WEBHOOK / EDI / MANUAL)', 'Status mirrored back to hospital'],
  },
  {
    id: 'contract-leakage',
    title: 'Live contract leakage detection',
    persona: ['hospital', 'admin'],
    beats: ['Invoice line lands', '4-tier price resolver runs (CONTRACT → GPO → FEE → MEDICARE)', 'Best-available rate computed', 'Variance flagged', 'Leakage dashboard updates', 'Match exception raised if over threshold'],
  },
  {
    id: 'compliance-sweep',
    title: 'Compliance sweep (OIG · DMEPOS · PHI)',
    persona: ['admin'],
    beats: ['OIG LEIE monthly refresh (CMS truncate+reload)', 'Per-user screening on every login', 'DMEPOS expiration sweep daily', 'PHI access log written on every PHI read', 'File access log on every R2 download', 'Compliance dashboard refreshes'],
  },
];

// ─── Pillars — Act 5 closing proof ─────────────────────────────────────────

export interface Pillar {
  id: string;
  title: string;
  detail: string;
  emoji: string;
}

export const PILLARS: Pillar[] = [
  {
    id: 'security',
    title: 'HIPAA + OWASP P0–P2 hardened',
    detail: 'Every PHI read logged. JWT + Turnstile + MFA. Fernet-encrypted EHR tokens. R2 downloads proxied (no signed URLs). OIG monthly refresh from CMS.',
    emoji: '🔒',
  },
  {
    id: 'integrations',
    title: 'Epic FHIR · EDI 850 · ERP push · Stripe',
    detail: 'Epic FHIR (production-ready), EDI 850 (stubbed), HTTP_POST + WEBHOOK_POST + MANUAL ERP push, Resend transactional email, Stripe billing slot ready.',
    emoji: '🔌',
  },
  {
    id: 'scale',
    title: '145 tables · 55 routes · 23 permission resources',
    detail: 'D1 SQLite at the edge. Cloudflare Workers serve from the user’s nearest colo. R2 for PHI files. KV for OIG cache. Queues for event bus. Workers AI (Llama 3.2 Vision) for medical-order extraction.',
    emoji: '⚡',
  },
  {
    id: 'audit',
    title: 'Full audit trail. No black boxes.',
    detail: 'phi_access_log, file_access_log, integration_log, workflow_activity_log, encounter_audit_logs, substitution_audit_log, controlled_substance_log. Every event is reconstructable.',
    emoji: '📜',
  },
];
