/**
 * Single source of truth for every piece of copy, image and contact detail on
 * the RCK Group site. Edit here, run `node build.mjs`, and every page updates.
 */

export const site = {
  name: 'RCK Group',
  legalName: 'RCK Group Limited',
  tagline: 'Asphalt & concrete specialists',
  url: 'https://www.rckgroup.co.nz',
  description:
    'RCK Group is a nationwide, Auckland-based asphalt, concrete and reinstatement specialist. Family owned since 2007.',
  established: 2007,
  /** Single point of contact for the whole site. */
  contactName: 'Sam',
  phone: { display: '021 0911 5951', href: 'tel:+642109115951' },
  email: 'office@rcknz.co.nz',
  emailSales: 'sam@rcknz.co.nz',
  address: {
    street: '12 Northside Drive',
    suburb: 'Whenuapai',
    city: 'Auckland',
    postcode: '0618',
    country: 'New Zealand',
  },
  yards: [
    { name: 'Head office & yard', detail: '12 Northside Drive, Whenuapai, Auckland' },
    { name: 'Aggregate supply yard', detail: 'Silverdale, Auckland' },
  ],
  facebook: 'https://www.facebook.com/rckgroupltd',
};

export const hero = {
  eyebrow: 'Asphalt · Concrete · Reinstatement',
  headline: ['Surfaces built', 'to outlast', 'the traffic.'],
  lede:
    'A family-owned civil surfacing contractor working nationwide from Auckland. Nine in-house crews, one point of contact, and workmanship guaranteed against council and client specification.',
  image: 'assets/img/work/milling-1.jpg',
  alt: 'An RCK Group road miller and Bobcat resurfacing a residential street in Auckland',
  primary: { label: 'Request a quote', href: 'contact.html' },
  secondary: { label: 'See what we do', href: 'services.html' },
};

export const stats = [
  { value: '2007', label: 'Family owned and operated since' },
  { value: '13', label: 'Service lines delivered in-house' },
  { value: '24/7', label: 'Night, weekend and emergency works' },
  { value: 'NZ-wide', label: 'Auckland based, working nationwide' },
];

export const intro = {
  eyebrow: 'Who we are',
  headline: 'One contractor from the sub-base to the line marking.',
  body: [
    'RCK Group is a nationwide, Auckland-based asphalt, concrete and reinstatement specialist. All of our work is completed to above industry standard.',
    'We carry out full reinstatement for a range of high-profile companies as well as New Zealand government networks — from backfilling trenches, minor footpath repairs and asphalt patches, through to full road asphalting. Alongside that we take on every aspect of asphalt work: residential driveways, car parks, tennis courts and speed bump construction.',
    'The family-based business has operated since 2007 and covers the entire country. We pride our business on our safety culture and quality workmanship, which keeps strong relationships with our people, our customers and our supply partners.',
  ],
  image: 'assets/img/work/rck-2.jpg',
  alt: 'RCK Group truck and paving crew laying asphalt on a rural road',
  points: [
    'Guaranteed workmanship, built to council specification',
    'Traffic management licensed category A, B and C',
    'Programmed around you — nights and weekends where needed',
  ],
};

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

export const services = [
  {
    slug: 'asphalt-paving',
    nav: 'Asphalt paving',
    title: 'Asphalt paving',
    lede: 'Asphalt laying services across the North Island',
    summary:
      'Highways, car parks and driveways — plus reinstatement, repairs and crack sealing, all guaranteed.',
    image: 'assets/img/work/asphalt-night.jpg',
    alt: 'RCK Group crew laying asphalt at night under street lighting',
    body: [
      'RCK Group offers comprehensive asphalt laying services for all your needs. Whether it is highways, driveways, or anything in between, we handle all aspects of asphalt work. Our services include asphalt reinstatement and repairs, crack sealing, and much more.',
      'Our team of experienced professionals uses the latest equipment and techniques to deliver durable and smooth asphalt surfaces. We are committed to completing projects on time and within budget, while maintaining the highest standards of safety and quality.',
    ],
    points: [
      'New construction and asphalt overlays',
      'Asphalt reinstatement and repairs',
      'Crack sealing and preservation',
      'Driveways, car parks, tennis courts and speed bumps',
    ],
    gallery: ['assets/img/work/asphalt-1.jpg', 'assets/img/work/asphalt-2.jpg', 'assets/img/work/rck-4.jpg'],
    meta: 'Asphalt laying, overlays, reinstatement and crack sealing across Auckland and the North Island.',
  },
  {
    slug: 'road-milling',
    nav: 'Road milling & hire',
    title: 'Road miller hire',
    lede: 'Efficient solutions for roadworks',
    summary:
      'Road millers and Bobcats available for hire, with a full range of attachments and expert operators.',
    image: 'assets/img/work/milling-2.jpg',
    alt: 'RCK Group road miller removing the existing asphalt surface of a street',
    body: [
      'Whether you are working on road resurfacing, site levelling, or large-scale excavation, we have the equipment you need. Our road millers and Bobcats are available for hire, offering powerful performance for projects requiring precision and reliability.',
      'Hire our road millers and Bobcats today — contact us for competitive rates and expert support.',
    ],
    pointsTitle: 'Bobcats available for hire with a wide range of attachments',
    points: [
      'Asphalt planers',
      'Road sweepers',
      '4-in-1 buckets',
      'Site sweeping and disposal services',
    ],
    gallery: ['assets/img/work/miller.jpg', 'assets/img/work/bobcats.jpg', 'assets/img/work/milling-1.jpg'],
    meta: 'Road miller and Bobcat hire in Auckland, with asphalt planers, sweepers and 4-in-1 buckets.',
  },
  {
    slug: 'chipseal',
    nav: 'Chipseal',
    title: 'Chipseal services',
    lede: 'Why choose chipseal for your surfacing needs?',
    summary:
      'A cost-effective, durable surface for driveways and rural roads, with excellent grip and weather resistance.',
    image: 'assets/img/work/chipseal-2.jpg',
    alt: 'A freshly chipsealed driveway completed by RCK Group',
    body: [
      'RCK Group offers expert chipseal services, a cost-effective and durable solution for surfacing driveways, rural roads, and other areas. Chipseal involves applying a layer of hot bitumen, followed by a layer of aggregate chips, creating a textured surface that provides excellent grip and weather resistance.',
      'Our team ensures precise application and long-lasting results, making it a popular choice for both residential and commercial projects. Whether you need new surfacing or maintenance for existing chipseal, RCK Group delivers quality you can trust.',
    ],
    points: [
      'Driveways, rural roads and lifestyle blocks',
      'Excellent grip and weather resistance',
      'New surfacing or maintenance of existing chipseal',
      'A cost-effective alternative to full asphalt',
    ],
    gallery: ['assets/img/work/chipseal-1.jpg'],
    meta: 'Chipseal driveway and rural road surfacing in Auckland — durable, cost-effective and precisely applied.',
  },
  {
    slug: 'concrete',
    nav: 'Concrete',
    title: 'Concrete',
    lede: 'Full concrete services, from vehicle crossings to carriageways',
    summary:
      'Vehicle crossings, driveways, footpaths, road carriageways and full reinstatement — all to council spec.',
    image: 'assets/img/work/concrete-1.jpg',
    alt: 'RCK Group crew finishing a new concrete footpath',
    body: [
      'Full concrete services, vehicle crossings, driveways, footpaths, road carriageways and full reinstatement.',
      'All of our work is guaranteed, completed to council specifications, and to design requirements.',
    ],
    points: [
      'Vehicle crossings and driveways',
      'Footpaths, kerb and channel',
      'Road carriageways',
      'Full concrete reinstatement',
    ],
    gallery: ['assets/img/work/concrete-2.jpg', 'assets/img/work/concrete-3.jpg', 'assets/img/work/concrete-4.jpg'],
    meta: 'Concrete vehicle crossings, driveways, footpaths and carriageways built to council specification.',
  },
  {
    slug: 'line-marking',
    nav: 'Line marking',
    title: 'Line marking services',
    lede: 'Line marking services in Auckland',
    summary:
      'Road, car park and site marking, delivered alongside our own traffic management crews.',
    image: 'assets/img/work/linemarking-1.jpg',
    alt: 'Freshly marked road lines on a rural Auckland carriageway',
    body: [
      'Our team is experienced in all aspects of line marking. We are well-known in the industry for our quality workmanship and attention to detail.',
      'Our line marking and traffic management departments work closely together to ensure the work is completed with the highest level of safety.',
    ],
    points: [
      'Roads, car parks and industrial sites',
      'Symbols, hatching and give-way markings',
      'Delivered with our own traffic management',
      'Night and weekend works to reduce disruption',
    ],
    gallery: ['assets/img/work/linemarking-2.jpeg', 'assets/img/work/linemarking-3.jpg'],
    meta: 'Line marking for roads, car parks and industrial sites in Auckland, with in-house traffic management.',
  },
  {
    slug: 'civil-projects',
    nav: 'Civil projects',
    title: 'Civil projects',
    lede: 'Project management right through to physical works',
    summary:
      'Over 15 years delivering civil projects end to end, scaled to whatever the job needs.',
    image: 'assets/img/work/projects.jpg',
    alt: 'An RCK Group civil project underway',
    body: [
      'We undertake a wide range of civil projects to suit our clients’ needs. We have over 15 years of experience from project management right through to physical works.',
      'Get in touch to discuss your civil requirements.',
    ],
    points: [
      'Project management and programming',
      'Full physical works delivery',
      'Subdivision and site works',
      'Commercial and residential clients',
    ],
    gallery: ['assets/img/work/rck-3.jpg', 'assets/img/work/rck-1.jpg'],
    meta: 'Civil project delivery in Auckland and nationwide — from project management through to physical works.',
  },
  {
    slug: 'recycled-road-millings',
    nav: 'Recycled road millings',
    title: 'Recycled road millings',
    lede: 'A better finish than gravel, for less than the cost of sealing',
    summary:
      'Recycled asphalt for driveways, farm races and parking areas — available for sale from our Auckland yard.',
    image: 'assets/img/work/rck-1.jpg',
    alt: 'Recycled road millings stockpiled at the RCK Group Auckland yard',
    body: [
      'Our use of recycled asphalt has many advantages over the use of conventional gravel.',
      'Our recycled asphalt is also available for sale from our Auckland yard. Contact us for more information.',
    ],
    points: [
      'Reduced dust kick-up on driveways, farm races and parking areas',
      'Compacts down and lasts longer than traditional gravel',
      'A great compacted finish, at less than typical sealing costs',
      'Available for sale from our Auckland yard',
    ],
    gallery: [],
    meta: 'Recycled asphalt road millings for driveways, farm races and parking areas — supplied from Auckland.',
  },
  {
    slug: 'road-reinstatement',
    nav: 'Road reinstatement',
    title: 'Road reinstatement',
    lede: 'Road reinstatement in Auckland and nationwide',
    summary:
      'Full reinstatement of roads, footpaths, parks and reserves after utility and construction works.',
    image: 'assets/img/work/reinstatement-1.jpeg',
    alt: 'RCK Group reinstating a section of road surface after utility works',
    body: [
      'RCK Group specialises in full reinstatement for roading, footpaths, parks and reserves after construction or repair work has taken place from a range of utility services and construction services.',
      'RCK uses the skills of its other departments to ensure that work is completed to a high standard, meeting council and clients’ requirements, and workplace health and safety.',
    ],
    points: [
      'Trench backfill and permanent reinstatement',
      'Footpaths, berms, parks and reserves',
      'Asphalt and concrete reinstatement',
      'Council and utility network compliance',
    ],
    gallery: ['assets/img/work/rck-4.jpg'],
    meta: 'Full road, footpath and reserve reinstatement after utility and construction works, to council standard.',
  },
  {
    slug: 'traffic-management',
    nav: 'Traffic management',
    title: 'Traffic management',
    lede: 'Full traffic control services available for hire',
    summary:
      'Licensed category A, B and C traffic control, event management and 24/7 emergency call-outs.',
    image: 'assets/img/work/rck-3.jpg',
    alt: 'Traffic management set up around an RCK Group work site',
    body: [
      'Traffic control — full traffic control services available for hire, delivered by our own licensed crews and coordinated with the works on site.',
    ],
    points: [
      'Licensed category A, B and C',
      'Event traffic management',
      'Emergency call-outs',
      '24/7 traffic management availability as required',
    ],
    gallery: ['assets/img/work/linemarking-1.jpg'],
    meta: 'Licensed category A, B and C traffic management and event traffic control, available 24/7 in Auckland.',
  },
];

/** Additional service lines listed on the services index but without full pages. */
export const alsoOffer = [
  {
    title: 'Hard surface sweeping',
    body:
      'Car parks, outdoor recreation areas, pathways and storage areas — regular maintenance to keep any hard surface looking its best.',
  },
  {
    title: 'Joint & crack sealing',
    body:
      'Sealing cracks prevents water getting into unwanted areas and causing further deterioration. Crack sealing is the single most important step in asphalt preservation.',
  },
  {
    title: 'Aggregate supply & clean fill',
    body:
      'An aggregate, scoria and sand supply yard in Silverdale. We take clean fill away from site and back-load any of our full range of products.',
  },
  {
    title: 'Freight & machinery haulage',
    body:
      'Moving big machinery and large or heavy equipment around the country. We move vehicles in Auckland and right across New Zealand.',
  },
];

/* ------------------------------------------------------------------ *
 * Supporting sections
 * ------------------------------------------------------------------ */

export const approach = {
  eyebrow: 'How we work',
  headline: 'Programmed around your site, not ours.',
  lede:
    'All of our work is programmed to cause as minimal disruption to our customers as possible. That includes night works and weekend work where required.',
  steps: [
    {
      n: '01',
      title: 'Scope and quote',
      body: 'We walk the site, confirm the specification and give you a clear price with no assumptions buried in it.',
    },
    {
      n: '02',
      title: 'Programme and traffic management',
      body: 'Our own licensed category A, B and C crews plan the traffic management around your operating hours.',
    },
    {
      n: '03',
      title: 'Physical works',
      body: 'Milling, reinstatement, surfacing, concrete and line marking delivered by in-house crews under one contact.',
    },
    {
      n: '04',
      title: 'Sign-off and guarantee',
      body: 'Work is completed to council specification and design requirement, and our workmanship is guaranteed.',
    },
  ],
};

export const accreditations = {
  eyebrow: 'Safety and accreditation',
  headline: 'A safety culture our clients can audit.',
  body:
    'We pride our business on our company safety culture and quality workmanship. RCK Group holds current SiteWise and Tōtika prequalification, and every job is delivered to workplace health and safety requirements alongside council and client specification.',
  image: 'assets/img/brand/sitewise-totika.png',
  alt: 'SiteWise and Tōtika prequalification badges held by RCK Group',
};

export const clients = {
  eyebrow: 'Trusted by',
  headline: 'RCK Group is proud to work with',
  logos: [
    { name: 'Fulton Hogan', file: 'assets/img/brand/fulton-hogan.png' },
    { name: 'Downer Group', file: 'assets/img/brand/downer.png' },
    { name: 'Ventia', file: 'assets/img/brand/ventia.png' },
    { name: 'Higgins', file: 'assets/img/brand/higgins.jpg' },
    { name: 'Citycare Group', file: 'assets/img/brand/citycare.png' },
    { name: 'Amotai', file: 'assets/img/brand/amotai.png' },
  ],
};

export const gallery = {
  eyebrow: 'Some examples of the work we do',
  headline: 'On the tools, around the motu.',
  lede:
    'A few photos of recent asphalt, concrete, milling and reinstatement work. There is more on our Facebook page.',
  images: [
    { file: 'assets/img/work/milling-1.jpg', alt: 'Road miller and Bobcat resurfacing a residential street' },
    { file: 'assets/img/work/rck-2.jpg', alt: 'RCK Group truck and paver working on a rural road' },
    { file: 'assets/img/work/asphalt-night.jpg', alt: 'Asphalt laying at night under street lighting' },
    { file: 'assets/img/work/concrete-1.jpg', alt: 'New concrete footpath being finished' },
    { file: 'assets/img/work/linemarking-1.jpg', alt: 'Freshly marked road lines on a rural carriageway' },
    { file: 'assets/img/work/chipseal-2.jpg', alt: 'Completed chipseal driveway surfacing' },
    { file: 'assets/img/work/milling-2.jpg', alt: 'Milling the existing asphalt surface off a street' },
    { file: 'assets/img/work/reinstatement-1.jpeg', alt: 'Reinstating road surface after utility works' },
    { file: 'assets/img/work/concrete-2.jpg', alt: 'Concrete pour underway on a residential site' },
    { file: 'assets/img/work/rck-3.jpg', alt: 'RCK Group crew and plant on site' },
    { file: 'assets/img/work/bobcats.jpg', alt: 'Bobcat with attachments available for hire' },
    { file: 'assets/img/work/asphalt-1.jpg', alt: 'Asphalt paving detail work' },
    { file: 'assets/img/work/concrete-3.jpg', alt: 'Concrete vehicle crossing under construction' },
    { file: 'assets/img/work/linemarking-2.jpeg', alt: 'Line marking a car park' },
    { file: 'assets/img/work/rck-4.jpg', alt: 'RCK Group asphalt works in progress' },
    { file: 'assets/img/work/chipseal-1.jpg', alt: 'Chipseal surfacing on a rural road' },
  ],
};

export const about = {
  eyebrow: 'About us',
  headline: 'A family business that has been surfacing New Zealand since 2007.',
  image: 'assets/img/work/rck-2.jpg',
  alt: 'RCK Group truck and paving crew at work',
  body: [
    'RCK Group is a nationwide, Auckland-based, asphalt, concrete and reinstatement specialist company. All of our work is completed to above industry standard.',
    'We carry out full reinstatement for a range of high-profile companies, as well as New Zealand government networks: from backfilling trenches, minor footpath repairs and asphalt patches, to full road asphalting. In addition to these services, we also undertake all aspects of asphalt work — for example residential driveways, car parks, tennis courts and speed bump construction.',
    'The family-based business has operated since 2007 and covers the entire country. We pride our business on our company safety culture and quality workmanship, which keeps strong relationships with our people, customers and supply partners.',
  ],
  values: [
    {
      title: 'Family owned',
      body: 'Operating since 2007 and still run by the family that started it. You deal with the people accountable for the work.',
    },
    {
      title: 'Everything in-house',
      body: 'Thirteen service lines under one roof means fewer subcontractors, tighter programmes and one point of contact.',
    },
    {
      title: 'Safety first',
      body: 'SiteWise and Tōtika prequalified, with licensed category A, B and C traffic management on our own books.',
    },
    {
      title: 'Guaranteed workmanship',
      body: 'Completed to council specification and design requirement, and backed by our guarantee.',
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Company structure and people
 * ------------------------------------------------------------------ */

/**
 * How the business is organised. These six divisions group the thirteen
 * service lines, and match how the existing site describes the company —
 * "RCK uses the skills of its other departments", "our line marking and
 * traffic management departments work closely together".
 *
 * `lead` names the person who runs that division. Leave it empty and the
 * card simply omits the line — fill them in as you are ready to publish names.
 */
export const structure = {
  eyebrow: 'How we are structured',
  headline: 'Six divisions, one programme.',
  lede:
    'Thirteen service lines sit under six in-house divisions. Because they are all ours, a job that needs milling, reinstatement, concrete and marking is one programme and one point of contact — not four subcontractors and four invoices.',
  divisions: [
    {
      name: 'Surfacing',
      covers: 'Asphalt paving, overlays, chipseal, crack and joint sealing',
      body: 'Highways, car parks, driveways and everything between, laid to council specification and guaranteed.',
      lead: '',
    },
    {
      name: 'Reinstatement',
      covers: 'Trench backfill, footpaths, berms, parks and reserves',
      body: 'Full reinstatement after utility and construction works for high-profile companies and New Zealand government networks.',
      lead: '',
    },
    {
      name: 'Concrete',
      covers: 'Vehicle crossings, driveways, footpaths, carriageways',
      body: 'Formed, poured and finished to council specification and design requirement.',
      lead: '',
    },
    {
      name: 'Plant & milling',
      covers: 'Road millers, Bobcats, attachments, hard surface sweeping',
      body: 'Our own machines and operators, available on our jobs or for hire on yours.',
      lead: '',
    },
    {
      name: 'Traffic management',
      covers: 'Category A, B and C traffic control, events, line marking',
      body: 'Licensed crews on our own books, planning the site around your operating hours. Available 24/7.',
      lead: '',
    },
    {
      name: 'Supply & haulage',
      covers: 'Aggregate, scoria, sand, recycled millings, clean fill, transport',
      body: 'Supply yard in Silverdale, clean fill taken away, and machinery moved anywhere in the country.',
      lead: '',
    },
  ],
};

/**
 * The people page. `Sam` is the point of contact for the business.
 *
 * To add someone, copy the shape below. `photo` is optional — leave it out
 * and the card falls back to a typographic initial, so the grid stays tidy
 * until you have proper photography:
 *
 *   {
 *     name: 'Jane Smith',
 *     role: 'Contracts manager',
 *     covers: 'Reinstatement and concrete',
 *     phone: { display: '021 000 0000', href: 'tel:+6421000000' },
 *     email: 'jane@rcknz.co.nz',
 *     photo: 'assets/img/team/jane.jpg',
 *   }
 */
export const team = {
  eyebrow: 'The team',
  headline: 'You deal with the people doing the work.',
  lede:
    'A family business since 2007, which in practice means the person who prices your job is the person accountable for it. No call centre, no account manager two steps removed from the site.',
  people: [
    {
      name: 'Sam',
      role: 'Point of contact',
      covers: 'Quotes, programming and new work across every division',
      phone: { display: '021 0911 5951', href: 'tel:+642109115951' },
      email: 'sam@rcknz.co.nz',
      photo: '',
    },
  ],
  /** Shown under the grid — the honest version of "we are hiring / more to come". */
  note:
    'Crew leads and division managers are listed as we add their details. For anything urgent, Sam is the fastest way in.',
};

export const contact = {
  eyebrow: 'Contact us',
  headline: 'Tell us about the job.',
  lede:
    'Send through the details and we will come back to you with a price and a programme. For urgent works and after-hours call-outs, phone us directly.',
  /**
   * Where the contact form posts. Replace with your Formspree / Netlify /
   * server endpoint. Left empty, the form falls back to opening an email.
   */
  formEndpoint: '',
};

export const nav = [
  { label: 'What we do', href: 'services.html', children: services.map((s) => ({ label: s.nav, href: `${s.slug}.html` })) },
  { label: 'About', href: 'about.html' },
  { label: 'Gallery', href: 'gallery.html' },
  { label: 'Contact', href: 'contact.html' },
];
