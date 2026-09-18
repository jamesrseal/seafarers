import { STATUS_COLORS } from '../utils/statusColors';

// Statuses in the ILO's order, with the colours the map draws them in, so the
// two can't drift apart.
const STATUSES = [
  ['', 'abandonment issues are ongoing.'],
  ['disputed', 'there is uncertainty or disagreement over the resolution status.'],
  ['inactive', 'no longer active, but still unresolved.'],
  ['resolved', 'the crew has been repatriated and all wages and entitlements paid.'],
];

function Section({ title, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-1 border-b border-gray-200">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-gray-600">{children}</div>
    </section>
  );
}

function Link({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
      {children}
    </a>
  );
}

export default function About() {
  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">About this site</h1>
          <p className="text-sm text-gray-500 mt-1">
            What the data is, where it comes from, and who made this.
          </p>
        </div>

        <Section title="The data">
          <p>
            Every case here comes from the{' '}
            <Link href="https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search">
              ILO/IMO Joint Database on Abandonment of Seafarers
            </Link>
            , which records reported cases of abandoned seafarers and fishers. The database was set up after a
            2004 initiative of the Joint IMO/ILO working group on liability and compensation, and it
            covers cases reported from 1 January 2004 onwards.
          </p>
        </Section>

        <Section title="What abandonment means">
          <p>
            The ILO treats a crew as abandoned when the owner of a ship or fishing vessel fails to
            pay for their journey home, leaves them without essential support and care, or leaves
            their wages unpaid for at least two months. It usually follows money trouble, or a
            vessel that costs more to keep than it is worth.
          </p>
          <p>
            Since the 2014 amendments to the Maritime Labour Convention, 2006, shipowners must carry
            insurance covering abandonment, and abandoned seafarers are entitled to up to four
            months of unpaid wages and other contractual entitlements.
          </p>
        </Section>

        <Section title="Reading the map">
          <p>
            Each dot is one case of seafarer abandonment, placed at its port of abandonment. Some port names and locations are ambiguous or blank so a best effort has been made (by me) to plot these points correctly.
            The dot grows with the number of seafarers abandoned, and fades as time passes since the case last saw activity. Its
            color is the status the ILO gives the case:
          </p>
          <ul className="space-y-1.5">
            {STATUSES.map(([status, meaning]) => (
              <li key={status} className="flex items-start gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0 mt-1"
                  style={{ background: STATUS_COLORS[status].fill, border: '1px solid #555' }}
                />
                <span>
                  <span className="font-medium text-gray-700">{STATUS_COLORS[status].label}</span> — {meaning}
                </span>
              </li>
            ))}
          </ul>
          <p>
            Click a dot to read the case: the ship, its flag and IMO number, how many seafarers were
            aboard, what was reported, and any updates since, with a link to the ILO's own record.
            The Table view lists the same cases, and the Dashboard charts them. New
            cases per month come from the date each case was notified to the ILO.
          </p>
        </Section>

        <Section title="Reporting an abandonment">
          <p>
            Cases can only be reported by flag States, port States, labour-sending States, and
            non-governmental organizations with consultative or observer status at the ILO or IMO.
            To help facilitate this process, the Report view fills in the {' '}
            <Link href="https://www.ilo.org/sites/default/files/wcmsp5/groups/public/@ed_dialogue/@sector/documents/genericdocument/wcms_531324.pdf">
              ILO's form
            </Link>{' '} and addresses it to{' '}
            <span className="font-medium text-gray-700">sector@ilo.org</span> and{' '}
            <span className="font-medium text-gray-700">abandoned@ilo.org</span>.
          </p>
          <p>
            Seafarers and fishers who need help should speak to their trade union, their consulate,
            or their flag State. The{' '}
            <Link href="https://www.itfseafarers.org/en/contact-us/help-form">
              International Transport Workers' Federation
            </Link>{' '}
            helps crews directly.
          </p>
        </Section>

        <Section title="Who made this">
          <p>
            I'm {' '}
            <Link href="https://www.thegaragediaries.com/about/">James Seal</Link>. I like to build things, and I like helping other people build things
            too. I'm a technology consultant in New York, and in my spare time I build cars, write about them, and make things like this.
          </p>
          <p>
            I started this project after reading about the{' '}
            <Link href="https://jalopnik.com/crew-of-ever-given-really-dont-want-to-spend-years-stuc-1846730643">
              crew of the Ever Given
            </Link>{' '}
            and wanting a better way to see the ILO's data than a list of rows. Abandonment is easy
            to miss one case at a time. Together, the cases are hard to ignore.
          </p>
          <p>
            More of what I make is at{' '}
            <Link href="https://www.jamesbuiltthis.com/">jamesbuiltthis.com</Link>, I write about
            cars and my other projects at{' '}
            <Link href="https://www.thegaragediaries.com/">The Garage Diaries</Link>, and my
            code is on <Link href="https://github.com/jamesrseal">GitHub</Link>.
          </p>
        </Section>

        <Section title="How it's built">
          <p>
            The map is React and{' '}
            <Link href="https://leafletjs.com/">Leaflet</Link> over{' '}
            <Link href="https://www.openstreetmap.org/copyright">OpenStreetMap</Link> tiles, served
            by a small Node and SQLite backend hosted on {' '}
            <Link href="https://www.render.com/">Render</Link>. A scraper reads the ILO site once a day, stores only
            what changed, and the site redeploys with the new data. One case a day is also posted to{' '}
            <Link href="https://bsky.app/profile/abandonedseafarers.org">Bluesky</Link>. The whole
            thing is open on{' '}
            <Link href="https://github.com/jamesrseal/seafarers">GitHub</Link>.
          </p>
        </Section>
      </div>
    </div>
  );
}
